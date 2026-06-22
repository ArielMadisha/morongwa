'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { Loader2, Tv, Play } from 'lucide-react';
import { getImageUrl } from '@/lib/api';
import { looksLikeVideoUrl } from '@/lib/tvMedia';
import type { TVGridItem } from './TVGridTile';
import { creatorDisplayLabel } from '@/lib/userDisplayLabel';

function formatViews(count: number) {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
}

function formatPeriod(createdAt?: string) {
  if (!createdAt) return '';
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return '';
  const now = new Date();
  const diffMs = Math.max(0, now.getTime() - created.getTime());
  const diffMin = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  const diffWeeks = Math.floor(diffDays / 7);
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffWeeks < 4) return `${diffWeeks}w ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
}

function resolveThumbSrc(thumb: string): string {
  const fromGet = getImageUrl(thumb);
  if (fromGet) return fromGet;
  if (thumb.startsWith('/')) return thumb;
  if (thumb.includes('/')) return thumb.startsWith('http') ? thumb : `/${thumb.replace(/^\//, '')}`;
  return `/uploads/tv/${thumb}`;
}

/** Muted preview clip so the first frame shows as a thumbnail (metadata preload). */
function SidebarThumbVideo({ src }: { src: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const nudgeFrame = () => {
      try {
        if (v.readyState >= 1 && Number.isFinite(v.duration) && v.duration > 0) {
          v.currentTime = Math.min(0.04, v.duration * 0.02);
        } else if (v.readyState >= 1) {
          v.currentTime = 0.001;
        }
      } catch {
        /* ignore */
      }
    };
    v.addEventListener('loadeddata', nudgeFrame);
    return () => v.removeEventListener('loadeddata', nudgeFrame);
  }, [src]);

  return (
    <video
      ref={ref}
      src={src}
      className="w-full h-full object-cover pointer-events-none"
      muted
      playsInline
      preload="metadata"
      aria-hidden
    />
  );
}

interface VideoSidebarProps {
  items: TVGridItem[];
  currentPostId?: string;
  loading?: boolean;
  creatorId?: string;
  creatorName?: string;
  /** When true, used inside modal - no sticky/height constraints */
  embedded?: boolean;
}

export function VideoSidebar({ items, currentPostId, loading, creatorId, creatorName, embedded }: VideoSidebarProps) {
  const filtered = items.filter((i) => i._id !== currentPostId && (i.type === 'video' || i.type === 'carousel'));

  return (
    <aside
      className={`flex flex-col min-h-0 h-full flex-shrink-0 ${
        embedded ? 'w-full' : 'w-full lg:w-[320px] xl:w-[360px]'
      }`}
    >
      <div className="flex flex-col min-h-0 h-full max-h-full rounded-t-2xl lg:rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-10 w-10 animate-spin text-sky-500" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-6 text-center text-slate-500">
            <Tv className="h-12 w-12 mx-auto mb-4 text-slate-300" />
            <p className="text-sm">No other videos yet</p>
          </div>
        ) : (
          <div className="flex flex-col min-h-0 flex-1">
            <div className="shrink-0 px-4 py-3 border-b border-slate-100 bg-slate-50">
              <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
                <span className="shrink-0 px-3 py-1.5 rounded-lg bg-sky-500 text-white text-sm font-medium">
                  All
                </span>
                {creatorId && creatorName && (
                  <Link
                    href={`/morongwa-tv/user/${creatorId}`}
                    className="shrink-0 px-3 py-1.5 rounded-lg bg-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-300"
                  >
                    From {creatorName}
                  </Link>
                )}
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain [scrollbar-width:thin]">
              <div className="divide-y divide-slate-100">
                {filtered.map((item) => {
                  const thumb = item.mediaUrls?.[0] || item.images?.[0];
                  const thumbSrc = thumb ? resolveThumbSrc(thumb) : '';
                  const creator = item.creatorId as { _id?: string; name?: string; avatar?: string } | undefined;
                  const title = item.heading || item.caption || item.subject || 'Video';
                  const raw = typeof title === 'string' ? title : 'Video';
                  const displayTitle = raw.length > 80 ? raw.slice(0, 80) + '...' : raw;
                  const caption = item.caption && typeof item.caption === 'string' ? item.caption.trim() : '';
                  const subject = item.subject && typeof item.subject === 'string' ? item.subject.trim() : '';
                  const infoText = caption || subject;
                  const displayInfo =
                    infoText && infoText.length > 50 ? (infoText.length > 120 ? infoText.slice(0, 120) + '...' : infoText) : null;
                  const useVideoThumb =
                    !!thumb &&
                    (item.type === 'video' || looksLikeVideoUrl(thumb) || (item.type === 'carousel' && looksLikeVideoUrl(thumb)));

                  return (
                    <Link
                      key={item._id}
                      href={`/morongwa-tv/post/${item._id}`}
                      className="flex gap-3 p-3 hover:bg-slate-50 transition-colors group"
                    >
                      <div className="relative w-36 aspect-video flex-shrink-0 rounded-lg overflow-hidden bg-slate-200">
                        {thumbSrc ? (
                          useVideoThumb ? (
                            <>
                              <SidebarThumbVideo src={thumbSrc} />
                              <div className="absolute inset-0 flex items-center justify-center bg-black/25 pointer-events-none">
                                <Play className="h-8 w-8 text-white drop-shadow-lg fill-white/90" />
                              </div>
                            </>
                          ) : (
                            <img src={thumbSrc} alt="" className="w-full h-full object-cover" />
                          )
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-slate-300">
                            <Tv className="h-8 w-8 text-slate-500" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0 py-0.5">
                        <p className="font-medium text-slate-900 text-sm line-clamp-2 group-hover:text-sky-600">
                          {displayTitle}
                        </p>
                        {displayInfo && (
                          <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                            {displayInfo}
                          </p>
                        )}
                        <p className="text-xs text-slate-500 mt-0.5 truncate">
                          {creatorDisplayLabel(creator, 'QwertyTV')}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {formatViews(item.likeCount ?? 0)} likes · {formatPeriod(item.createdAt)}
                        </p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
