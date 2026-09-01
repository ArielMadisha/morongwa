'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { getImageUrl, getImageUrlFull } from '@/lib/api';
import { tvAPI } from '@/lib/api';
import { looksLikeAudioUrl, looksLikeVideoUrl } from '@/lib/tvMedia';
import { Plus } from 'lucide-react';
import { FollowButton, seedFollowStatusCache } from '@/components/FollowButton';
import { userPublicDisplayName } from '@/lib/userDisplayLabel';
import { StatusStoryViewer } from '@/components/tv/StatusStoryViewer';
import { sortStatusStripNewestFirst } from '@/lib/statusStripSort';
import { useFeedAutoRefresh } from '@/lib/useFeedAutoRefresh';

/** Ensure every status row has posts[] (oldest-first) for the story viewer. */
function normalizeStatusItem(s: StatusItem): StatusItem {
  const posts =
    s.posts?.length ? s.posts : s.latestPost?._id ? [s.latestPost] : [];
  const latestPost = posts.length ? posts[posts.length - 1] : s.latestPost ?? null;
  return { ...s, posts, latestPost };
}

export interface StatusPost {
  _id: string;
  type: string;
  mediaUrls: string[];
  /** Audio post cover image */
  artworkUrl?: string;
  createdAt: string;
}

export interface StatusItem {
  /** Unique row id — user id or `store:{supplierId}` for marketplace stores */
  statusKey?: string;
  userId: string;
  name?: string;
  username?: string;
  avatar?: string;
  isSchoolAccount?: boolean;
  isLive?: boolean;
  /** Store/supplier status — label is the shop name, not the uploader */
  isStoreStatus?: boolean;
  /** Food & Restaurant store — header links to Order Food menu */
  isFoodStore?: boolean;
  supplierId?: string;
  storeSlug?: string;
  isFollowing?: boolean;
  followStatus?: 'accepted' | 'pending' | null;
  /** Most recent post — used for the ring thumbnail */
  latestPost?: StatusPost | null;
  /** All posts in the last 24h — oldest first (story viewer) */
  posts?: StatusPost[];
}

interface StatusesStripProps {
  currentUserId?: string;
  userAvatar?: string;
  stripBackgroundPic?: string;
  onAddStatus?: () => void;
  /** When this changes, statuses are refetched (e.g. after creating a post) */
  refreshTrigger?: number;
  /** Optimistic: current user's just-created post to show immediately in the strip */
  currentUserLatestPost?: {
    _id: string;
    type: string;
    mediaUrls: string[];
    artworkUrl?: string;
    createdAt?: string;
  } | null;
  /** Current user's name (for optimistic status display) */
  currentUserName?: string;
  /** Pause interval/focus refresh while create modal is open (avoids mid-compose jank on mobile). */
  autoRefreshEnabled?: boolean;
}

