import {
  hasLegacyNumericUsername,
  isAutoImportGalleryUsername,
  isNumericOnlyLabel,
} from '@/lib/userDisplayLabel';

/** Strip accents / mojibake so "HOÃ<RSKOOL" still matches as hoerskool. */
function normalizeInstitutionNameForMatch(name: string): string {
  return String(name || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\uFFFD/g, '')
    .replace(/Ã./g, '')
    .replace(/[^A-Za-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

export function looksLikeSchoolInstitutionName(name?: string | null): boolean {
  const n = String(name || '').trim();
  if (n.length < 4) return false;
  if (isNumericOnlyLabel(n)) return false;
  const upper = n.toUpperCase();
  const folded = normalizeInstitutionNameForMatch(n);

  if (/\bSCHOOL\b/.test(upper) || /\bSCHOOL\b/.test(folded)) return true;
  if (/\b(LAERSKOOL|SKOOL|HO[EËÊÔ]RSKOOL|RSKOOL|SEKOND[EÊ]RE\s*SKOOL|PRIM[EÊ]RE\s*SKOOL|KOMBINE(E)?\s*SKOOL)\b/.test(upper)) {
    return true;
  }
  if (
    /\b(LAERSKOOL|SKOOL|HOERSKOOL|RSKOOL|SEKONDERE SKOOL|PRIMERE SKOOL|KOMBINASIE SKOOL|KOMBINASIESKOOL)\b/.test(
      folded
    )
  ) {
    return true;
  }
  if (/\b(NURSERY|PRE[- ]?PRIMARY|PRIMARY|SECONDARY|HIGH|COMBINED|INTERMEDIATE)\s+SCHOOL\b/.test(upper)) {
    return true;
  }
  if (/\b(J\.?\s*S\.?\s*S\.?|JSS|NSSC)\b/.test(upper)) return true;
  if (/\b(COLLEGE|ACADEMY|POLYTECHNIC|TECHNICAL\s+COLLEGE)\b/.test(upper)) return true;
  return false;
}

type SchoolProfileUser = {
  isSchoolAccount?: boolean | null;
  name?: string | null;
  username?: string | null;
  profileGalleryUrls?: unknown;
};

/** True when profile should show school Donate + school UX (matches backend inference). */
export function inferIsSchoolProfile(
  user: SchoolProfileUser | null | undefined,
  opts?: { hasSchoolPageAccess?: boolean }
): boolean {
  if (!user) return false;
  if (user.isSchoolAccount === true) return true;
  if (opts?.hasSchoolPageAccess) return true;
  if (isAutoImportGalleryUsername(user.username)) return true;
  if (hasLegacyNumericUsername(user) && looksLikeSchoolInstitutionName(user.name)) return true;
  if (
    Array.isArray(user.profileGalleryUrls) &&
    user.profileGalleryUrls.length > 0 &&
    looksLikeSchoolInstitutionName(user.name)
  ) {
    return true;
  }
  return looksLikeSchoolInstitutionName(user.name);
}
