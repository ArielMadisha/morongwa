import { toAbsoluteMediaUrl } from "./api";
import { looksLikeAudioUrl, looksLikeVideoUrl } from "./tvMedia";
import type { TVPost, TVPostType } from "../types";

export type StatusStripPost = {
  _id: string;
  type: string;
  mediaUrls?: string[];
  artworkUrl?: string;
  createdAt?: string;
};

export type StatusStripItem = {
  id: string;
  name?: string;
  avatar?: string;
  /** Store/supplier status row — shop name label */
  isStoreStatus?: boolean;
  latestPost?: StatusStripPost | null;
  /** All posts in the last 24h — oldest first (story viewer). */
  posts?: StatusStripPost[];
};

/** Normalize API row — ensure posts[] for multi-segment viewer. */
export function normalizeStatusStripItem(item: StatusStripItem): StatusStripItem {
  const posts =
    item.posts?.length ? item.posts : item.latestPost?._id ? [item.latestPost] : [];
  const latestPost = posts.length ? posts[posts.length - 1] : item.latestPost ?? null;
  return { ...item, posts, latestPost };
}

function statusStripLatestMs(row: StatusStripItem): number {
  const raw = row?.latestPost?.createdAt;
  if (!raw) return 0;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

/** Newest status left → older statuses shift right. */
export function sortStatusStripNewestFirst(rows: StatusStripItem[]): StatusStripItem[] {
  return [...rows].sort((a, b) => {
    const tb = statusStripLatestMs(b);
    const ta = statusStripLatestMs(a);
    if (tb !== ta) return tb - ta;
    return String(b.id || b.latestPost?._id || "").localeCompare(String(a.id || a.latestPost?._id || ""));
  });
}

export function postsForStatusItem(item: StatusStripItem): StatusStripPost[] {
  const normalized = normalizeStatusStripItem(item);
  return normalized.posts ?? [];
}

export function statusStripThumbUrl(item: StatusStripItem): string | undefined {
  const avatarUrl = item.avatar ? toAbsoluteMediaUrl(item.avatar) : undefined;
  const post = normalizeStatusStripItem(item).latestPost;
  if (!post) return avatarUrl;

  const firstMedia = post.mediaUrls?.[0];
  const t = post.type;

  if (t === "video" || (firstMedia && looksLikeVideoUrl(firstMedia))) {
    return avatarUrl;
  }
  if (t === "audio") {
    if (post.artworkUrl) return toAbsoluteMediaUrl(post.artworkUrl);
    return avatarUrl;
  }
  if (t === "text") {
    return avatarUrl;
  }
  if (t === "image" || t === "carousel" || t === "product") {
    if (firstMedia && !looksLikeVideoUrl(firstMedia) && !looksLikeAudioUrl(firstMedia)) {
      return toAbsoluteMediaUrl(firstMedia);
    }
    return avatarUrl;
  }
  if (firstMedia && !looksLikeVideoUrl(firstMedia) && !looksLikeAudioUrl(firstMedia)) {
    return toAbsoluteMediaUrl(firstMedia);
  }
  return avatarUrl;
}

/** Build a TVPost from a status row + specific post (viewer segment). */
export function tvPostFromStatusStripRow(item: StatusStripItem, postOverride?: StatusStripPost): TVPost | null {
  const post = postOverride ?? normalizeStatusStripItem(item).latestPost;
  if (!post?._id) return null;

  const creatorId = {
    _id: item.id,
    name: item.name,
    avatar: item.avatar
  };

  if (post.type === "product") {
    const media = (post.mediaUrls || []).filter(Boolean);
    if (!media.length) return null;
    return {
      _id: String(post._id),
      type: "image",
      mediaUrls: media,
      caption: item.name,
      creatorId,
      createdAt: post.createdAt
    };
  }

  if (post.type === "text" || String(post._id).startsWith("join-")) {
    return {
      _id: String(post._id),
      type: "text",
      mediaUrls: [],
      heading: item.name,
      caption: String(post._id).startsWith("join-") ? "New on Qwertymates" : undefined,
      creatorId,
      createdAt: post.createdAt
    };
  }

  const media = (post.mediaUrls || []).filter(Boolean);
  const type = post.type as TVPostType;
  if ((type === "image" || type === "video" || type === "carousel" || type === "audio") && !media.length && !post.artworkUrl) {
    return null;
  }

  return {
    _id: String(post._id),
    type: type === "product" ? "image" : type,
    mediaUrls: media,
    creatorId,
    createdAt: post.createdAt
  };
}