export function StatusesStrip({
  currentUserId,
  userAvatar,
  stripBackgroundPic,
  onAddStatus,
  refreshTrigger,
  currentUserLatestPost,
  currentUserName,
  autoRefreshEnabled = true,
}: StatusesStripProps) {
  const [statuses, setStatuses] = useState<StatusItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const stripRef = useRef<HTMLDivElement>(null);

  const fetchStatuses = useCallback(() => {
    tvAPI
      .getStatuses()
      .then((res) => {
        const data = res.data?.data ?? res.data ?? [];
        const list = Array.isArray(data)
          ? (data as StatusItem[]).map(normalizeStatusItem)
          : [];
        if (currentUserId) {
          for (const s of list) {
            const uid = String(s.userId?._id ?? s.userId);
            if (!uid || uid === currentUserId || s.isFollowing === undefined) continue;
            seedFollowStatusCache(
              currentUserId,
              uid,
              !!s.isFollowing,
              s.followStatus ?? null
            );
          }
        }
        setStatuses(sortStatusStripNewestFirst(list));
      })
      .catch(() => setStatuses([]))
      .finally(() => setLoading(false));
  }, [currentUserId]);

  useEffect(() => {
    fetchStatuses();
  }, [refreshTrigger, fetchStatuses]);

  useEffect(() => {
    if (!currentUserId || !userAvatar) return;
    setStatuses((prev) =>
      prev.map((s) => {
        const uid = String(s.userId?._id ?? s.userId);
        if (uid !== currentUserId) return s;
        return { ...s, avatar: userAvatar };
      })
    );
  }, [currentUserId, userAvatar]);

  useFeedAutoRefresh({
    enabled: autoRefreshEnabled,
    onRefresh: fetchStatuses,
  });

  useEffect(() => {
    const onRefresh = () => fetchStatuses();
    window.addEventListener('qwertymates:status-strip-refresh', onRefresh);
    return () => window.removeEventListener('qwertymates:status-strip-refresh', onRefresh);
  }, [fetchStatuses]);

  // Merge current user's just-created post into statuses (optimistic update)
  const displayStatuses = useMemo(() => {
    if (!currentUserLatestPost?.mediaUrls?.length || !currentUserId) {
      return sortStatusStripNewestFirst(statuses);
    }
    const newPost: StatusPost = {
      _id: currentUserLatestPost._id,
      type: currentUserLatestPost.type,
      mediaUrls: currentUserLatestPost.mediaUrls,
      artworkUrl: currentUserLatestPost.artworkUrl,
      createdAt: currentUserLatestPost.createdAt ?? new Date().toISOString(),
    };
    const existing = statuses.find((s) => String(s.userId?._id ?? s.userId) === currentUserId);
    if (existing) {
      const byId = new Map<string, StatusPost>();
      for (const p of existing.posts ?? (existing.latestPost ? [existing.latestPost] : [])) {
        byId.set(p._id, p);
      }
      byId.set(newPost._id, newPost);
      const merged = [...byId.values()].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
      const myStatus: StatusItem = {
        ...existing,
        latestPost: merged[merged.length - 1],
        posts: merged,
      };
      const others = statuses.filter((s) => String(s.userId?._id ?? s.userId) !== currentUserId);
      return sortStatusStripNewestFirst([myStatus, ...others]);
    }
    const myStatus: StatusItem = {
      userId: currentUserId,
      name: currentUserName,
      avatar: userAvatar,
      latestPost: newPost,
      posts: [newPost],
    };
    return sortStatusStripNewestFirst([myStatus, ...statuses]);
  }, [statuses, currentUserLatestPost, currentUserId, currentUserName, userAvatar]);

  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    el.scrollLeft = 0;
    el.parentElement?.scrollTo?.({ left: 0 });
  }, [
    refreshTrigger,
    displayStatuses[0]?.statusKey,
    displayStatuses[0]?.latestPost?._id,
    displayStatuses[0]?.latestPost?.createdAt,
  ]);

  /** Status ring must be a real image URL — never video/audio/HLS as <img src>. */
  const statusStripThumbUrl = (s: StatusItem): string | undefined => {
    const avatarUrl = s.avatar ? getImageUrl(s.avatar) : undefined;
    const post = s.latestPost;
    if (!post) return avatarUrl;

    const firstMedia = post.mediaUrls?.[0];
    const t = post.type;

    if (t === 'video' || (firstMedia && looksLikeVideoUrl(firstMedia))) {
      return avatarUrl;
    }
    if (t === 'audio') {
      if (post.artworkUrl) return getImageUrl(post.artworkUrl);
      return avatarUrl;
    }
    if (t === 'text') {
      return avatarUrl;
    }
    if (t === 'image' || t === 'carousel' || t === 'product') {
      if (firstMedia && !looksLikeVideoUrl(firstMedia) && !looksLikeAudioUrl(firstMedia)) {
        return getImageUrl(firstMedia);
      }
      return avatarUrl;
    }
    if (firstMedia && !looksLikeVideoUrl(firstMedia) && !looksLikeAudioUrl(firstMedia)) {
      return getImageUrl(firstMedia);
    }
    return avatarUrl;
  };

  if (loading && statuses.length === 0) return null;

  const openViewer = (idx: number) => {
    setViewerIndex(idx);
    setViewerOpen(true);
  };

  const stripBgStyle = stripBackgroundPic
    ? { backgroundImage: `url(${getImageUrl(stripBackgroundPic)})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : {};

  return (
    <>
    <div
      ref={stripRef}
      className="flex gap-2 sm:gap-4 overflow-x-auto pb-1.5 sm:pb-2 scroll-smooth [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden min-h-[64px] sm:min-h-[72px] rounded-xl px-1.5 sm:px-3 py-1 items-start"
      style={stripBgStyle}
    >
      {onAddStatus && (
        <div className="flex-shrink-0 flex flex-col items-center gap-1">
          <button
            type="button"
            onClick={onAddStatus}
            className="flex-shrink-0 relative flex flex-col items-center justify-center gap-0.5 cursor-pointer group w-10 h-10 sm:w-14 sm:h-14 rounded-full bg-sky-500 hover:bg-sky-600 text-white transition-colors border-0 overflow-hidden"
            aria-label="Create post"
          >
            {userAvatar ? (
              <>
                <img
                  src={getImageUrl(userAvatar)}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-sky-900/40 flex flex-col items-center justify-center">
                  <Plus className="h-4 w-4 sm:h-5 sm:w-5" strokeWidth={2.5} />
                </div>
              </>
            ) : (
              <Plus className="h-4 w-4 sm:h-5 sm:w-5" strokeWidth={2.5} />
            )}
          </button>
          <span className="text-[9px] sm:text-[10px] font-semibold leading-tight text-slate-700">create</span>
        </div>
      )}
      {displayStatuses.map((s, idx) => {
        const uid = String(s.userId?._id ?? s.userId);
        const rowKey = s.statusKey || uid;
        const thumb = statusStripThumbUrl(s);
        const label = s.isStoreStatus
          ? (s.name?.trim() || 'Store')
          : userPublicDisplayName({
              name: s.name,
              username: s.username,
              isSchoolAccount: s.isSchoolAccount,
            });
        const statusPost = s.latestPost;
        const storyCount = s.posts?.length ?? (statusPost?._id ? 1 : 0);
        const canOpenStory = !!statusPost?._id;
        return (
        <div
          key={rowKey}
          className="flex-shrink-0 flex flex-col items-center gap-1"
        >
          <button
            type="button"
            onClick={() => canOpenStory && openViewer(idx)}
            disabled={!canOpenStory}
            className="flex flex-col items-center gap-1 cursor-pointer group disabled:opacity-50 disabled:cursor-not-allowed border-0 bg-transparent p-0"
            aria-label={
              statusPost?._id
                ? `View ${label}'s status${storyCount > 1 ? ` (${storyCount} pictures)` : ''}`
                : `View ${label}'s posts`
            }
          >
            <div className="relative">
              <div
                className={`w-10 h-10 sm:w-14 sm:h-14 rounded-full p-0.5 flex-shrink-0 bg-gradient-to-tr from-sky-500 via-purple-500 to-pink-500 ${
                  s.isLive ? 'animate-pulse' : ''
                }`}
              >
                <div className="w-full h-full rounded-full overflow-hidden bg-white p-0.5">
                  {thumb ? (
                    <img
                      src={thumb}
                      alt=""
                      className="w-full h-full object-cover rounded-full"
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        const el = e.currentTarget;
                        const avatarFallback = s.avatar ? getImageUrl(s.avatar) : '';
                        const full = getImageUrlFull(thumb);
                        if (full && el.src !== full) {
                          el.src = full;
                          return;
                        }
                        if (avatarFallback && el.src !== avatarFallback) {
                          el.src = avatarFallback;
                          return;
                        }
                        const avatarFull = s.avatar ? getImageUrlFull(s.avatar) : '';
                        if (avatarFull && el.src !== avatarFull) el.src = avatarFull;
                      }}
                    />
                  ) : (
                    <div className="w-full h-full rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-semibold text-lg">
                      {(label || '?')[0]}
                    </div>
                  )}
                </div>
              </div>
              {s.isLive ? (
                <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded text-[9px] sm:text-[10px] font-bold bg-red-500 text-white whitespace-nowrap">
                  LIVE
                </span>
              ) : null}
            </div>
            <span
              className="text-[9px] sm:text-[10px] font-semibold leading-tight text-slate-700 text-center line-clamp-2 max-w-[64px] sm:max-w-[80px]"
              title={label}
            >
              {label}
            </span>
          </button>
          <div onClick={(e) => e.stopPropagation()}>
            <FollowButton
              targetUserId={uid}
              currentUserId={currentUserId}
              initialFollowing={s.isFollowing}
              initialStatus={s.followStatus ?? null}
              className="!px-1.5 !py-0.5 !text-[9px] sm:!px-2 sm:!py-1 sm:!text-[10px]"
            />
          </div>
        </div>
      );
      })}
    </div>
    <StatusStoryViewer
      open={viewerOpen}
      onClose={() => setViewerOpen(false)}
      statuses={displayStatuses}
      startIndex={viewerIndex}
    />
    </>
  );
}
