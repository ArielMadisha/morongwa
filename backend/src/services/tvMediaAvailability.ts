import fs from "fs";
import path from "path";
import { TV_UPLOAD_STORAGE_DIR } from "../middleware/tvUpload";
import {
  findProfileUploadSibling,
  isProfileBackfillUploadPath,
  isProfileBackfillUploadUrl,
  uploadPublicPathExists as profileUploadExists,
} from "../utils/profileBackfillMedia";

const UPLOADS_ROOT = path.resolve(__dirname, "../../uploads");
const SCHOOL_GALLERY_PATH_SEGMENT = "/uploads/school-gallery/";

/** Pathname contains our TV upload prefix (relative or absolute URL). */
export function isLocalTvUploadUrl(url: string | undefined): boolean {
  if (!url || typeof url !== "string") return false;
  let mediaPath = url.trim();
  if (mediaPath.startsWith("http://") || mediaPath.startsWith("https://")) {
    try {
      mediaPath = new URL(mediaPath).pathname;
    } catch {
      return false;
    }
  }
  return mediaPath.includes("/uploads/tv/");
}

/** Pathname contains a school gallery import path (relative or absolute URL). */
export function isLocalSchoolGalleryUrl(url: string | undefined): boolean {
  if (!url || typeof url !== "string") return false;
  let mediaPath = url.trim();
  if (mediaPath.startsWith("http://") || mediaPath.startsWith("https://")) {
    try {
      mediaPath = new URL(mediaPath).pathname;
    } catch {
      return false;
    }
  }
  return mediaPath.includes(SCHOOL_GALLERY_PATH_SEGMENT);
}

