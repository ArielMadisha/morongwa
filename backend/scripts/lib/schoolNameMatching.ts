/**
 * School folder name ↔ User.name matching (exact, dedupe-key, token/fuzzy).
 */

export function cleanFolderLabel(name: string): string {
  return name
    .trim()
    .replace(/\s*\(\d+\)\s*$/i, "")
    .replace(/\s+/g, " ");
}

export function normName(name: string): string {
  return cleanFolderLabel(name)
    .replace(/\s*\(GIS\)/gi, " (GIS)")
    .replace(/\s*GIS\s*$/i, " (GIS)");
}

/** Alphanumeric key — initials like A.B. collapse to AB. */
export function matchKey(name: string): string {
  return normName(name)
    .toUpperCase()
    .replace(/\b([A-Z])\s*\.\s*(?=[A-Z])/g, "$1")
    .replace(/[^A-Z0-9]/g, "");
}

const MIN_SUBKEY = 8;

/** Too generic for substring dedupe alone (e.g. “Agricultural College” vs “Abambo Agricultural”). */
const GENERIC_DEDUPE_KEYS = new Set([
  "agricultural",
  "agriculture",
  "primary",
  "secondary",
  "combined",
  "college",
  "high",
  "public",
  "private",
  "christian",
  "community",
  "international",
]);

/** Core place name without level words (school, primary, college, …). */
export function schoolDedupeKey(name: string): string {
  return normName(name)
    .toLowerCase()
    .replace(/\bcjss\b/g, "")
    .replace(/\bc\.?j\.?s\.?s\.?\b/g, "")
    .replace(/\bcommunity\b/g, "")
    .replace(/\bjunior\b/g, "")
    .replace(/\bsecondary\b/g, "")
    .replace(/\bhigh\b/g, "")
    .replace(/\bprimary\b/g, "")
    .replace(/\bpreparatory\b/g, "")
    .replace(/\bpre[- ]?primary\b/g, "")
    .replace(/\bschool\b/g, "")
    .replace(/\bcollege\b/g, "")
    .replace(/\bacademy\b/g, "")
    .replace(/\bnursery\b/g, "")
    .replace(/\binstitute\b/g, "")
    .replace(/\bmedium\b/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

export function keysConflict(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  if (GENERIC_DEDUPE_KEYS.has(a) || GENERIC_DEDUPE_KEYS.has(b)) return false;
  const L = MIN_SUBKEY;
  const short = a.length <= b.length ? a : b;
  const long = a.length <= b.length ? b : a;
  if (short.length >= L && long.includes(short) && short.length >= long.length * 0.6) return true;
  return false;
}

const STOP_TOKENS = new Set([
  "school",
  "schools",
  "skool",
  "laerskool",
  "hoerskool",
  "horskool",
  "primary",
  "secondary",
  "high",
  "college",
  "academy",
  "nursery",
  "pre",
  "the",
  "of",
  "and",
  "for",
  "at",
  "in",
  "no",
  "ext",
  "extension",
  "campus",
  "centre",
  "center",
  "laerskool",
  "hoerskool",
  "hoërskool",
  "skool",
  "international",
  "internasionale",
]);

export function significantTokens(name: string): string[] {
  return normName(name)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOP_TOKENS.has(t));
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const row = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) row[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = row[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost);
      prev = tmp;
    }
  }
  return row[n];
}

function levenshteinRatio(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const d = levenshtein(a, b);
  return 1 - d / Math.max(a.length, b.length);
}

