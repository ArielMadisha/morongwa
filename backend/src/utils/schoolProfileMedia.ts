import fs from "fs";
import path from "path";
import { inferIsSchoolAccountForPublicProfile } from "./schoolProfileDetection";

type SchoolMediaUser = {
  _id?: unknown;
  avatar?: string | null;
  profileGalleryUrls?: string[] | null;
  isSchoolAccount?: boolean | null;
};

function userIdString(user: SchoolMediaUser): string {
  return String(user._id || "").trim();
}

function galleryForUser(user: SchoolMediaUser): string[] {
  const uid = userIdString(user);
  const urls = (user.profileGalleryUrls || []).filter(
    (u): u is string => typeof u === "string" && u.trim().length > 0
  );
  if (!uid) return urls;
  const inFolder = urls.filter((u) => u.includes(`/school-gallery/${uid}/`));
  return inFolder.length ? inFolder : urls;
}

function schoolGalleryPaths(user: SchoolMediaUser): string[] {
  return galleryForUser(user).filter((u) => u.includes("/school-gallery/"));
}

/** Avatar from Google backfill lives under /uploads/profiles/ — often missing on prod after gallery-only sync. */
export function isUndeployedSchoolProfileAvatar(avatar: string): boolean {
  return /^\/uploads\/profiles\/school-/i.test(String(avatar || "").trim());
}

/** Remapped profile backfill filenames under school-gallery/ that were never uploaded to prod. */
export function isOrphanSchoolProfileGalleryUrl(url: string): boolean {
  return /\/school-gallery\/[^/]+\/school-[^/]+-gallery-/i.test(String(url || "").trim());
}

export function remapSchoolGalleryPathForUser(publicPath: string, userId: string): string {
  const p = String(publicPath || "").trim();
  const uid = String(userId || "").trim();
  if (!p || !uid || !p.includes("/school-gallery/")) return p;
  const base = p.split("/").pop();
  if (!base) return p;
  return `/uploads/school-gallery/${uid}/${base}`;
}