function pathnameFromMediaUrl(url: string): string | null {
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

/** Resolve on-disk path for a school-gallery media URL. */
export function resolveSchoolGalleryFilePath(
  url: string,
  uploadsRoot: string = UPLOADS_ROOT
): string | null {
  const mediaPath = pathnameFromMediaUrl(url);
  if (!mediaPath || !mediaPath.includes(SCHOOL_GALLERY_PATH_SEGMENT)) return null;
  const rel = mediaPath.replace(/^\/+/, "").replace(/^uploads\//, "");
  if (!rel || rel.includes("..")) return null;
  const primary = path.join(uploadsRoot, rel);
  try {
    if (fs.existsSync(primary)) return primary;
  } catch {
    /* ignore */
  }
  const fileName = path.basename(mediaPath);
  const uidMatch = mediaPath.match(/\/school-gallery\/([^/]+)\//);
  if (fileName && uidMatch?.[1]) {
    const alt = path.join(uploadsRoot, "school-gallery", uidMatch[1], fileName);
    try {
      if (fs.existsSync(alt)) return alt;
    } catch {
      /* ignore */
    }
  }
  return null;
}

/** Resolve on-disk path for a TV media URL (same logic as tv route upload verification). */
export function resolveUploadedTvFilePath(url: string): string | null {
  if (!url) return null;
  const normalized = String(url).trim();
  let mediaPath = normalized;
  if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
    try {
      mediaPath = new URL(normalized).pathname;
    } catch {
      return null;
    }
  }
  if (!mediaPath.includes("/uploads/tv/")) return null;
  const fileName = path.basename(mediaPath);
  const cwdPath = path.join(TV_UPLOAD_STORAGE_DIR, fileName);
  const legacyPath = path.join(__dirname, "../../uploads/tv", fileName);
  try {
    if (fs.existsSync(cwdPath)) return cwdPath;
    if (fs.existsSync(legacyPath)) return legacyPath;
  } catch {
    /* ignore */
  }
  return null;
}

/** True when the file exists on this API host (or URL is not a local upload we manage). */
export function tvUploadMediaExists(url: string | undefined): boolean {
  return localUploadMediaExists(url);
}

/** True when the file exists on this API host (or URL is not a local TV/school-gallery upload). */
export function localUploadMediaExists(url: string | undefined, uploadsRoot?: string): boolean {
  if (!url || typeof url !== "string") return false;
  const root = uploadsRoot ?? UPLOADS_ROOT;
  if (isProfileBackfillUploadUrl(url)) {
    const p = String(url).trim();
    if (profileUploadExists(p, root)) return true;
    if (findProfileUploadSibling(p, root)) return true;
    // Nginx may serve /uploads/profiles from the host volume while the API container lacks the file.
    return isProfileBackfillUploadPath(url);
  }
  if (isLocalTvUploadUrl(url)) return resolveUploadedTvFilePath(url) !== null;
  if (isLocalSchoolGalleryUrl(url)) {
    if (resolveSchoolGalleryFilePath(url, uploadsRoot ?? UPLOADS_ROOT) !== null) return true;
    const mediaPath = pathnameFromMediaUrl(url);
    // Nginx may serve school-gallery from host volume while API container lacks the file.
    return !!(
      mediaPath &&
      mediaPath.includes(SCHOOL_GALLERY_PATH_SEGMENT) &&
      /\/school-gallery\/[^/]+\/[^/]+$/i.test(mediaPath)
    );
  }
  return true;
}

function isManagedLocalUploadUrl(url: string): boolean {
  return isLocalTvUploadUrl(url) || isLocalSchoolGalleryUrl(url) || isProfileBackfillUploadUrl(url);
}

/** Keep remote URLs; drop local TV/school-gallery paths missing on disk. */
export function pruneLocalMediaUrls(urls: string[], uploadsRoot?: string): string[] {
  return urls
    .map((u) => String(u || "").trim())
    .filter(Boolean)
    .filter((u) => !isManagedLocalUploadUrl(u) || localUploadMediaExists(u, uploadsRoot));
}

/** Drop broken local media; omit image/carousel/video posts with nothing left to show. */
export function pruneTvPostMedia<T extends TvPostMediaShape>(
  post: T,
  uploadsRoot?: string
): T | null {
  const type = String(post.type || "").trim();
  if (type === "text" || type === "product") return post;

  const mediaUrls = Array.isArray(post.mediaUrls)
    ? post.mediaUrls.map((u) => String(u || "").trim()).filter(Boolean)
    : [];
  const kept = pruneLocalMediaUrls(mediaUrls, uploadsRoot);

  if (type === "image" || type === "carousel" || type === "video") {
    if (!kept.length) return null;
  }

  const next = { ...post, mediaUrls: kept } as T;
  if (type === "carousel" && kept.length === 1) {
    (next as TvPostMediaShape).type = "image";
  }
  return next;
}

export type TvPostMediaShape = {
  type?: string;
  mediaUrls?: string[];
  artworkUrl?: string;
};

/**
 * Feed should not surface posts whose primary media lives under uploads/tv but is missing on disk.
 * Text and product tiles are kept (product images come from Product, not TV uploads).
 */
export function tvPostHasAvailableMedia(post: TvPostMediaShape): boolean {
  const type = String(post.type || "").trim();
  if (type === "text" || type === "product") return true;

  const mediaUrls = Array.isArray(post.mediaUrls) ? post.mediaUrls.filter(Boolean) : [];
  const localMedia = mediaUrls.filter((u) => isManagedLocalUploadUrl(String(u)));
  const localArtwork =
    post.artworkUrl && isManagedLocalUploadUrl(post.artworkUrl) ? [String(post.artworkUrl)] : [];

  const localUrls = [...localMedia, ...localArtwork];
  if (localUrls.length === 0) return true;

  if (type === "video") {
    const primary = mediaUrls[0];
    if (!primary) return false;
    return localUploadMediaExists(primary);
  }

  if (type === "audio") {
    const audio = mediaUrls[0];
    if (audio && isManagedLocalUploadUrl(audio) && !localUploadMediaExists(audio)) return false;
    if (post.artworkUrl && isManagedLocalUploadUrl(post.artworkUrl) && !localUploadMediaExists(post.artworkUrl)) {
      return mediaUrls.some((u) => localUploadMediaExists(u));
    }
    return true;
  }

  if (type === "image" || type === "carousel") {
    return localUrls.some((u) => localUploadMediaExists(u));
  }

  return localUrls.some((u) => localUploadMediaExists(u));
}

export function filterTvPostsWithAvailableMedia<T extends TvPostMediaShape>(posts: T[]): T[] {
  return posts.filter(tvPostHasAvailableMedia);
}