function tokenJaccard(a: string, b: string): number {
  const ta = new Set(significantTokens(a));
  const tb = new Set(significantTokens(b));
  if (!ta.size && !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = ta.size + tb.size - inter;
  return union ? inter / union : 0;
}

export type MatchMethod =
  | "exact_key"
  | "exact_name"
  | "dedupe_key"
  | "dedupe_subkey"
  | "fuzzy";

export type SchoolMatchCandidate = {
  userId: string;
  name: string;
  score: number;
  method: MatchMethod;
};

export function scoreSchoolNamePair(folderLabel: string, userName: string): number {
  const fk = matchKey(folderLabel);
  const uk = matchKey(userName);
  if (fk && uk && fk === uk) return 1;
  if (cleanFolderLabel(folderLabel).toUpperCase() === cleanFolderLabel(userName).toUpperCase()) return 0.99;

  const fd = schoolDedupeKey(folderLabel);
  const ud = schoolDedupeKey(userName);
  if (fd && ud && fd === ud) return 0.97;
  if (fd && ud && keysConflict(fd, ud)) return 0.92;

  const keySim = levenshteinRatio(fk, uk);
  const tokenSim = tokenJaccard(folderLabel, userName);
  const dedupeSim = fd && ud ? levenshteinRatio(fd, ud) : 0;

  return Math.max(keySim * 0.85 + tokenSim * 0.15, dedupeSim * 0.9 + tokenSim * 0.1, tokenSim * 0.88);
}

/** Folder name has extra campus/branch tokens vs matched user — prefer a new account. */
export function folderImpliesDistinctCampus(folderLabel: string, userName: string): boolean {
  const fTok = significantTokens(folderLabel);
  const uTok = significantTokens(userName);
  const uSet = new Set(uTok);
  const extra = fTok.filter((t) => !uSet.has(t));
  return extra.length >= 2;
}

export function rankSchoolMatches(
  folderLabel: string,
  users: Array<{ _id: string; name: string }>
): SchoolMatchCandidate[] {
  const ranked: SchoolMatchCandidate[] = [];
  const fk = matchKey(folderLabel);
  const fd = schoolDedupeKey(folderLabel);
  const upper = cleanFolderLabel(folderLabel).toUpperCase();

  for (const u of users) {
    const name = String(u.name || "").trim();
    if (!name) continue;

    let method: MatchMethod = "fuzzy";
    let score = scoreSchoolNamePair(folderLabel, name);

    if (matchKey(name) === fk && fk) {
      method = "exact_key";
      score = 1;
    } else if (cleanFolderLabel(name).toUpperCase() === upper) {
      method = "exact_name";
      score = 0.99;
    } else if (schoolDedupeKey(name) === fd && fd) {
      method = "dedupe_key";
      score = 0.97;
    } else if (fd && keysConflict(fd, schoolDedupeKey(name))) {
      method = "dedupe_subkey";
      score = Math.max(score, 0.92);
    }

    if (score >= 0.72) {
      ranked.push({ userId: String(u._id), name, score, method });
    }
  }

  ranked.sort((a, b) => b.score - a.score);
  return ranked;
}

export const FUZZY_AUTO_MATCH_MIN = 0.86;
export const FUZZY_AMBIGUITY_GAP = 0.04;

export function pickBestRankedMatch(
  folderLabel: string,
  ranked: SchoolMatchCandidate[]
): SchoolMatchCandidate | null {
  if (!ranked.length) return null;
  const top = ranked[0];
  const second = ranked[1];

  if (second && top.score - second.score < FUZZY_AMBIGUITY_GAP && top.score < 0.98) {
    return null;
  }
  if (top.score < FUZZY_AUTO_MATCH_MIN) return null;

  if (folderImpliesDistinctCampus(folderLabel, top.name) && top.score < 0.98) {
    return null;
  }

  return top;
}

/** OSM/scrape placeholders and other non-school folder names under the Schools root. */
export function isJunkSchoolGalleryFolderName(name: string): boolean {
  const n = cleanFolderLabel(name);
  if (!n) return true;
  if (/^School\s+school\s+w\d+$/i.test(n)) return true;
  return false;
}

/** Top-level directory names eligible for gallery batch/daily import listing. */
export function isSchoolGalleryRootEntryName(name: string): boolean {
  const t = String(name || "").trim();
  if (!t || t.startsWith(".") || t.startsWith("__")) return false;
  if (/^__pycache__$/i.test(t)) return false;
  if (isJunkSchoolGalleryFolderName(t)) return false;
  return true;
}

/** Windows duplicate copy suffix when the base folder also exists (e.g. "Foo (2)"). */
export function isWindowsDuplicateCopyFolderName(name: string, siblingNames: ReadonlySet<string>): boolean {
  const m = String(name || "").trim().match(/^(.+?)\s+\((\d+)\)$/);
  if (!m) return false;
  const base = m[1].trim();
  if (!base) return false;
  for (const s of siblingNames) {
    if (s === base || s.toLowerCase() === base.toLowerCase()) return true;
  }
  return false;
}

/** Batch import: treat folder as a school if it has photos (relaxed vs public-profile heuristic). */
export function isImportableSchoolFolder(name: string): boolean {
  if (isJunkSchoolGalleryFolderName(name)) return false;
  const n = cleanFolderLabel(name);
  if (n.length < 3) return false;
  const upper = n.toUpperCase();
  if (/^(A-?BLOCK|BLOCK\s+[A-Z0-9]+)$/i.test(n)) return false;
  if (/^AFTER\s*(SCHOOL|CARE)\s*(CENTRE|CENTER)?$/i.test(n)) return false;
  if (/\b(SCHOOL|COLLEGE|ACADEMY|NURSERY|INSTITUTE|UNIVERSITY|CAMPUS|HIGH|PRIMARY|SECONDARY|PREPARATORY|KINDERGARTEN|CRECHE|DAYCARE|EDUCATION|LEARNING)\b/i.test(upper)) {
    return true;
  }
  if (/\b(LAERSKOOL|HOËRSKOOL|HOERSKOOL|PRIMÊRE\s+SKOOL|PRIMERE\s+SKOOL|KOMBINASIE\s+SKOOL|KOMBINASIESKOOL|SKOOL)\b/i.test(upper)) return true;
  if (/\bJ\.?\s*S\.?\s*S\.?\b/i.test(upper)) return true;
  return n.length >= 6;
}
