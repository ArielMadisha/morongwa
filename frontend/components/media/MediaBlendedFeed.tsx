'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Loader2, Lock, Mic, Music2, Pause, Play, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import { MEDIA_GRID_CLASS } from '@/components/media/MediaPageShell';
import { TVGridTileWithObserver } from '@/components/tv/TVGridTileWithObserver';
import type { TVGridItem } from '@/components/tv/TVGridTile';
import { getImageUrl, musicAPI, podcastsAPI, tvAPI } from '@/lib/api';
import type { PodcastEpisodeRecord, SongRecord } from '@/lib/api';

type BlendedItem =
  | { kind: 'tv'; key: string; post: TVGridItem }
  | { kind: 'music'; key: string; song: SongRecord }
  | { kind: 'podcast'; key: string; episode: PodcastEpisodeRecord };

const TV_PER_PAGE = 6;
const TEXT_PER_PAGE = 6;
const PRODUCT_PER_PAGE = 4;
const MUSIC_PER_PAGE = 4;
const PODCAST_PER_PAGE = 4;
const MAX_PAGES = 12;

/** Deterministic-per-visit RNG so a single browsing session keeps a stable blended order. */
function makeRng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

/**
 * Weighted random merge: each step picks the next item from a still-unfinished source,
 * so TV/music/podcast items are shuffled together while each source keeps its own ordering.
 */
function interleave(groups: BlendedItem[][], rng: () => number): BlendedItem[] {
  const queues = groups.map((g) => [...g]).filter((g) => g.length > 0);
  const out: BlendedItem[] = [];
  while (queues.length) {
    let total = 0;
    for (const q of queues) total += q.length;
    let pick = rng() * total;
    let idx = 0;
    for (let i = 0; i < queues.length; i++) {
      pick -= queues[i].length;
      if (pick <= 0) {
        idx = i;
        break;
      }
    }
    const next = queues[idx].shift();
    if (next) out.push(next);
    if (!queues[idx].length) queues.splice(idx, 1);
  }
  return out;
}

function mediaUrl(url?: string) {
  if (!url) return '';
  return getImageUrl(url) || url;
}

function formatDuration(seconds?: number) {
  if (!seconds || seconds <= 0) return '';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function MusicCard({ song }: { song: SongRecord }) {
  const artwork = mediaUrl(song.artworkUrl);
  return (
    <div className="flex h-full min-h-[300px] flex-col overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
      <div className="relative flex aspect-square items-center justify-center overflow-hidden bg-slate-100">
        {artwork ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={artwork} alt="" className="h-full w-full object-cover" />
        ) : (
          <Music2 className="h-12 w-12 text-slate-300" />
        )}
        <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-violet-600/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
          <Music2 className="h-3 w-3" />
          Music
        </span>
      </div>
      <div className="flex-1 p-3">
        <p className="truncate text-sm font-semibold text-slate-900" title={song.title}>
          {song.title}
        </p>
        <p className="truncate text-xs text-slate-600">{song.artist}</p>
        {song.genre ? <p className="truncate text-[11px] text-slate-500">{song.genre}</p> : null}
      </div>
      <div className="px-2 pb-2">
        <audio src={mediaUrl(song.audioUrl)} controls className="h-9 w-full" preload="none" />
      </div>
    </div>
  );
}

