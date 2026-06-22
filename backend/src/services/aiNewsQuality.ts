/** Detect headlines/body text cut mid-sentence (e.g. RSS title sliced at 140 chars). */
export function looksTruncatedText(text: string): boolean {
  const t = String(text || "").trim();
  if (!t) return true;
  if (/[.!?…"'")\]]\s*$/.test(t)) return false;
  if (/\s(an|a|the|to|of|in|on|at|by|or|and|for|with|as|is|was|were|be)\s+[a-z]{1,2}$/i.test(t)) {
    return true;
  }
  if (/\s[a-zA-Z]{1,2}$/.test(t)) return true;
  return false;
}

function wordCount(text: string): number {
  return String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

export function isCompleteAiNewsContent(fields: {
  heading?: string;
  subject?: string;
  caption?: string;
}): boolean {
  const heading = String(fields.heading || "").trim();
  const summary = String(fields.subject || "").trim();
  const caption = String(fields.caption || "").trim();

  if (!heading || wordCount(heading) < 4) return false;
  if (looksTruncatedText(heading)) return false;

  const summaryWords = wordCount(summary);
  if (summaryWords < 40) return false;
  if (looksTruncatedText(summary)) return false;

  // RSS emergency fallback pattern: duplicate headline, thin body
  if (caption && heading && caption === heading && summaryWords < 60) return false;

  return true;
}

export function isIncompleteAiNewsPost(post: {
  isAiNews?: boolean;
  heading?: string;
  subject?: string;
  caption?: string;
}): boolean {
  if (!post?.isAiNews) return false;
  return !isCompleteAiNewsContent(post);
}
