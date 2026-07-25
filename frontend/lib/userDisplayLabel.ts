const GENERIC_DISPLAY_NAME =
  /^(administrator|administrators|admin|admins|super\s*admin|superadmin|user|users|guest|system|staff|moderator|support|test\s*user|default\s*user|creator|creators)$/i;

export function isGenericDisplayName(name?: string | null): boolean {
  const n = String(name || '').trim();
  if (!n) return true;
  if (GENERIC_DISPLAY_NAME.test(n)) return true;
  const lower = n.toLowerCase();
  if (lower === 'administrator' || lower === 'administrators') return true;
  return false;
}

/** Normalize user from API/localStorage so UI never shows generic admin labels. */
export function normalizeClientUser<T extends Record<string, unknown>>(user: T | null | undefined): T | null | undefined {
  if (!user || typeof user !== 'object') return user;
  const rawName = String((user as { name?: string }).name || '').trim();
  if (!isGenericDisplayName(rawName)) return user;
  const display = userPublicDisplayName(user as { name?: string; username?: string; email?: string });
  return { ...user, name: display };
}

export function isNumericOnlyLabel(value?: string | null): boolean {
  const n = String(value || '').trim();
  return n.length > 0 && /^\d+$/.test(n);
}

import type { PublicProfileKind } from '@/lib/publicContactPrivacy';

type UserLabelFields = {
  name?: string | null;
  username?: string | null;
  email?: string | null;
  isSchoolAccount?: boolean | null;
  publicDisplayName?: string | null;
  publicProfileKind?: PublicProfileKind | null;
};

/** Batch gallery imports use `zagal` + hex (not a public handle). */
export function isAutoImportGalleryUsername(username?: string | null): boolean {
  const u = String(username || '').trim().toLowerCase();
  return /^zagal[a-f0-9]{8,}$/.test(u);
}

/** True when username is a legacy phone/id import and a human-readable name should take precedence. */
export function hasLegacyNumericUsername(u: UserLabelFields | null | undefined): boolean {
  if (!u) return false;
  const username = String(u.username || '').trim();
  const name = String(u.name || '').trim();
  return !!(username && name && !isGenericDisplayName(name) && isNumericOnlyLabel(username));
}

/** Prefer institution `name` over internal @username for school / gallery-import accounts. */
export function shouldPreferInstitutionDisplayName(u: UserLabelFields | null | undefined): boolean {
  if (!u) return false;
  const name = String(u.name || '').trim();
  if (!name || isGenericDisplayName(name)) return false;
  if (hasLegacyNumericUsername(u)) return true;
  if (u.isSchoolAccount === true) return true;
  if (isAutoImportGalleryUsername(u.username)) return true;
  return false;
}

/** Slug for @handle from institution / display name (e.g. Boitshepo Secondary School → boitsheposecondaryschool). */
export function slugifyPublicHandle(name: string): string {
  return String(name || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 48);
}

/** First N name tokens → public handle (e.g. Matankiso Joyce Sandamela → matankisojoyce). */
export function publicHandleFromFirstNames(name?: string | null, maxParts = 2): string {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return '';
  return slugifyPublicHandle(parts.slice(0, maxParts).join(' '));
}

/** Schools and businesses may keep numeric usernames; private individuals may not. */
export function shouldExposeNumericUsername(
  u: UserLabelFields | null | undefined,
  profileKind?: PublicProfileKind | null
): boolean {
  if (profileKind === 'school' || profileKind === 'business') return true;
  if (u?.isSchoolAccount === true) return true;
  if (shouldPreferInstitutionDisplayName(u)) return true;
  return false;
}

/**
 * Public-facing label for strips, posts, sidebars, etc.
 * Prefer a proper display `name` (Title Case brands / people) over @username.
 * Usernames belong on the profile handle (`userAtUsername`), not as the primary label.
 */
export function userPublicDisplayName(u: UserLabelFields | null | undefined): string {
  if (!u) return 'User';
  const apiLabel = String(u.publicDisplayName || '').trim();
  if (apiLabel && apiLabel !== 'User') return apiLabel;
  const username = String(u.username || '').trim();
  const name = String(u.name || '').trim();
  // Always prefer a real name when present — keeps status strip / feed consistent
  // (e.g. "History Box" not "historybox").
  if (name && !isGenericDisplayName(name)) return name;
  if (username && !isNumericOnlyLabel(username) && !isAutoImportGalleryUsername(username)) {
    return username;
  }
  const email = String(u.email || '').trim();
  if (email.includes('@')) return email.split('@')[0];
  return 'User';
}

/**
 * Professional display casing for rail / strip labels.
 * Converts ALL-CAPS imports (e.g. school names) to Title Case; leaves mixed-case names alone.
 */
export function toAppealingDisplayName(name?: string | null): string {
  const n = String(name || '').trim();
  if (!n) return '';
  const letters = n.replace(/[^A-Za-z]/g, '');
  if (!letters.length) return n;
  const upperCount = [...letters].filter((c) => c === c.toUpperCase() && c !== c.toLowerCase()).length;
  if (upperCount / letters.length < 0.7) return n;
  return n
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      // Keep short connectors lowercase when mid-phrase? Prefer capitalizing all for schools.
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

/** Public handle without @ — masks phone-number usernames for private individuals. */
export function publicUsernameHandle(
  u: UserLabelFields | null | undefined,
  profileKind?: PublicProfileKind | null
): string {
  const username = String(u?.username || '').trim();
  const name = String(u?.name || '').trim();
  const kind = profileKind ?? u?.publicProfileKind ?? null;

  if (shouldPreferInstitutionDisplayName(u)) {
    const slug = slugifyPublicHandle(name);
    if (slug) return slug;
    if (username && !isAutoImportGalleryUsername(username)) return username;
  }

  if (shouldExposeNumericUsername(u, kind)) {
    if (username && !isAutoImportGalleryUsername(username)) return username;
  }

  if (username && !isNumericOnlyLabel(username) && !isAutoImportGalleryUsername(username)) {
    return username;
  }

  const fromNames = publicHandleFromFirstNames(name);
  if (fromNames) return fromNames;

  if (username && !isAutoImportGalleryUsername(username) && shouldExposeNumericUsername(u, kind)) {
    return username;
  }

  return username || '';
}

/** @handle for profile — slug from first names when username is a legacy numeric id. */
export function userAtUsername(
  u: UserLabelFields | null | undefined,
  profileKind?: PublicProfileKind | null
): string | null {
  const handle = publicUsernameHandle(u, profileKind);
  return handle ? `@${handle}` : null;
}

/** Legacy numeric username (phone / import id) shown secondary on profiles — not as the primary @handle. */
export function userLegacyNumericIdentifier(u: UserLabelFields | null | undefined): string | null {
  if (!hasLegacyNumericUsername(u)) return null;
  return String(u?.username || '').trim() || null;
}

/**
 * Post / comment author label — prefer readable name over legacy numeric username.
 */
export function creatorDisplayLabel(
  u: (UserLabelFields & { publicDisplayName?: string }) | null | undefined,
  fallback = 'User'
): string {
  if (!u || typeof u !== 'object') return fallback;
  const label = userPublicDisplayName(u);
  if (label !== 'User') return label;
  const username = String(u.username || '').trim();
  if (username) return username;
  return fallback;
}
