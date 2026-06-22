/**
 * TV caption + hashtags for school profile/gallery posts (Boitshepo-style).
 */

export function normalizeSchoolDisplayName(name: string): string {
  const trimmed = String(name || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\s*\(\d+\)\s*$/i, "");
  if (!trimmed) return "";
  const letters = trimmed.replace(/[^A-Za-z]/g, "");
  if (letters.length >= 4 && letters === letters.toUpperCase()) {
    return trimmed
      .split(/\s+/)
      .map((w) => {
        const clean = w.replace(/[^A-Za-z]/g, "");
        if (clean.length > 0 && clean.length <= 5 && clean === clean.toUpperCase()) {
          return clean;
        }
        return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
      })
      .join(" ");
  }
  return trimmed;
}

function formatHashtagWord(word: string): string {
  const w = word.replace(/[^a-zA-Z0-9]/g, "");
  if (!w) return "";
  if (/^[A-Z0-9]{2,6}$/.test(w) && w === w.toUpperCase()) return w;
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
}

export function buildSchoolTvHashtags(schoolName: string): string[] {
  const display = normalizeSchoolDisplayName(schoolName);
  const words = display
    .split(/\s+/)
    .map(formatHashtagWord)
    .filter(Boolean);

  if (!words.length) return ["School", "Schoolschool"];

  const first = words[0];
  if (words.length === 1) {
    const lower = first.toLowerCase();
    if (lower.endsWith("school") || lower.endsWith("college") || lower.endsWith("academy")) {
      return [first];
    }
    return [first, `${first}school`];
  }

  const rest = words
    .slice(1)
    .map((w) => w.toLowerCase())
    .join("");
  const compound = `${first}${rest}`;
  if (compound.toLowerCase() === first.toLowerCase()) return [first];
  return [first, compound];
}

export function buildSchoolTvCaption(schoolName: string): string {
  return normalizeSchoolDisplayName(schoolName) || "School";
}

export function formatSchoolTvHashtagLine(schoolName: string): string {
  return buildSchoolTvHashtags(schoolName)
    .map((t) => `#${t}`)
    .join(" ");
}
