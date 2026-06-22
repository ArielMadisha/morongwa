import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import TVPost from "../data/models/TVPost";

/** Legacy PHP profile uploads (bare filename in Mongo, often a logo — not the TV story image). */
export const LEGACY_BARE_AVATAR_RE = /^avatar_\d+\.(jpe?g|png|gif|webp)$/i;

export function avatarPathCandidates(raw: string): string[] {
  const s = String(raw || "").trim();
  if (!s) return [];
  if (/^https?:\/\//i.test(s)) return [s];
  if (s.startsWith("/uploads/")) return [s];
  if (s.startsWith("uploads/")) return [`/${s}`];
  return [`/uploads/profiles/${s}`, `/uploads/${s}`];
}

export function uploadPublicPathExists(publicPath: string, uploadsRoot: string): boolean {
  const p = String(publicPath || "").trim();
  if (!p.startsWith("/uploads/") || p.includes("..")) return false;
  const rel = p.replace(/^\/uploads\//, "");
  return fs.existsSync(path.join(uploadsRoot, rel));
}

export function pickExistingUploadPath(candidates: string[], uploadsRoot: string): string | undefined {
  for (const c of candidates) {
    if (/^https?:\/\//i.test(c)) return c;
    if (uploadPublicPathExists(c, uploadsRoot)) return c;
  }
  return undefined;
}

async function latestApprovedImagePostUrl(
  userId: mongoose.Types.ObjectId | string
): Promise<string | undefined> {
  const post = await TVPost.findOne({
    creatorId: userId,
    status: "approved",
    type: { $in: ["image", "carousel"] },
    "mediaUrls.0": { $exists: true, $ne: "" },
  })
    .sort({ createdAt: -1 })
    .select("mediaUrls")
    .lean();
  const url = post?.mediaUrls?.[0];
  return typeof url === "string" && url.trim() ? url.trim() : undefined;
}

type AvatarUser = {
  _id?: unknown;
  avatar?: string | null;
  profileGalleryUrls?: string[] | null;
};

/**
 * Resolve a loadable avatar URL for API clients.
 * Legacy bare `avatar_*.jpg` values often point at an old logo; prefer a recent TV image when available.
 */
export async function resolveUserAvatarForClient(
  user: AvatarUser,
  uploadsRoot: string
): Promise<string | undefined> {
  const rawAvatar = String(user.avatar || "").trim();
  const uid = user._id;

  const gallery = (user.profileGalleryUrls || []).filter(
    (u): u is string => typeof u === "string" && u.trim().length > 0
  );

  if (uid && LEGACY_BARE_AVATAR_RE.test(rawAvatar)) {
    const tvUrl = await latestApprovedImagePostUrl(uid as mongoose.Types.ObjectId);
    if (tvUrl) {
      const fromTv = pickExistingUploadPath(avatarPathCandidates(tvUrl), uploadsRoot);
      if (fromTv) return fromTv;
    }
  }

  const fromAvatar = pickExistingUploadPath(avatarPathCandidates(rawAvatar), uploadsRoot);
  if (fromAvatar) return fromAvatar;

  for (const g of gallery) {
    const fromGallery = pickExistingUploadPath(avatarPathCandidates(g), uploadsRoot);
    if (fromGallery) return fromGallery;
  }

  if (uid) {
    const tvUrl = await latestApprovedImagePostUrl(uid as mongoose.Types.ObjectId);
    if (tvUrl) {
      const fromTv = pickExistingUploadPath(avatarPathCandidates(tvUrl), uploadsRoot);
      if (fromTv) return fromTv;
    }
  }

  if (rawAvatar && /^https?:\/\//i.test(rawAvatar)) return rawAvatar;
  return undefined;
}

export async function applyResolvedAvatarToUserPayload<T extends Record<string, unknown>>(
  user: T,
  uploadsRoot: string
): Promise<T> {
  if (!user || typeof user !== "object") return user;
  const resolved = await resolveUserAvatarForClient(user as AvatarUser, uploadsRoot);
  if (!resolved || resolved === user.avatar) return user;
  return { ...user, avatar: resolved };
}