export function uploadPublicPathExists(publicPath: string, uploadsRoot: string): boolean {
  const p = String(publicPath || "").trim();
  if (!p.startsWith("/uploads/") || p.includes("..")) return false;
  const rel = p.replace(/^\/uploads\//, "");
  return fs.existsSync(path.join(uploadsRoot, rel));
}

/**
 * Prefer gallery images (synced to prod) when profile backfill avatar is missing or points at another user's folder.
 */
export function resolveEffectiveSchoolAvatar(
  user: SchoolMediaUser,
  uploadsRoot?: string
): string | undefined {
  const uid = userIdString(user);
  const gallery = galleryForUser(user);
  const syncedGallery = schoolGalleryPaths(user);
  const avatar = String(user.avatar || "").trim();

  const pickFirstExisting = (candidates: string[]): string | undefined => {
    for (const c of candidates) {
      const remapped = uid ? remapSchoolGalleryPathForUser(c, uid) : c;
      if (uploadsRoot) {
        if (uploadPublicPathExists(remapped, uploadsRoot)) return remapped;
        if (remapped !== c && uploadPublicPathExists(c, uploadsRoot)) return c;
      } else {
        return remapped;
      }
    }
    return undefined;
  };

  if (isUndeployedSchoolProfileAvatar(avatar) && syncedGallery.length) {
    const fromGallery = pickFirstExisting(syncedGallery);
    return fromGallery ?? syncedGallery[0];
  }

  if (avatar.includes("/school-gallery/") && uid && !avatar.includes(`/school-gallery/${uid}/`)) {
    const remapped = remapSchoolGalleryPathForUser(avatar, uid);
    if (uploadsRoot) {
      if (uploadPublicPathExists(remapped, uploadsRoot)) return remapped;
    } else if (gallery.length) {
      return gallery[0];
    }
    return remapped;
  }

  if (avatar && uploadsRoot && !uploadPublicPathExists(avatar, uploadsRoot)) {
    const fromGallery = pickFirstExisting(syncedGallery);
    if (fromGallery) return fromGallery;
    return undefined;
  }

  if (!avatar && syncedGallery.length) {
    return pickFirstExisting(syncedGallery) ?? syncedGallery[0];
  }

  if (avatar && uploadsRoot && !uploadPublicPathExists(avatar, uploadsRoot)) return undefined;
  return avatar || undefined;
}

function remapGalleryUrlsForUser(user: SchoolMediaUser, uploadsRoot?: string): string[] {
  const uid = userIdString(user);
  const raw = (user.profileGalleryUrls || []).filter(
    (u): u is string => typeof u === "string" && u.trim().length > 0
  );
  const synced = schoolGalleryPaths(user);
  const filtered = raw.filter((u) => {
    if (isUndeployedSchoolProfileAvatar(u) || isOrphanSchoolProfileGalleryUrl(u)) return synced.length === 0;
    return true;
  });
  const remapped = filtered.map((u) => (uid ? remapSchoolGalleryPathForUser(u, uid) : u));
  const unique = [...new Set(remapped)];
  if (!uploadsRoot) return unique;
  const existing = unique.filter((p) => {
    if (uploadPublicPathExists(p, uploadsRoot)) return true;
    // school-gallery files may be served by nginx while absent in the API container volume
    return p.includes("/school-gallery/") && !isUndeployedSchoolProfileAvatar(p);
  });
  return existing.length ? existing : unique;
}

/** Per-post school gallery media — preserve distinct filenames (do not collapse to first gallery thumb). */
export function resolveSchoolGalleryMediaUrl(
  user: SchoolMediaUser,
  mediaUrl: string | undefined,
  uploadsRoot?: string
): string | undefined {
  const uid = userIdString(user);
  const raw = String(mediaUrl || "").trim();
  if (!raw) return undefined;
  if (raw.includes("/uploads/tv/") || /^https?:\/\//i.test(raw)) return raw;

  let candidate = raw;
  if (candidate.includes("/school-gallery/") && uid) {
    candidate = remapSchoolGalleryPathForUser(candidate, uid);
  }

  const gallery = schoolGalleryPaths(user);

  if (isUndeployedSchoolProfileAvatar(candidate)) {
    const base = raw.split("/").pop();
    const match = base ? gallery.find((g) => g.endsWith(`/${base}`)) : undefined;
    if (match) return uid ? remapSchoolGalleryPathForUser(match, uid) : match;
    return gallery[0] ? (uid ? remapSchoolGalleryPathForUser(gallery[0], uid) : gallery[0]) : undefined;
  }

  if (!uploadsRoot || uploadPublicPathExists(candidate, uploadsRoot) || candidate.includes("/school-gallery/")) {
    return candidate;
  }

  const base = candidate.split("/").pop();
  if (base) {
    const match = gallery.find((g) => g.endsWith(`/${base}`));
    if (match) return uid ? remapSchoolGalleryPathForUser(match, uid) : match;
  }
  return candidate;
}

/** Status strip / TV: use a loadable image when post media or avatar points at missing school paths. */
export function resolveSchoolStatusThumbUrl(
  user: SchoolMediaUser,
  mediaUrl: string | undefined,
  uploadsRoot?: string
): string | undefined {
  const uid = userIdString(user);
  const raw = String(mediaUrl || "").trim();
  const gallery = schoolGalleryPaths(user);
  const effectiveAvatar = resolveEffectiveSchoolAvatar(user, uploadsRoot);

  const pickExisting = (candidates: string[]): string | undefined => {
    for (const c of candidates) {
      const remapped = uid && c.includes("/school-gallery/") ? remapSchoolGalleryPathForUser(c, uid) : c;
      if (!uploadsRoot) return remapped;
      if (remapped.startsWith("/uploads/") && uploadPublicPathExists(remapped, uploadsRoot)) return remapped;
      if (/^https?:\/\//i.test(remapped)) return remapped;
    }
    return undefined;
  };

  if (raw) {
    if (raw.includes("/uploads/tv/")) {
      return raw;
    }
    let candidate = raw;
    if (candidate.includes("/school-gallery/") && uid) {
      candidate = remapSchoolGalleryPathForUser(candidate, uid);
    }
    if (isUndeployedSchoolProfileAvatar(candidate) && gallery.length) {
      return pickExisting(gallery) ?? effectiveAvatar;
    }
    if (uploadsRoot && candidate.startsWith("/uploads/") && !uploadPublicPathExists(candidate, uploadsRoot)) {
      if (candidate.includes("/school-gallery/")) {
        return candidate;
      }
      const base = candidate.split("/").pop();
      const match = base ? gallery.find((g) => g.endsWith(`/${base}`)) : undefined;
      if (match) return uid ? remapSchoolGalleryPathForUser(match, uid) : match;
      return pickExisting([candidate]) ?? effectiveAvatar;
    }
    if (/^https?:\/\//i.test(candidate) || candidate.startsWith("/uploads/")) return candidate;
  }

  return effectiveAvatar ?? pickExisting(gallery);
}

export function applySchoolProfileMediaToUser<T extends Record<string, unknown>>(
  user: T,
  uploadsRoot?: string
): T {
  if (!user || typeof user !== "object") return user;
  const isSchool =
    user.isSchoolAccount === true ||
    inferIsSchoolAccountForPublicProfile(user as { isSchoolAccount?: boolean; name?: string });
  if (!isSchool) return user;

  const mediaUser = user as SchoolMediaUser;
  const avatar = resolveEffectiveSchoolAvatar(mediaUser, uploadsRoot);
  const profileGalleryUrls = remapGalleryUrlsForUser(mediaUser, uploadsRoot);

  const next: T = { ...user };
  if (avatar && avatar !== user.avatar) {
    (next as Record<string, unknown>).avatar = avatar;
  } else if (!avatar) {
    (next as Record<string, unknown>).avatar = undefined;
  }
  if (
    profileGalleryUrls.length &&
    JSON.stringify(profileGalleryUrls) !== JSON.stringify(user.profileGalleryUrls || [])
  ) {
    (next as Record<string, unknown>).profileGalleryUrls = profileGalleryUrls;
  }
  return next;
}
