import { isKnownSchoolAccountName } from "./knownSchoolAliases";
const GENERIC_DISPLAY_NAME =
  /^(administrator|administrators|admin|admins|super\s*admin|superadmin|user|users|guest|system|staff|moderator|support|test\s*user|default\s*user|creator|creators)$/i;

export function isGenericDisplayName(name?: string | null): boolean {
  const n = String(name || "").trim();
  if (!n) return true;
  if (GENERIC_DISPLAY_NAME.test(n)) return true;
  const lower = n.toLowerCase();
  if (lower === "administrator" || lower === "administrators") return true;
  return false;
}

export function isNumericOnlyLabel(value?: string | null): boolean {
  const n = String(value || "").trim();
  return n.length > 0 && /^\d+$/.test(n);
}

export type PublicProfileKind = "individual" | "school" | "business";

type UserLabelFields = {
  name?: string | null;
  username?: string | null;
  email?: string | null;
  isSchoolAccount?: boolean | null;
  publicDisplayName?: string | null;
  publicProfileKind?: PublicProfileKind | null;
};

/** Slug for @handle from display name (e.g. Boitshepo Secondary School → boitsheposecondaryschool). */
export function slugifyPublicHandle(name: string): string {
  return String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 48);
}

/** First N name tokens → public handle (e.g. Matankiso Joyce Sandamela → matankisojoyce). */
export function publicHandleFromFirstNames(name?: string | null, maxParts = 2): string {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "";
  return slugifyPublicHandle(parts.slice(0, maxParts).join(" "));
}

/** Schools and businesses may keep numeric usernames (phone imports); private individuals may not. */
export function shouldExposeNumericUsername(
  u: UserLabelFields | null | undefined,
  profileKind?: PublicProfileKind | null
): boolean {
  if (profileKind === "school" || profileKind === "business") return true;
  if (u?.isSchoolAccount === true) return true;
  if (shouldPreferInstitutionDisplayName(u)) return true;
  return false;
}

/** Batch gallery imports use `zagal` + hex (not a public handle). */
export function isAutoImportGalleryUsername(username?: string | null): boolean {
  const u = String(username || "").trim().toLowerCase();
  return /^zagal[a-f0-9]{8,}$/.test(u);
}

/** Legacy school imports often use a phone number as username; show the institution name instead. */
export function hasLegacyNumericUsername(u: UserLabelFields | null | undefined): boolean {
  if (!u) return false;
  const username = String(u.username || "").trim();
  const name = String(u.name || "").trim();
  return !!(username && name && !isGenericDisplayName(name) && isNumericOnlyLabel(username));
}

/** Prefer `name` over internal @username for school / gallery-import accounts. */
export function shouldPreferInstitutionDisplayName(u: UserLabelFields | null | undefined): boolean {
  if (!u) return false;
  const name = String(u.name || "").trim();
  if (!name || isGenericDisplayName(name)) return false;
  if (hasLegacyNumericUsername(u)) return true;
  if (u.isSchoolAccount === true) return true;
  if (isKnownSchoolAccountName(name)) return true;
  if (isAutoImportGalleryUsername(u.username)) return true;
  return false;
}

/** Replace generic `name` on API payloads so clients never render "Administrator". */
export function sanitizeUserForClient<T extends Record<string, unknown>>(
  user: T | null | undefined
): T | null | undefined {
  if (!user || typeof user !== "object") return user;
  const next = { ...(user as Record<string, unknown>) };
  // Admin-intel only — never expose on client/user APIs (lean docs bypass toJSON).
  delete next.registrationIp;
  delete next.registrationGeo;
  delete next.passwordHash;
  delete next.expoPushTokens;
  const rawName = String(next.name || "").trim();
  if (!isGenericDisplayName(rawName)) return next as unknown as T;
  const display = userPublicDisplayName(next as { name?: string; username?: string; email?: string });
  return { ...next, name: display } as unknown as T;
}

/**
 * Public-facing label for strips, posts, sidebars, etc.
 * Prefer a proper display `name` (Title Case brands / people) over @username.
 * Usernames belong on the profile handle, not as the primary label.
 */
export function userPublicDisplayName(u: UserLabelFields | null | undefined): string {
  if (!u) return "User";
  const apiLabel = String(u.publicDisplayName || "").trim();
  if (apiLabel && apiLabel !== "User") return apiLabel;
  const username = String(u.username || "").trim();
  const name = String(u.name || "").trim();
  // Always prefer a real name when present — keeps status strip / feed consistent
  // (e.g. "History Box" not "historybox").
  if (name && !isGenericDisplayName(name)) return name;
  if (username && !isNumericOnlyLabel(username) && !isAutoImportGalleryUsername(username)) {
    return username;
  }
  const email = String(u.email || "").trim();
  if (email.includes("@")) return email.split("@")[0];
  return "User";
}

/** Public @handle without exposing private individuals' phone-number usernames. */
export function publicUsernameHandle(
  u: UserLabelFields | null | undefined,
  profileKind?: PublicProfileKind | null
): string {
  const username = String(u?.username || "").trim();
  const name = String(u?.name || "").trim();
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

  return username || "";
}

export function userAtUsername(
  u: UserLabelFields | null | undefined,
  profileKind?: PublicProfileKind | null
): string | null {
  const handle = publicUsernameHandle(u, profileKind);
  return handle ? `@${handle}` : null;
}
