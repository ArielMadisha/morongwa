'use client';

import { useCallback, useEffect, useRef } from 'react';

/** Align with backend TV_FEED_CACHE_TTL_MS default (~20s). */
export const FEED_AUTO_REFRESH_MS = 25_000;
export const FEED_REFRESH_THROTTLE_MS = 1_200;
export const FEED_SCROLL_TOP_THRESHOLD = 120;

/**
 * Polls the feed head on an interval and when the tab regains focus (Facebook / Instagram style).
 */
export function useFeedAutoRefresh(options: {
  enabled: boolean;
  onRefresh: () => void | Promise<void>;
  intervalMs?: number;
}) {
  const { enabled, onRefresh, intervalMs = FEED_AUTO_REFRESH_MS } = options;
  const lastRefreshRef = useRef(0);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  const runRefresh = useCallback(async () => {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    const now = Date.now();
    if (now - lastRefreshRef.current < FEED_REFRESH_THROTTLE_MS) return;
    lastRefreshRef.current = now;
    await onRefreshRef.current();
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => void runRefresh(), intervalMs);
    return () => window.clearInterval(id);
  }, [enabled, intervalMs, runRefresh]);

  useEffect(() => {
    if (!enabled) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') void runRefresh();
    };
    const onFocus = () => void runRefresh();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, runRefresh]);
}

export function readFeedScrollTop(container: HTMLElement | null): number {
  if (container && container.scrollHeight > container.clientHeight + 2) {
    return container.scrollTop;
  }
  if (typeof window !== 'undefined') return window.scrollY;
  return 0;
}

export function prependNewFeedItems<T extends { _id?: string }>(
  prev: T[],
  incoming: T[],
  sortNewestFirst: (items: T[]) => T[]
): { next: T[]; newCount: number } {
  const seen = new Set(prev.map((p) => String(p._id)));
  const fresh = incoming.filter((p) => !seen.has(String(p._id)));
  if (!fresh.length) return { next: prev, newCount: 0 };
  return { next: sortNewestFirst([...fresh, ...prev]), newCount: fresh.length };
}

/** Replace page-1 posts with fresh API data; keep older paginated tail when user scrolled down. */
export function mergeFreshFeedHead<T extends { _id?: string }>(
  prev: T[],
  incoming: T[],
  sortNewestFirst: (items: T[]) => T[]
): { next: T[]; newCount: number } {
  const incomingIds = new Set(incoming.map((p) => String(p._id)));
  const prevIds = new Set(prev.map((p) => String(p._id)));
  const newCount = incoming.filter((p) => !prevIds.has(String(p._id))).length;
  const tail = prev.filter((p) => !incomingIds.has(String(p._id)));
  return { next: sortNewestFirst([...incoming, ...tail]), newCount };
}
