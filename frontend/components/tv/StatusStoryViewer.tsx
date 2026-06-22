'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Loader2, Pause, Play, ShoppingBag, Volume2, VolumeX, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { TVGridItem } from '@/components/tv/TVGridTile';
import { getImageUrl, getImageUrlFull } from '@/lib/api';
import { loadStatusPost } from '@/lib/loadStatusPost';
import { tvGridItemFromStatusStripRow } from '@/lib/statusStripTvItem';
import { looksLikeVideoUrl } from '@/lib/tvMedia';
import { userPublicDisplayName } from '@/lib/userDisplayLabel';
import { LiveHlsPlayer } from '@/components/tv/LiveHlsPlayer';
import type { StatusItem, StatusPost } from '@/components/tv/StatusesStrip';
import { LinkifiedText } from '@/components/LinkifiedText';
import { statusProductHref, statusProductTitle } from '@/lib/statusProductLink';

type Props = {
  open: boolean;
  onClose: () => void;
  statuses: StatusItem[];
  startIndex?: number;
};

function postsForUser(row: StatusItem | undefined): StatusPost[] {
  if (!row) return [];
  if (row.posts?.length) return row.posts;
  if (row.latestPost?._id) return [row.latestPost];
  return [];
}

function primaryMedia(item: TVGridItem | null, avatarFallback?: string): string | undefined {
  if (item) {
    if (item.type === 'audio' && item.artworkUrl) return item.artworkUrl;
    const fromPost = item.mediaUrls?.find(Boolean);
    if (fromPost) return fromPost;
    if (item.type === 'product' || item.type === 'product_tile') {
      const fromProduct = item.images?.find(Boolean);
      if (fromProduct) return fromProduct;
    }
  }
  return avatarFallback || undefined;
}

