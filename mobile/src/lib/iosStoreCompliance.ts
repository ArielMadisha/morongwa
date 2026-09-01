import { Platform } from "react-native";
import type { StatusStripItem, StatusStripPost } from "./statusStripItem";
import type { TVPost } from "../types";

/**
 * App Store Guideline 3.1.1 — optional tips for digital content must use IAP.
 * On iOS we hide creator/school tips, Donate, and Buy me Coffee (wallet path).
 * Android/web keep wallet donate. P2P wallet send (Scan QR) is not a content tip.
 */
export function iosCreatorDigitalTipsEnabled(): boolean {
  return Platform.OS !== "ios";
}

const THIRD_PARTY_HOST_RE =
  /youtube\.com|youtu\.be|spotify\.com|soundcloud\.com|fbcdn\.net|facebook\.com\/.*\/videos/i;
const FACEBOOK_INGEST_FILE_RE = /\/uploads\/tv\/tv-fb-|[\\/]tv-fb-/i;
const FACEBOOK_INGEST_CAPTION_RE = /Source:\s*.+\(Facebook\)|\bfb:\d+/i;

type CatalogLike = {
  caption?: string;
  mediaUrls?: string[];
  artworkUrl?: string;
  audioUrl?: string;
};

/** True when a post/status looks like Facebook ingest or a third-party AV catalog URL. */
export function isThirdPartyCatalogMedia(item: CatalogLike | null | undefined): boolean {
  if (!item) return false;
  const urls = [...(item.mediaUrls || []), item.artworkUrl, item.audioUrl].filter(
    (u): u is string => typeof u === "string" && u.length > 0
  );
  const blob = urls.join(" ");
  if (FACEBOOK_INGEST_FILE_RE.test(blob) || THIRD_PARTY_HOST_RE.test(blob)) return true;
  const caption = String(item.caption || "");
  if (FACEBOOK_INGEST_CAPTION_RE.test(caption)) return true;
  if (/facebook\.com\//i.test(caption) && /Source:/i.test(caption)) return true;
  return false;
}

/** Guideline 5.2.3 — iOS must not surface third-party AV catalogs. No-op on Android. */
export function filterFirstPartyUgcPosts<T extends CatalogLike>(posts: T[]): T[] {
  if (Platform.OS !== "ios") return posts;
  return posts.filter((p) => !isThirdPartyCatalogMedia(p));
}

export function filterFirstPartyStatusItems(items: StatusStripItem[]): StatusStripItem[] {
  if (Platform.OS !== "ios") return items;
  const out: StatusStripItem[] = [];
  for (const item of items) {
    const posts = (item.posts || []).filter((p) => !isThirdPartyCatalogMedia(p as StatusStripPost));
    let latest = item.latestPost;
    if (latest && isThirdPartyCatalogMedia(latest as CatalogLike)) {
      latest = posts.length ? posts[posts.length - 1] : null;
    }
    if (!latest?._id && posts.length === 0) continue;
    out.push({
      ...item,
      posts: posts.length ? posts : undefined,
      latestPost: latest ?? undefined
    });
  }
  return out;
}

export function isIosStoreBinary(): boolean {
  return Platform.OS === "ios";
}

/** TV posts that are allowed on this platform (UGC / first-party). */
export function allowTvPostOnThisPlatform(post: TVPost): boolean {
  if (Platform.OS !== "ios") return true;
  return !isThirdPartyCatalogMedia(post);
}
