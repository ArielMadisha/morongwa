/** Max tags stored per TV post (explicit + parsed from text). */
export const TV_HASHTAG_MAX_PER_POST = 30;

/** Single-letter tags like `#a` are ignored in trending/related lists. */
export const TV_HASHTAG_MIN_TRENDING_LEN = 2;

const TAG_IN_TEXT = /#([A-Za-z0-9_][A-Za-z0-9_]*)/g;
const VALID_TAG = /^[a-z0-9_][a-z0-9_]*$/;

function cleanTag(raw: string): string | null {
  const t = raw.trim().replace(/^#/, "").toLowerCase();
  if (!t || t.length > 80) return null;
  if (!VALID_TAG.test(t)) return null;
  return t;
}

/** Pull `#tags` from free text (caption, subject, heading). */
export function extractHashtagsFromTexts(...parts: (string | undefined | null)[]): string[] {
  const seen = new Set<string>();
  for (const part of parts) {
    if (!part) continue;
    const text = String(part);
    TAG_IN_TEXT.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = TAG_IN_TEXT.exec(text))) {
      const tag = cleanTag(m[1]);
      if (tag) seen.add(tag);
    }
  }
  return [...seen];
}

/** Merge explicit hashtag array with tags parsed from post text fields. */
export function normalizeTvHashtags(
  explicit?: unknown,
  ...texts: (string | undefined | null)[]
): string[] | undefined {
  const seen = new Set<string>();
  if (Array.isArray(explicit)) {
    for (const entry of explicit) {
      if (typeof entry !== "string") continue;
      const tag = cleanTag(entry);
      if (tag) seen.add(tag);
    }
  }
  for (const tag of extractHashtagsFromTexts(...texts)) {
    seen.add(tag);
  }
  const list = [...seen].slice(0, TV_HASHTAG_MAX_PER_POST);
  return list.length ? list : undefined;
}

export function escapeRegexLiteral(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Case-insensitive exact match for a tag in the `hashtags` string array. */
export function hashtagArrayTagRegex(raw: string): RegExp {
  return new RegExp(`^${escapeRegexLiteral(raw)}$`, "i");
}

/** Match `#tag` in caption/subject/heading (legacy posts may only have tags in text). */
export function captionHashtagRegex(raw: string): RegExp {
  const escaped = escapeRegexLiteral(raw.replace(/^#/, "").trim());
  return new RegExp(`#${escaped}(?![\\w])`, "i");
}

/** Mongo `$match` fragment: approved posts that use this hashtag. */
export function hashtagPostMatchClause(tag: string): Record<string, unknown> {
  const tagRegex = hashtagArrayTagRegex(tag);
  const inText = captionHashtagRegex(tag);
  return {
    $or: [{ hashtags: tagRegex }, { caption: inText }, { subject: inText }, { heading: inText }],
  };
}