function formatStatusTime(createdAt?: string): string {
  if (!createdAt) return '';
  const ms = Date.now() - new Date(createdAt).getTime();
  if (Number.isNaN(ms) || ms < 0) return '';
  const h = Math.floor(ms / 3_600_000);
  if (h < 24) return `${Math.max(1, h)}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

export function StatusStoryViewer({ open, onClose, statuses, startIndex = 0 }: Props) {
  const router = useRouter();
  const [userIndex, setUserIndex] = useState(startIndex);
  const [postIndex, setPostIndex] = useState(0);
  const [post, setPost] = useState<TVGridItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [muted, setMuted] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [mounted, setMounted] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressRef = useRef(0);
  const statusesRef = useRef(statuses);
  const loadGenRef = useRef(0);
  statusesRef.current = statuses;
  progressRef.current = progress;

  const activeUser = statuses[userIndex];
  const activePosts = useMemo(() => postsForUser(activeUser), [activeUser]);
  const activeStatusPost = activePosts[postIndex];
  const userId = activeUser ? String(activeUser.userId?._id ?? activeUser.userId) : '';
  const label = activeUser
    ? activeUser.isStoreStatus
      ? (activeUser.name?.trim() || 'Store')
      : userPublicDisplayName(activeUser)
    : 'User';
  const avatar = activeUser?.avatar;

  const clearProgressTimer = useCallback(() => {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  }, []);

  const loadAt = useCallback(async (uIdx: number, pIdx: number) => {
    const row = statusesRef.current[uIdx];
    const posts = postsForUser(row);
    const statusPost = posts[pIdx];
    if (!row || !statusPost?._id) {
      setPost(null);
      setLoading(false);
      return;
    }
    const uid = String(row.userId?._id ?? row.userId);
    const rowWithPost = { ...row, latestPost: statusPost };
    const instant = tvGridItemFromStatusStripRow(rowWithPost, uid);
    const loadId = ++loadGenRef.current;
    setProgress(0);
    if (instant?.mediaUrls?.length || instant?.type === 'text') {
      setPost(instant);
      setLoading(false);
    } else {
      setLoading(true);
      setPost(null);
    }
    try {
      const item = await loadStatusPost(rowWithPost, uid);
      if (loadGenRef.current !== loadId) return;
      if (item) setPost(item);
    } finally {
      if (loadGenRef.current === loadId) setLoading(false);
    }
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      clearProgressTimer();
      setPost(null);
      setProgress(0);
      setIsPaused(false);
      return;
    }
    const clampedUser = Math.max(0, Math.min(startIndex, Math.max(0, statuses.length - 1)));
    setUserIndex(clampedUser);
    setPostIndex(0);
  }, [open, startIndex, statuses.length, clearProgressTimer]);

  useEffect(() => {
    if (!open) return;
    const posts = postsForUser(statuses[userIndex]);
    if (postIndex >= posts.length && posts.length > 0) {
      setPostIndex(posts.length - 1);
      return;
    }
    void loadAt(userIndex, postIndex);
    setIsPaused(false);
  }, [userIndex, postIndex, open, loadAt, statuses]);

  useEffect(() => {
    if (!open || !videoRef.current) return;
    const v = videoRef.current;
    if (isPaused) {
      v.pause();
      return;
    }
    void v.play().catch(() => {});
  }, [isPaused, open, post?._id]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const goPrevUser = useCallback(() => {
    if (userIndex > 0) {
      setUserIndex((u) => u - 1);
      setPostIndex(0);
    }
  }, [userIndex]);

  const goNextUser = useCallback(() => {
    if (userIndex < statuses.length - 1) {
      setUserIndex((u) => u + 1);
      setPostIndex(0);
    } else {
      onClose();
    }
  }, [userIndex, statuses.length, onClose]);

  const goPrevPost = useCallback(() => {
    if (postIndex > 0) {
      setPostIndex((p) => p - 1);
      return;
    }
    if (userIndex > 0) {
      const prevPosts = postsForUser(statuses[userIndex - 1]);
      setUserIndex((u) => u - 1);
      setPostIndex(Math.max(0, prevPosts.length - 1));
    }
  }, [postIndex, userIndex, statuses]);

  const goNextPost = useCallback(() => {
    const posts = postsForUser(statuses[userIndex]);
    if (postIndex < posts.length - 1) {
      setPostIndex((p) => p + 1);
      return;
    }
    goNextUser();
  }, [postIndex, userIndex, statuses, goNextUser]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') goNextUser();
      if (e.key === 'ArrowLeft') goPrevUser();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, goNextUser, goPrevUser, onClose]);

  // Image stories: auto-advance progress over 6s (Facebook-like)
  useEffect(() => {
    clearProgressTimer();
    if (!open || loading || !post) return;
    const media = primaryMedia(post, avatar);
    const isVideo = post.type === 'video' || (media ? looksLikeVideoUrl(media) : false);
    if (isVideo) return;
    if (isPaused) return;

    const duration = 6000;
    const initialProgress = Math.max(0, Math.min(100, progressRef.current));
    const offsetMs = (initialProgress / 100) * duration;
    const startedAt = Date.now() - offsetMs;
    progressTimerRef.current = setInterval(() => {
      const pct = Math.min(100, ((Date.now() - startedAt) / duration) * 100);
      setProgress(pct);
      if (pct >= 100) {
        clearProgressTimer();
        goNextPost();
      }
    }, 50);
    return clearProgressTimer;
  }, [open, loading, post, userIndex, postIndex, goNextPost, clearProgressTimer, avatar, isPaused]);

  const productHref = statusProductHref(activeStatusPost, post, userId);
  const productTitle = statusProductTitle(activeStatusPost, post);

  const openProduct = useCallback(() => {
    const href = statusProductHref(activeStatusPost, post, userId);
    if (!href) return;
    onClose();
    router.push(href);
  }, [activeStatusPost, post, userId, onClose, router]);

  if (!open || !mounted) return null;

  const mediaUrl = primaryMedia(post, avatar);
  const absMedia = mediaUrl ? getImageUrl(mediaUrl) : '';
  const isHls = absMedia.includes('.m3u8');
  const isVideo = post?.type === 'video' || (absMedia ? looksLikeVideoUrl(absMedia) : false);
  const profileHref = activeUser?.isStoreStatus && activeUser.storeSlug
    ? `/store/${activeUser.storeSlug}`
    : userId
      ? `/user/${userId}`
      : '/search';
  const showTextOnly = !loading && post && post.type === 'text' && !absMedia;

  const overlay = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#0a0a0a]/98"
      role="dialog"
      aria-modal="true"
      aria-label={`${label} status`}
      onClick={onClose}
    >
      {/* Desktop prev / next — between users (unchanged) */}
      {userIndex > 0 ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            goPrevUser();
          }}
          className="hidden sm:flex absolute left-4 lg:left-8 top-1/2 -translate-y-1/2 z-40 h-12 w-12 rounded-full bg-white/10 text-white hover:bg-white/20 items-center justify-center backdrop-blur-sm border border-white/10"
          aria-label="Previous user status"
        >
          <ChevronLeft className="h-8 w-8" />
        </button>
      ) : null}
      {userIndex < statuses.length - 1 ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            goNextUser();
          }}
          className="hidden sm:flex absolute right-4 lg:right-8 top-1/2 -translate-y-1/2 z-40 h-12 w-12 rounded-full bg-white/10 text-white hover:bg-white/20 items-center justify-center backdrop-blur-sm border border-white/10"
          aria-label="Next user status"
        >
          <ChevronRight className="h-8 w-8" />
        </button>
      ) : null}

      <div
        className="relative flex h-[100dvh] w-full max-w-[min(100vw,480px)] flex-col bg-black shadow-2xl sm:rounded-xl sm:h-[min(100dvh,920px)] sm:max-h-[96vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Progress bars — one segment per picture in this user's status (tap to jump) */}
        <div className="absolute top-0 left-0 right-0 z-30 flex gap-1 px-3 pt-3 safe-area-inset-top">
          {activePosts.map((_, i) => (
            <button
              key={`${activePosts[i]?._id ?? i}`}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setPostIndex(i);
                setProgress(0);
              }}
              className="h-0.5 flex-1 rounded-full bg-white/30 overflow-hidden cursor-pointer border-0 p-0 min-w-0"
              aria-label={`View picture ${i + 1} of ${activePosts.length}`}
            >
              <div
                className="h-full bg-white transition-all duration-100 ease-linear pointer-events-none"
                style={{
                  width: i < postIndex ? '100%' : i === postIndex ? `${progress}%` : '0%',
                }}
              />
            </button>
          ))}
        </div>

        <div className="absolute top-8 left-0 right-0 z-30 flex items-center justify-between px-4 pointer-events-none">
          <Link
            href={profileHref}
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-2 min-w-0 pointer-events-auto"
          >
            <span className="h-9 w-9 rounded-full overflow-hidden border-2 border-sky-400 shrink-0 bg-slate-700">
              {avatar ? (
                <img src={getImageUrl(avatar)} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-sm font-bold text-white">
                  {(label || '?')[0]}
                </span>
              )}
            </span>
            <div className="min-w-0 text-left">
              <p className="text-sm font-semibold text-white truncate drop-shadow-md">{label}</p>
              {post?.createdAt ? (
                <p className="text-xs text-white/80 drop-shadow-md">{formatStatusTime(post.createdAt)}</p>
              ) : null}
            </div>
          </Link>
          <div className="flex items-center gap-1 pointer-events-auto">
            <button
              type="button"
              onClick={() => setIsPaused((p) => !p)}
              className="p-2 rounded-full text-white hover:bg-white/10 drop-shadow-md"
              aria-label={isPaused ? 'Resume' : 'Pause'}
            >
              {isPaused ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-full text-white hover:bg-white/10 drop-shadow-md"
              aria-label="Close"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>

        {/* Tap zones — mobile: previous / next picture within this user */}
        <button
          type="button"
          className="absolute left-0 top-0 bottom-0 z-20 w-[28%] cursor-pointer bg-transparent border-0 sm:hidden"
          aria-label="Previous picture"
          onClick={goPrevPost}
          disabled={postIndex === 0 && userIndex === 0}
        />
        <button
          type="button"
          className="absolute right-0 top-0 bottom-0 z-20 w-[28%] cursor-pointer bg-transparent border-0 sm:hidden"
          aria-label="Next picture"
          onClick={goNextPost}
        />

        <div className="relative flex-1 min-h-0 w-full">
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="h-12 w-12 animate-spin text-white" />
            </div>
          ) : !post ? (
            <div className="absolute inset-0 flex items-center justify-center px-6">
              <p className="text-white/70 text-sm text-center">This status could not be loaded.</p>
            </div>
          ) : showTextOnly ? (
            <div className="absolute inset-0 flex items-center justify-center px-8">
              <div className="text-center max-w-lg">
                <p className="text-2xl sm:text-3xl font-bold text-white">{post.heading || label}</p>
                {post.caption ? (
                  <LinkifiedText
                    text={post.caption}
                    className="mt-4 text-lg text-white/80"
                    linkClassName="underline text-sky-300 hover:text-sky-200 break-all"
                    preserveWhitespace
                  />
                ) : null}
              </div>
            </div>
          ) : isVideo && absMedia ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black">
              {isHls ? (
                <LiveHlsPlayer src={absMedia} className="max-h-full max-w-full w-full h-full object-contain" />
              ) : (
                <video
                  ref={videoRef}
                  src={absMedia}
                  className="max-h-full max-w-full w-full h-full object-contain"
                  autoPlay
                  playsInline
                  loop
                  muted={muted}
                  onTimeUpdate={(e) => {
                    const v = e.currentTarget;
                    if (v.duration && Number.isFinite(v.duration)) {
                      setProgress((v.currentTime / v.duration) * 100);
                    }
                  }}
                  onEnded={goNextPost}
                />
              )}
              <button
                type="button"
                onClick={() => setMuted((m) => !m)}
                className="absolute bottom-6 right-6 z-20 p-2.5 rounded-full bg-black/50 text-white"
                aria-label={muted ? 'Unmute' : 'Mute'}
              >
                {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
              </button>
            </div>
          ) : absMedia ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black">
              {productHref ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openProduct();
                  }}
                  className="group relative flex h-full w-full items-center justify-center border-0 bg-transparent p-0 cursor-pointer"
                  aria-label={productTitle ? `View product: ${productTitle}` : 'View product'}
                >
                  <img
                    src={absMedia}
                    alt={productTitle || ''}
                    className="max-h-full max-w-full w-auto h-auto object-contain pointer-events-none"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      const el = e.currentTarget;
                      const full = getImageUrlFull(mediaUrl!);
                      if (full && el.src !== full) el.src = full;
                    }}
                  />
                  <span className="absolute bottom-20 left-1/2 -translate-x-1/2 z-30 inline-flex items-center gap-2 rounded-full bg-sky-600/95 px-4 py-2 text-sm font-semibold text-white shadow-lg opacity-95 group-hover:bg-sky-500 group-active:scale-95 transition">
                    <ShoppingBag className="h-4 w-4" />
                    View product
                  </span>
                </button>
              ) : (
                <img
                  src={absMedia}
                  alt=""
                  className="max-h-full max-w-full w-auto h-auto object-contain"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    const el = e.currentTarget;
                    const full = getImageUrlFull(mediaUrl!);
                    if (full && el.src !== full) el.src = full;
                  }}
                />
              )}
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-white/70 text-sm">No media for this status.</p>
            </div>
          )}
        </div>

        {!loading && post?.caption && absMedia ? (
          <div className="absolute bottom-6 left-0 right-0 z-20 px-6 text-center">
            {productHref ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  openProduct();
                }}
                className="inline-block rounded-lg bg-black/50 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm pointer-events-auto max-w-full hover:bg-black/65 cursor-pointer border-0"
              >
                {post.caption}
              </button>
            ) : (
              <p className="inline-block rounded-lg bg-black/50 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm pointer-events-auto max-w-full">
                <LinkifiedText
                  text={post.caption}
                  linkClassName="underline text-sky-300 hover:text-sky-200 break-all"
                />
              </p>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
