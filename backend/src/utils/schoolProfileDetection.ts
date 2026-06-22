/**
 * Public profile / donate UX: treat an account as a school-style institution when
 * the explicit DB flag is set, or the display name looks like a school page.
 * Imported school rows often omit `isSchoolAccount`; profile-stats merges this inference.
 */

import { isKnownSchoolAccountName } from "./knownSchoolAliases";

/** School name is only digits (e.g. phone number stored as name) — not a real institution label. */
export function isNumericOnlyInstitutionName(name: string | undefined | null): boolean {
  const n = (name || "").trim();
  if (!n) return false;
  return /^\d+$/.test(n);
}

/** Strip accents / mojibake so corrupted DB names still match school heuristics. */
function normalizeInstitutionNameForMatch(name: string): string {
  return String(name || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\uFFFD/g, "")
    .replace(/Ã./g, "")
    .replace(/[^A-Za-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export function looksLikeSchoolInstitutionName(name: string | undefined | null): boolean {
  const n = (name || "").trim();
  if (n.length < 4) return false;
  const upper = n.toUpperCase();
  const folded = normalizeInstitutionNameForMatch(n);

  if (/\bSCHOOL\b/.test(upper) || /\bSCHOOL\b/.test(folded)) return true;
  if (/\b(LAERSKOOL|SKOOL|HO[EËÊÔ]RSKOOL|RSKOOL|SEKOND[EÊ]RE\s*SKOOL|PRIM[EÊ]RE\s*SKOOL|KOMBINE(E)?\s*SKOOL)\b/.test(upper)) return true;
  if (/\b(LAERSKOOL|SKOOL|HOERSKOOL|RSKOOL|SEKONDERE SKOOL|PRIMERE SKOOL|KOMBINASIE SKOOL|KOMBINASIESKOOL)\b/.test(folded)) return true;
  if (/\b(NURSERY|PRE[- ]?PRIMARY|PRIMARY|SECONDARY|HIGH|COMBINED|INTERMEDIATE)\s+SCHOOL\b/.test(upper)) return true;
  if (/\b(J\.?\s*S\.?\s*S\.?|JSS|NSSC)\b/.test(upper)) return true;
  if (/\b(COLLEGE|ACADEMY|POLYTECHNIC|TECHNICAL\s+COLLEGE)\b/.test(upper)) return true;
  // Afrikaans / regional school labels (common in ZA legacy imports)
  if (/\b(LAERSKOOL|HOËRSKOOL|HOERSKOOL|PRIMÊRE\s+SKOOL|PRIMERE\s+SKOOL|KOMBINASIE\s+SKOOL|KOMBINASIESKOOL|SKOOL)\b/.test(upper)) return true;

  return false;
}

export function inferIsSchoolAccountForPublicProfile(user: {
  isSchoolAccount?: boolean;
  name?: string;
}): boolean {
  if (isNumericOnlyInstitutionName(user.name)) return false;
  if (user.isSchoolAccount === true) return true;
  if (isKnownSchoolAccountName(user.name)) return true;
  return looksLikeSchoolInstitutionName(user.name);
}

/** Legacy import or flagged school whose institution name is only digits. */
export function isInvalidNumericSchoolAccount(user: {
  isSchoolAccount?: boolean;
  name?: string;
  email?: string | null;
  importedFromLegacy?: boolean;
}): boolean {
  if (!isNumericOnlyInstitutionName(user.name)) return false;
  if (user.isSchoolAccount === true) return true;
  if (user.importedFromLegacy === true) return true;
  if (/^legacy\+/i.test(String(user.email || "").trim())) return true;
  return false;
}