function PodcastCard({
  episode,
  playing,
  onToggle,
}: {
  episode: PodcastEpisodeRecord;
  playing: boolean;
  onToggle: (ep: PodcastEpisodeRecord) => void;
}) {
  const cover = mediaUrl(episode.coverUrl);
  const showTitle = typeof episode.podcastId === 'object' ? episode.podcastId?.title : undefined;
  return (
    <div className="flex h-full min-h-[300px] flex-col overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
      <div className="relative flex aspect-square items-center justify-center overflow-hidden bg-slate-100">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" className="h-full w-full object-cover" />
        ) : (
          <Mic className="h-12 w-12 text-slate-300" />
        )}
        <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-amber-500/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
          <Mic className="h-3 w-3" />
          Podcast
        </span>
      </div>
      <div className="flex-1 p-3">
        <Link
          href={`/qwerty-media/podcasts/${episode._id}`}
          className="block truncate text-sm font-semibold text-slate-900 hover:text-amber-700"
          title={episode.title}
        >
          {episode.title}
        </Link>
        <p className="truncate text-xs text-slate-500">
          {showTitle ? `${showTitle} · ` : ''}
          {formatDuration(episode.durationSeconds) || 'Audio'}
        </p>
      </div>
      <div className="px-3 pb-3">
        <button
          type="button"
          onClick={() => onToggle(episode)}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-600"
        >
          {episode.locked ? (
            <>
              <Lock className="h-4 w-4" />
              Unlock R{episode.price}
            </>
          ) : playing ? (
            <>
              <Pause className="h-4 w-4" />
              Pause
            </>
          ) : (
            <>
              <Play className="h-4 w-4" />
              Play episode
            </>
          )}
        </button>
      </div>
    </div>
  );
}

/**
 * QwertyMedia hub feed — videos, text posts, products, music and podcasts
 * blended into one randomized, paged feed.
 */
