/** In-memory TV feed / featured / statuses response cache (single Node process). */

type FeedCacheEntry = {
  expiresAt: number;
  payload: unknown;
};

const FEED_CACHE_TTL_MS = Math.max(5_000, Number(process.env.TV_FEED_CACHE_TTL_MS || "20000"));
const FEED_CACHE_MAX_ENTRIES = Math.max(20, Number(process.env.TV_FEED_CACHE_MAX_ENTRIES || "300"));

const tvFeedCache = new Map<string, FeedCacheEntry>();

export function tvFeedCacheGet(key: string): unknown | null {
  const hit = tvFeedCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    tvFeedCache.delete(key);
    return null;
  }
  return hit.payload;
}

export function tvFeedCacheSet(key: string, payload: unknown): void {
  if (tvFeedCache.size >= FEED_CACHE_MAX_ENTRIES) {
    const oldest = tvFeedCache.keys().next().value;
    if (oldest) tvFeedCache.delete(oldest);
  }
  tvFeedCache.set(key, { expiresAt: Date.now() + FEED_CACHE_TTL_MS, payload });
}

export function clearTvFeedCache(): void {
  tvFeedCache.clear();
}
