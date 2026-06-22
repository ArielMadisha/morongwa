import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";
import TVPost from "../src/data/models/TVPost";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const APPLY = process.argv.includes("--apply");
const ONLY_AI_NEWS = process.argv.includes("--ai-news-only");

function normalizeTag(input: unknown): string {
  return String(input || "")
    .trim()
    .replace(/^#+/, "")
    .replace(/\s+/g, "")
    .slice(0, 80);
}

function normalizeTags(input: unknown): string[] {
  const raw = Array.isArray(input) ? input : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tag of raw) {
    const clean = normalizeTag(tag);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}

function arraysEqualCaseSensitive(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

async function main() {
  const mongoUri = String(process.env.MONGO_URI || "").trim();
  if (!mongoUri) {
    console.error("MONGO_URI not set");
    process.exit(1);
  }

  await mongoose.connect(mongoUri);

  const query: Record<string, unknown> = {
    hashtags: { $exists: true, $type: "array", $ne: [] },
  };
  if (ONLY_AI_NEWS) query.isAiNews = true;

  const rows = await TVPost.find(query).select("_id hashtags isAiNews heading").lean();
  let needsUpdate = 0;
  const updates: Array<{ id: string; from: string[]; to: string[] }> = [];

  for (const row of rows as Array<{ _id: unknown; hashtags?: unknown[] }>) {
    const before = Array.isArray(row.hashtags) ? row.hashtags.map((t) => String(t)) : [];
    const after = normalizeTags(before);
    if (!arraysEqualCaseSensitive(before, after)) {
      needsUpdate += 1;
      updates.push({ id: String(row._id), from: before, to: after });
    }
  }

  console.log(`Scanned TV posts with hashtags: ${rows.length}`);
  console.log(`Posts requiring normalization: ${needsUpdate}`);
  if (updates.length > 0) {
    console.log("\nPreview (first 10):");
    for (const u of updates.slice(0, 10)) {
      console.log(`- ${u.id}`);
      console.log(`  from: [${u.from.join(", ")}]`);
      console.log(`  to:   [${u.to.join(", ")}]`);
    }
  }

  if (!APPLY) {
    console.log("\nDry run only. Re-run with --apply to write updates.");
    await mongoose.disconnect();
    return;
  }

  let updated = 0;
  for (const u of updates) {
    await TVPost.updateOne({ _id: u.id }, { $set: { hashtags: u.to } });
    updated += 1;
  }
  console.log(`\nUpdated posts: ${updated}`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore
  }
  process.exit(1);
});