export function MediaBlendedFeed({
  currentUserId,
  scrollRoot,
}: {
  currentUserId?: string;
  scrollRoot?: HTMLElement | null;
}) {
  const [items, setItems] = useState<BlendedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pageRef = useRef(0);
  const seenRef = useRef<Set<string>>(new Set());
  const rngRef = useRef(makeRng(Math.floor(Math.random() * 1_000_000) + 1));
  const sentinelRef = useRef<HTMLDivElement>(null);
  const inFlightRef = useRef(false);

  useEffect(() => () => audioRef.current?.pause(), []);

  const loadPage = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    const page = pageRef.current + 1;
    if (page === 1) setLoading(true);
    else setLoadingMore(true);
    try {
      const [tvRes, textRes, productRes, musicRes, podcastRes] = await Promise.allSettled([
        tvAPI.getFeed({ page, limit: TV_PER_PAGE, type: 'video', sort: 'random' }),
        tvAPI.getFeed({ page, limit: TEXT_PER_PAGE, type: 'text', sort: 'random' }),
        tvAPI.getFeed({ page, limit: PRODUCT_PER_PAGE, type: 'product', sort: 'random' }),
        musicAPI.getSongs({ page, limit: MUSIC_PER_PAGE, type: 'song', random: true }),
        podcastsAPI.listEpisodes({ page, limit: PODCAST_PER_PAGE, sort: 'newest' }),
      ]);

      const tvPosts: TVGridItem[] =
        tvRes.status === 'fulfilled' ? (tvRes.value.data?.data ?? tvRes.value.data ?? []) : [];
      const textPosts: TVGridItem[] =
        textRes.status === 'fulfilled' ? (textRes.value.data?.data ?? textRes.value.data ?? []) : [];
      const productPosts: TVGridItem[] =
        productRes.status === 'fulfilled' ? (productRes.value.data?.data ?? productRes.value.data ?? []) : [];
      const songs: SongRecord[] = musicRes.status === 'fulfilled' ? musicRes.value.data?.data ?? [] : [];
      const episodes: PodcastEpisodeRecord[] =
        podcastRes.status === 'fulfilled' ? podcastRes.value.data?.data ?? [] : [];

      const fresh = <T,>(rows: T[], keyOf: (row: T) => string) =>
        rows.filter((row) => {
          const key = keyOf(row);
          if (!key || seenRef.current.has(key)) return false;
          seenRef.current.add(key);
          return true;
        });

      const tvGroup: BlendedItem[] = fresh(Array.isArray(tvPosts) ? tvPosts : [], (p) => `tv-${p._id}`).map((post) => ({
        kind: 'tv' as const,
        key: `tv-${post._id}`,
        post,
      }));
      const textGroup: BlendedItem[] = fresh(Array.isArray(textPosts) ? textPosts : [], (p) => `text-${p._id}`).map(
        (post) => ({
          kind: 'tv' as const,
          key: `text-${post._id}`,
          post,
        })
      );
      const productGroup: BlendedItem[] = fresh(
        Array.isArray(productPosts) ? productPosts : [],
        (p) => `product-${p._id}`
      ).map((post) => ({
        kind: 'tv' as const,
        key: `product-${post._id}`,
        post,
      }));
      const musicGroup: BlendedItem[] = fresh(songs, (s) => `music-${s._id}`).map((song) => ({
        kind: 'music' as const,
        key: `music-${song._id}`,
        song,
      }));
      const podcastGroup: BlendedItem[] = fresh(episodes, (e) => `podcast-${e._id}`).map((episode) => ({
        kind: 'podcast' as const,
        key: `podcast-${episode._id}`,
        episode,
      }));

      const merged = interleave([tvGroup, textGroup, productGroup, musicGroup, podcastGroup], rngRef.current);
      pageRef.current = page;
      if (merged.length) setItems((prev) => [...prev, ...merged]);
      setHasMore(merged.length > 0 && page < MAX_PAGES);
    } catch {
      setHasMore(false);
    } finally {
      inFlightRef.current = false;
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !inFlightRef.current) void loadPage();
      },
      { root: scrollRoot ?? null, rootMargin: '300px', threshold: 0.1 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadPage, scrollRoot, items.length]);

  const togglePodcast = useCallback(
    (episode: PodcastEpisodeRecord) => {
      if (episode.locked) {
        toast.error('Unlock this premium episode in QwertyPodcasts to listen.');
        return;
      }
      const src = mediaUrl(episode.audioUrl);
      if (!src) return;
      if (playingId === episode._id) {
        audioRef.current?.pause();
        setPlayingId(null);
        return;
      }
      audioRef.current?.pause();
      const el = new Audio(src);
      audioRef.current = el;
      el.onended = () => setPlayingId(null);
      void el.play().catch(() => toast.error('Playback failed'));
      setPlayingId(episode._id);
      void podcastsAPI.recordPlay(episode._id).catch(() => undefined);
    },
    [playingId]
  );

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
        <Sparkles className="mx-auto mb-4 h-16 w-16 text-slate-300" />
        <h2 className="mb-2 text-xl font-semibold text-slate-700">Nothing to play yet</h2>
        <p className="text-slate-600">
          New videos, posts, products, songs and podcast episodes appear here as soon as creators publish them.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className={MEDIA_GRID_CLASS}>
        {items.map((item) => (
          <div key={item.key} className="flex h-full w-full min-w-0 flex-col">
            {item.kind === 'tv' ? (
              <div className="flex h-full min-h-[300px] w-full flex-col overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
                <TVGridTileWithObserver
                  scrollRoot={(scrollRoot as HTMLDivElement) ?? null}
                  item={item.post}
                  variant="grid"
                  currentUserId={currentUserId}
                  relatedVideos={items.filter((i) => i.kind === 'tv').map((i) => (i as { post: TVGridItem }).post)}
                  loginHref={`/login?returnTo=${encodeURIComponent('/qwerty-media')}`}
                />
              </div>
            ) : item.kind === 'music' ? (
              <MusicCard song={item.song} />
            ) : (
              <PodcastCard episode={item.episode} playing={playingId === item.episode._id} onToggle={togglePodcast} />
            )}
          </div>
        ))}
      </div>
      <div ref={sentinelRef} className="flex min-h-[80px] justify-center py-8">
        {loadingMore ? <Loader2 className="h-8 w-8 animate-spin text-sky-500" /> : <div className="h-4" aria-hidden />}
      </div>
    </>
  );
}
