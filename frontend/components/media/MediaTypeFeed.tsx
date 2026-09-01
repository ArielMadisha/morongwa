'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ImageIcon, Loader2, MessageSquare } from 'lucide-react';
import { MEDIA_GRID_CLASS } from '@/components/media/MediaPageShell';
import { TVGridTileWithObserver } from '@/components/tv/TVGridTileWithObserver';
import type { TVGridItem } from '@/components/tv/TVGridTile';
import { tvAPI } from '@/lib/api';

type FeedType = 'images' | 'text' | 'video';

const LABELS: Record<FeedType, { title: string; empty: string; icon: typeof ImageIcon }> = {
  images: {
    title: 'No pictures yet',
    empty: 'Photo posts from creators will appear here in random order.',
    icon: ImageIcon,
  },
  text: {
    title: 'No text posts yet',
    empty: 'Text posts from the community will appear here in random order.',
    icon: MessageSquare,
  },
  video: {
    title: 'No videos yet',
    empty: 'Videos from QwertyTV will appear here in random order.',
    icon: ImageIcon,
  },
};

const PER_PAGE = 16;

/**
 * Randomized TV feed filtered to one post type (images, text, or video).
 */
export function MediaTypeFeed({
  feedType,
  currentUserId,
  scrollRoot,
  loginHref,
}: {
  feedType: FeedType;
  currentUserId?: string;
  scrollRoot?: HTMLElement | null;
  loginHref: string;
}) {
  const [items, setItems] = useState<TVGridItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const seenRef = useRef<Set<string>>(new Set());
  const inFlightRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setLoadingMore(true);
    try {
      const res = await tvAPI.getFeed({
        page: 1,
        limit: PER_PAGE,
        type: feedType,
        sort: 'random',
      });
      const rows: TVGridItem[] = res.data?.data ?? res.data ?? [];
      const fresh = (Array.isArray(rows) ? rows : []).filter((p) => {
        const id = String(p._id);
        if (!id || seenRef.current.has(id)) return false;
        seenRef.current.add(id);
        return true;
      });
      if (fresh.length) setItems((prev) => [...prev, ...fresh]);
      setHasMore(fresh.length > 0);
    } catch {
      setHasMore(false);
    } finally {
      inFlightRef.current = false;
      setLoading(false);
      setLoadingMore(false);
    }
  }, [feedType]);

  useEffect(() => {
    seenRef.current.clear();
    setItems([]);
    setHasMore(true);
    setLoading(true);
    void loadMore();
  }, [feedType, loadMore]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !inFlightRef.current) void loadMore();
      },
      { root: scrollRoot ?? null, rootMargin: '300px', threshold: 0.1 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadMore, scrollRoot, items.length]);

  const meta = LABELS[feedType];
  const EmptyIcon = meta.icon;

  if (loading && items.length === 0) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-12 w-12 animate-spin text-sky-500" />
      </div>
    );
  }

  if (!loading && items.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-100 bg-white/90 p-12 text-center shadow-sm">
        <EmptyIcon className="mx-auto mb-4 h-16 w-16 text-slate-300" />
        <h2 className="mb-2 text-xl font-semibold text-slate-700">{meta.title}</h2>
        <p className="text-slate-600">{meta.empty}</p>
      </div>
    );
  }

  return (
    <>
      <div className={MEDIA_GRID_CLASS}>
        {items.map((item) => (
          <div key={item._id} className="flex h-full min-h-[300px] w-full flex-col overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
            <TVGridTileWithObserver
              scrollRoot={(scrollRoot as HTMLDivElement) ?? null}
              item={item}
              variant="grid"
              currentUserId={currentUserId}
              relatedVideos={items}
              loginHref={loginHref}
            />
          </div>
        ))}
      </div>
      <div ref={sentinelRef} className="flex min-h-[80px] justify-center py-8">
        {loadingMore ? <Loader2 className="h-8 w-8 animate-spin text-sky-500" /> : <div className="h-4" aria-hidden />}
      </div>
    </>
  );
}
