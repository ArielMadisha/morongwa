'use client';

import { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, Tv } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useCartAndStores } from '@/lib/useCartAndStores';
import { AppSidebar, AppSidebarMenuButton } from '@/components/AppSidebar';
import { SearchButton } from '@/components/SearchButton';
import { TVGridTile } from '@/components/tv/TVGridTile';
import type { TVGridItem } from '@/components/tv/TVGridTile';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { productsAPI, tvAPI, usersAPI } from '@/lib/api';
import { mapProductToTvTile } from '@/lib/mapProductToTvTile';
import { tvGridItemFromStatusStripRow } from '@/lib/statusStripTvItem';
import { creatorDisplayLabel, userPublicDisplayName } from '@/lib/userDisplayLabel';
import { StatusStoryViewer } from '@/components/tv/StatusStoryViewer';
import type { StatusItem } from '@/components/tv/StatusesStrip';
import { loadStatusPost } from '@/lib/loadStatusPost';

function UserFeedContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const userId = params.userId as string;
  const statusId = (searchParams.get('status') || '').trim();
  const statusKind = (searchParams.get('kind') || '').trim().toLowerCase();
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [feedItems, setFeedItems] = useState<TVGridItem[]>([]);
  const [statusItem, setStatusItem] = useState<TVGridItem | null>(null);
  const [profileName, setProfileName] = useState('');
  const [loading, setLoading] = useState(true);
  const [likedMap, setLikedMap] = useState<Record<string, boolean>>({});
  const [statusViewerRows, setStatusViewerRows] = useState<StatusItem[]>([]);
  const [statusViewerOpen, setStatusViewerOpen] = useState(false);
  const { cartCount, hasStore } = useCartAndStores(!!user);

  const items = useMemo(() => {
    if (!statusItem) return feedItems;
    const rest = feedItems.filter((i) => String(i._id) !== String(statusItem._id));
    return [statusItem, ...rest];
  }, [statusItem, feedItems]);

  const loadStatusFromStrip = useCallback(async (): Promise<TVGridItem | null> => {
    if (!statusId || !userId) return null;
    try {
      const res = await tvAPI.getStatuses();
      const data = res.data?.data ?? res.data ?? [];
      const list = Array.isArray(data) ? data : [];
      const row = list.find((s: { userId?: string | { _id?: string } }) => String(s.userId?._id ?? s.userId) === userId);
      if (!row?.latestPost || String(row.latestPost._id) !== statusId) return null;
      return tvGridItemFromStatusStripRow(row, userId);
    } catch {
      return null;
    }
  }, [statusId, userId]);

  const loadStatus = useCallback(async () => {
    if (!statusId) {
      setStatusItem(null);
      return;
    }
    if (statusId.startsWith('join-')) {
      const fromStrip = await loadStatusFromStrip();
      setStatusItem(fromStrip);
      return;
    }

    const tryTvPost = async () => {
      const res = await tvAPI.getPost(statusId);
      const post = res.data?.data ?? res.data;
      if (post?._id) {
        setStatusItem(post as TVGridItem);
        return true;
      }
      return false;
    };

    const tryProduct = async () => {
      const res = await productsAPI.getByIdOrSlug(statusId);
      const product = res.data?.data ?? res.data;
      if (product?._id) {
        setStatusItem(mapProductToTvTile(product));
        return true;
      }
      return false;
    };

    try {
      if (statusKind === 'product') {
        if (await tryProduct()) return;
        if (await tryTvPost()) return;
      } else if (statusKind) {
        if (await tryTvPost()) return;
        if (statusKind === 'product' && (await tryProduct())) return;
      } else {
        if (await tryTvPost()) return;
        if (await tryProduct()) return;
      }
    } catch {
      /* fall through to statuses strip snapshot */
    }

    const fromStrip = await loadStatusFromStrip();
    setStatusItem(fromStrip);
  }, [statusId, statusKind, loadStatusFromStrip]);

  const loadFeed = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await tvAPI.getFeed({ creatorId: userId, limit: 100, sort: 'newest' });
      const data = res.data?.data ?? res.data ?? [];
      setFeedItems(Array.isArray(data) ? data : []);
    } catch {
      setFeedItems([]);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    Promise.all([loadStatus(), loadFeed()]).finally(() => setLoading(false));
  }, [userId, loadStatus, loadFeed]);

  /** Landed on user TV page without ?status= — open story viewer if they have a ring on the wall. */
  useEffect(() => {
    if (statusId || !userId || loading) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await tvAPI.getStatuses();
        const data = res.data?.data ?? res.data ?? [];
        const list = (Array.isArray(data) ? data : []) as StatusItem[];
        const idx = list.findIndex((s) => String(s.userId?._id ?? s.userId) === userId);
        if (cancelled || idx < 0 || !list[idx]?.latestPost?._id) return;
        setStatusViewerRows(list);
        setStatusViewerOpen(true);
      } catch {
        /* no strip row */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [statusId, userId, loading]);

  /** Deep link ?status= — open Facebook-style viewer instead of empty TV page */
  useEffect(() => {
    if (!statusId || !userId) {
      setStatusViewerOpen(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await tvAPI.getStatuses();
        const data = res.data?.data ?? res.data ?? [];
        const list = (Array.isArray(data) ? data : []) as StatusItem[];
        if (cancelled) return;
        const idx = list.findIndex((s) => String(s.userId?._id ?? s.userId) === userId);
        if (idx >= 0 && list[idx]?.latestPost) {
          setStatusViewerRows(list);
          setStatusViewerOpen(true);
          return;
        }
        const profileRes = await usersAPI.getProfileStats(userId);
        const u = profileRes.data?.user ?? profileRes.data;
        const synthetic: StatusItem = {
          userId,
          name: u ? userPublicDisplayName(u) : profileName,
          avatar: u?.avatar,
          latestPost: {
            _id: statusId,
            type: statusKind || 'image',
            mediaUrls: [],
            createdAt: new Date().toISOString(),
          },
        };
        const loaded = await loadStatusPost(synthetic, userId);
        if (loaded?.mediaUrls?.length) {
          synthetic.latestPost = {
            _id: statusId,
            type: loaded.type,
            mediaUrls: loaded.mediaUrls || [],
            artworkUrl: loaded.artworkUrl,
            createdAt: loaded.createdAt,
          };
        }
        setStatusViewerRows([synthetic]);
        setStatusViewerOpen(true);
      } catch {
        if (!cancelled) setStatusViewerOpen(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [statusId, statusKind, userId, profileName]);

  const closeStatusViewer = useCallback(() => {
    setStatusViewerOpen(false);
    if (statusId) {
      router.replace(`/user/${userId}`);
      return;
    }
    router.push('/wall');
  }, [router, userId, statusId]);

  useEffect(() => {
    if (!userId) return;
    usersAPI
      .getProfile(userId)
      .then((res) => {
        const u = res.data?.data ?? res.data;
        if (u) setProfileName(userPublicDisplayName(u));
      })
      .catch(() => setProfileName(''));
  }, [userId]);

  const patchItem = useCallback((id: string, patch: Partial<TVGridItem> | ((p: TVGridItem) => TVGridItem)) => {
    const apply = (p: TVGridItem) => (typeof patch === 'function' ? patch(p) : { ...p, ...patch });
    setStatusItem((prev) => (prev && String(prev._id) === id ? apply(prev) : prev));
    setFeedItems((prev) => prev.map((p) => (String(p._id) === id ? apply(p) : p)));
  }, []);

  const removeItem = useCallback((id: string) => {
    setStatusItem((prev) => (prev && String(prev._id) === id ? null : prev));
    setFeedItems((prev) => prev.filter((p) => String(p._id) !== id));
  }, []);

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  const handleLike = (id: string, liked: boolean) => {
    setLikedMap((m) => ({ ...m, [id]: liked }));
    patchItem(id, (p) => ({
      ...p,
      likeCount: Math.max(0, (p.likeCount ?? 0) + (liked ? 1 : -1)),
    }));
    tvAPI
      .like(id)
      .then((res) => {
        const likeCount = res.data?.data?.likeCount ?? res.data?.likeCount;
        if (typeof likeCount === 'number') {
          patchItem(id, { likeCount });
        }
      })
      .catch(() => {
        setLikedMap((m) => ({ ...m, [id]: !liked }));
      });
  };

  const handleRepost = (id: string) => {
    tvAPI.repost(id).then((res) => {
      const newPost = res.data?.data ?? res.data;
      if (newPost) setFeedItems((prev) => [newPost, ...prev]);
    });
  };

  const handleCommentAdded = (id: string) => {
    patchItem(id, (p) => ({ ...p, commentCount: (p.commentCount ?? 0) + 1 }));
  };

  const creatorName =
    creatorDisplayLabel(statusItem?.creatorId, '') ||
    creatorDisplayLabel(feedItems[0]?.creatorId, '') ||
    profileName ||
    'User';

  const emptyMessage = statusId
    ? 'This status could not be loaded. It may have expired or been removed.'
    : 'No posts yet';

  return (
    <div className="min-h-screen bg-slate-900 text-white flex">
      <StatusStoryViewer
        open={statusViewerOpen && (!!statusId || statusViewerRows.length > 0)}
        onClose={closeStatusViewer}
        statuses={statusViewerRows}
        startIndex={Math.max(
          0,
          statusViewerRows.findIndex((s) => String(s.userId?._id ?? s.userId) === userId)
        )}
      />
      <AppSidebar
        variant="wall"
        userName={user?.name}
        userAvatar={(user as any)?.avatar}
        userId={user?._id || user?.id}
        cartCount={cartCount}
        hasStore={hasStore}
        onLogout={handleLogout}
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
      />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="flex-shrink-0 bg-black/40 backdrop-blur-sm border-b border-white/10">
          <div className="px-4 py-3 flex items-center justify-between">
            <Link
              href="/morongwa-tv"
              className="flex items-center gap-2 text-white/90 hover:text-white"
            >
              <ArrowLeft className="h-5 w-5" />
              <span className="text-sm font-medium">{creatorName}</span>
            </Link>
            <div className="flex-1 min-w-0" />
            <SearchButton />
            <AppSidebarMenuButton onClick={() => setMenuOpen((v) => !v)} />
          </div>
        </header>

        <div
          className="flex-1 overflow-y-auto overflow-x-hidden snap-y snap-mandatory overscroll-contain"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {loading ? (
            <div className="min-h-[60vh] flex items-center justify-center">
              <Loader2 className="h-12 w-12 animate-spin text-sky-400" />
            </div>
          ) : items.length === 0 ? (
            <div className="min-h-[60vh] flex flex-col items-center justify-center px-6">
              <Tv className="h-16 w-16 text-slate-600 mb-4" />
              <p className="text-slate-400 text-center mb-6">{emptyMessage}</p>
              <Link
                href="/morongwa-tv"
                className="text-sky-400 hover:text-sky-300 font-medium"
              >
                Back to Qwerty TV
              </Link>
            </div>
          ) : (
            items.map((item) => (
              <div
                key={item._id}
                className="min-h-[100dvh] min-h-[100svh] snap-start snap-always flex items-center justify-center py-2 px-1 pb-24 lg:px-4 lg:py-4 lg:pb-8"
              >
                <div className="w-full max-w-[min(98vw,1280px)] h-[min(86dvh,920px)] mx-auto flex items-center justify-center min-h-0">
                  <TVGridTile
                    item={item}
                    liked={likedMap[item._id]}
                    onLike={handleLike}
                    onRepost={item.type !== 'product_tile' ? handleRepost : undefined}
                    onCommentAdded={item.type !== 'product_tile' ? handleCommentAdded : undefined}
                    onDelete={(id) => removeItem(id)}
                    onMediaUnavailable={(id) => removeItem(id)}
                    currentUserId={user?._id || user?.id}
                    isVisible={true}
                    variant="grid"
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      <MobileBottomNav cartCount={cartCount} hasStore={hasStore} />
    </div>
  );
}

export default function UserFeedPage() {
  return (
    <ProtectedRoute>
      <Suspense
        fallback={
          <div className="min-h-screen bg-slate-900 flex items-center justify-center">
            <Loader2 className="h-12 w-12 animate-spin text-sky-400" />
          </div>
        }
      >
        <UserFeedContent />
      </Suspense>
    </ProtectedRoute>
  );
}
