import fs from "fs";
import path from "path";

export const PROFILE_UPLOAD_RE =
  /^\/uploads\/profiles\/(.+)-([a-f0-9]{24})-([a-z0-9-]+)-(\d+)\.(jpe?g|png|gif|webp)$/i;

/** True when URL is a managed profile-backfill upload path (relative or absolute). */
export function isProfileBackfillUploadPath(url: string | undefined): boolean {
  const mediaPath = pathnameFromProfileMediaUrl(url);
  return !!mediaPath && PROFILE_UPLOAD_RE.test(mediaPath);
}

function pathnameFromProfileMediaUrl(url: string | undefined): string | null {
  const normalized = String(url || "").trim();
  if (!normalized) return null;
  if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
    try {
      return new URL(normalized).pathname;
    } catch {
      return null;
    }
  }
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

export function isProfileBackfillUploadUrl(url: string | undefined): boolean {
  return isProfileBackfillUploadPath(url);
}

export function uploadPublicPathExists(publicPath: string, uploadsRoot: string): boolean {
  const p = String(publicPath || "").trim();
  if (!p.startsWith("/uploads/") || p.includes("..")) return false;
  const rel = p.replace(/^\/uploads\//, "");
  try {
    return fs.existsSync(path.join(uploadsRoot, rel));
  } catch {
    return false;
  }
}

/** Same slug + userId + label, any timestamp (e.g. re-imported profile photos). */
export function findProfileUploadSibling(
  publicPath: string,
  uploadsRoot: string
): string | undefined {
  const p = String(publicPath || "").trim();
  const m = PROFILE_UPLOAD_RE.exec(p);
  if (!m) return undefined;
  const [, slug, uid, label] = m;
  const dir = path.join(uploadsRoot, "profiles");
  let names: string[] = [];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return undefined;
  }
  const prefix = `${slug}-${uid}-${label}-`;
  const matches = names.filter((n) => n.toLowerCase().startsWith(prefix.toLowerCase()));
  if (!matches.length) return undefined;
  const existing = matches
    .map((n) => `/uploads/profiles/${n}`)
    .filter((p) => uploadPublicPathExists(p, uploadsRoot));
  if (!existing.length) return undefined;
  existing.sort((a, b) => {
    const ta = Number(a.match(/-(\d+)\./i)?.[1] || 0);
    const tb = Number(b.match(/-(\d+)\./i)?.[1] || 0);
    return tb - ta;
  });
  return existing[0];
}

/** Resolve profile backfill path to an on-disk file when possible. */
export function resolveProfileBackfillMediaUrl(
  url: string | undefined,
  uploadsRoot: string
): string | undefined {
  const raw = String(url || "").trim();
  if (!raw) return undefined;
  if (/^https?:\/\//i.test(raw)) return raw;
  const normalized = raw.startsWith("/uploads/") ? raw : raw.startsWith("uploads/") ? `/${raw}` : raw;
  if (!normalized.startsWith("/uploads/profiles/")) return normalized;
  if (uploadPublicPathExists(normalized, uploadsRoot)) return normalized;
  return findProfileUploadSibling(normalized, uploadsRoot) ?? normalized;
}

export function remapProfileGalleryUrls(urls: string[] | null | undefined, uploadsRoot: string): string[] {
  const raw = (urls || []).filter((u): u is string => typeof u === "string" && u.trim().length > 0);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of raw) {
    const resolved = resolveProfileBackfillMediaUrl(u, uploadsRoot) || u;
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    out.push(resolved);
  }
  return out;
}

export function applyProfileBackfillMediaToUser<T extends Record<string, unknown>>(
  user: T,
  uploadsRoot: string
): T {
  if (!user || typeof user !== "object") return user;
  const next: T = { ...user };
  const avatar = String(user.avatar || "").trim();
  if (avatar) {
    const resolved = resolveProfileBackfillMediaUrl(avatar, uploadsRoot);
    if (resolved && resolved !== avatar) (next as Record<string, unknown>).avatar = resolved;
  }
  const gallery = user.profileGalleryUrls;
  if (Array.isArray(gallery)) {
    const remapped = remapProfileGalleryUrls(gallery as string[], uploadsRoot);
    if (JSON.stringify(remapped) !== JSON.stringify(gallery)) {
      (next as Record<string, unknown>).profileGalleryUrls = remapped;
    }
  }
  return next;
}
