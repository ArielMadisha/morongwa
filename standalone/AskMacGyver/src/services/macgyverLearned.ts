import MacGyverLearnedEntry, { MacGyverWebSource } from "../data/models/MacGyverLearnedEntry";

/** Stable key for matching repeat questions to the expandable MacGyver library. */
export function normalizeMacGyverQueryKey(query: string): string {
  return query
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .slice(0, 500);
}

function learnedMaxAgeMs(): number {
  const raw = process.env.MACGYVER_LEARNED_MAX_AGE_MS;
  const n = raw ? parseInt(raw, 10) : NaN;
  if (Number.isFinite(n) && n >= 0) return n;
  return 24 * 60 * 60 * 1000; // 24h default — keeps answers fresh while expanding the library
}

/**
 * Returns a cached answer from the learned library when fresh enough.
 */
export async function findFreshLearnedAnswer(query: string): Promise<string | null> {
  const queryKey = normalizeMacGyverQueryKey(query);
  if (!queryKey) return null;

  const doc = await MacGyverLearnedEntry.findOne({ queryKey }).lean();
  if (!doc?.answer) return null;

  const maxAge = learnedMaxAgeMs();
  if (maxAge === 0) return null;
  const age = Date.now() - new Date(doc.synthesizedAt).getTime();
  if (age > maxAge) return null;

  await MacGyverLearnedEntry.updateOne(
    { _id: doc._id },
    { $inc: { hitCount: 1 }, $set: { lastHitAt: new Date() } }
  ).catch(() => {});

  return doc.answer;
}

/**
 * Persist successful MacGyver answers so the library grows with real searches.
 */
export async function upsertMacGyverLearned(params: {
  query: string;
  answer: string;
  webSources?: MacGyverWebSource[];
}): Promise<void> {
  const queryKey = normalizeMacGyverQueryKey(params.query);
  if (!queryKey || !params.answer?.trim()) return;

  const answer = params.answer.trim().slice(0, 32000);
  const now = new Date();

  await MacGyverLearnedEntry.findOneAndUpdate(
    { queryKey },
    {
      $set: {
        originalQuery: params.query.trim().slice(0, 2000),
        answer,
        webSources: params.webSources?.length ? params.webSources.slice(0, 12) : [],
        synthesizedAt: now,
      },
      $setOnInsert: { hitCount: 0 },
    },
    { upsert: true }
  ).catch(() => {});
}

