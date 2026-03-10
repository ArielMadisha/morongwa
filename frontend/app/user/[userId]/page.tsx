'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Loader2,
  Image as ImageIcon,
  Video,
  Music2,
  LayoutGrid,
  User,
  X,
  Settings,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useCartAndStores } from '@/lib/useCartAndStores';
import { AppSidebar, AppSidebarMenuButton } from '@/components/AppSidebar';
import { SearchButton } from '@/components/SearchButton';
import { FollowButton } from '@/components/FollowButton';
import { TVGridTile } from '@/components/tv/TVGridTile';
import type { TVGridItem } from '@/components/tv/TVGridTile';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { usersAPI, tvAPI, getImageUrl } from '@/lib/api';
import toast from 'react-hot-toast';

type TabType = 'posts' | 'images' | 'videos' | 'music';

const TABS: { id: TabType; label: string; icon: React.ReactNode }[] = [
  { id: 'posts', label: 'Posts', icon: <LayoutGrid className="h-4 w-4" /> },
  { id: 'images', label: 'Images', icon: <ImageIcon className="h-4 w-4" /> },
  { id: 'videos', label: 'Videos', icon: <Video className="h-4 w-4" /> },
  { id: 'music', label: 'Music', icon: <Music2 className="h-4 w-4" /> },
];

function getThumbnailUrl(item: TVGridItem): string | null {
  if (item.type === 'product_tile' && item.images?.[0]) return item.images[0];
  if (item.mediaUrls?.[0]) return item.mediaUrls[0];
  return null;
}

function UserProfileContent() {
  const params = useParams();
  const router = useRouter();
  const userId = params.userId as string;
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileUser, setProfileUser] = useState<any>(null);
  const [stats, setStats] = useState({
    postCount: 0,
    imageCount: 0,
    videoCount: 0,
    musicCount: 0,
    followerCount: 0,
    followingCount: 0,
  });
  const [activeTab, setActiveTab] = useState<TabType>('posts');
  const [items, setItems] = useState<TVGridItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [likedMap, setLikedMap] = useState<Record<string, boolean>>({});
  const [viewingPost, setViewingPost] = useState<TVGridItem | null>(null);
  const { cartCount, hasStore } = useCartAndStores(!!user);
  const containerRef = useRef<HTMLDivElement>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);
  const limit = 12;

  const getFeedType = useCallback((tab: TabType): string | undefined => {
    if (tab === 'posts') return undefined;
    if (tab === 'images') return 'images';
    if (tab === 'videos') return 'video';
    if (tab === 'music') return 'audio';
    return undefined;
  }, []);

  const loadProfile = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await usersAPI.getProfileStats(userId);
      const data = res.data;
      setProfileUser(data?.user ?? null);
      setStats({
        postCount: data?.postCount ?? 0,
        imageCount: data?.imageCount ?? 0,
        videoCount: data?.videoCount ?? 0,
        musicCount: data?.musicCount ?? 0,
        followerCount: data?.followerCount ?? 0,
        followingCount: data?.followingCount ?? 0,
      });
    } catch {
      setProfileUser(null);
      toast.error('Failed to load profile');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const loadFeed = useCallback(
    async (pageNum = 1, append = false) => {
      if (!userId) return;
      if (pageNum === 1) setLoading(true);
      else setLoadingMore(true);
      if (pageNum === 1) setHasMore(true);
      try {
        const type = getFeedType(activeTab);
        const res = await tvAPI.getFeed({
          creatorId: userId,
          page: pageNum,
          limit,
          sort: 'newest',
          type,
        });
        const data = res.data?.data ?? res.data ?? [];
        const posts = Array.isArray(data) ? data : [];
        const fetchedTotal = Number(res.data?.total ?? posts.length);
        setTotal(fetchedTotal);
        let nextCount = posts.length;
        setItems((prev) => {
          const next = append ? [...prev, ...posts] : posts;
          nextCount = next.length;
          return next;
        });
        setHasMore(nextCount < fetchedTotal && posts.length > 0);
      } catch {
        if (!append) setItems([]);
        if (append) setHasMore(false);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [userId, activeTab, getFeedType]
  );

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    if (!profileUser) return;
    setPage(1);
    loadFeed(1);
  }, [activeTab, userId, loadFeed, profileUser]);

  const loadMore = useCallback(() => {
    if (!hasMore || loadingMore || items.length >= total) return;
    const nextPage = page + 1;
    setPage(nextPage);
    loadFeed(nextPage, true);
  }, [hasMore, loadingMore, items.length, total, page, loadFeed]);

  useEffect(() => {
    const sentinel = loadMoreSentinelRef.current;
    const container = containerRef.current;
    if (!sentinel || !container) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const [e] = entries;
        if (e?.isIntersecting && hasMore && !loading && !loadingMore && items.length < total && items.length > 0) {
          loadMore();
        }
      },
      { root: container, rootMargin: '200px', threshold: 0.1 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore, hasMore, loading, loadingMore, items.length, total]);

  const handleLike = (id: string, liked: boolean) => {
    setLikedMap((m) => ({ ...m, [id]: liked }));
    setItems((prev) =>
      prev.map((p) =>
        p._id === id ? { ...p, likeCount: Math.max(0, (p.likeCount ?? 0) + (liked ? 1 : -1)) } : p
      )
    );
    tvAPI
      .like(id)
      .then((res) => {
        const likeCount = res.data?.data?.likeCount ?? res.data?.likeCount;
        if (typeof likeCount === 'number') {
          setItems((prev) => prev.map((p) => (p._id === id ? { ...p, likeCount } : p)));
        }
      })
      .catch(() => {
        setLikedMap((m) => ({ ...m, [id]: !liked }));
      });
  };

  const handleCommentAdded = (id: string) => {
    setItems((prev) =>
      prev.map((p) => (p._id === id ? { ...p, commentCount: (p.commentCount ?? 0) + 1 } : p))
    );
  };

  const handleFollowChange = (following: boolean) => {
    setStats((s) => ({ ...s, followerCount: Math.max(0, s.followerCount + (following ? 1 : -1)) }));
  };

  const getTabCount = (tab: TabType) => {
    switch (tab) {
      case 'posts':
        return stats.postCount;
      case 'images':
        return stats.imageCount;
      case 'videos':
        return stats.videoCount;
      case 'music':
        return stats.musicCount;
      default:
        return 0;
    }
  };

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  if (loading && !profileUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="h-12 w-12 animate-spin text-sky-500" />
      </div>
    );
  }

  if (!profileUser) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-6">
        <User className="h-16 w-16 text-slate-400 mb-4" />
        <p className="text-slate-600 mb-6">User not found</p>
        <Link href="/search" className="text-sky-600 hover:text-sky-700 font-medium">
          Back to search
        </Link>
      </div>
    );
  }

  const displayName = profileUser.name || profileUser.username || 'User';
  const username = profileUser.username ? `@${profileUser.username}` : '';

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
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
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <header className="sticky top-0 z-30 flex-shrink-0 bg-white/95 backdrop-blur-md border-b border-slate-100 shadow-sm">
          <div className="px-4 sm:px-6 lg:px-8 py-2 flex items-center gap-2">
            <Link
              href="/search"
              className="shrink-0 p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
              aria-label="Back"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="flex-1 min-w-0" />
            {user && (user._id || user.id) === userId && (
              <Link
                href="/profile"
                className="shrink-0 p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
                aria-label="Edit profile"
                title="Edit profile"
              >
                <Settings className="h-5 w-5" />
              </Link>
            )}
            <SearchButton />
            <AppSidebarMenuButton onClick={() => setMenuOpen((v) => !v)} />
          </div>
        </header>

        <main className="flex-1 min-w-0 overflow-y-auto" ref={containerRef}>
          <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-2 pb-24 lg:pb-8">
            {/* Profile header - compact at top */}
            <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4 mb-4">
              <div className="flex items-start gap-3">
                <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-full bg-slate-200 overflow-hidden flex-shrink-0">
                  {profileUser.avatar ? (
                    <img
                      src={getImageUrl(profileUser.avatar)}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-slate-500">
                      {(displayName || '?')[0]}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h1 className="text-lg sm:text-xl font-bold text-slate-900 truncate">
                    {displayName}
                  </h1>
                  {username && (
                    <p className="text-slate-500 text-sm truncate">{username}</p>
                  )}
                  <div className="flex items-center gap-3 mt-1.5 text-sm text-slate-600">
                    <span>
                      <strong className="text-slate-900">{stats.postCount}</strong> Posts
                    </span>
                    <span>
                      <strong className="text-slate-900">{stats.followerCount}</strong> Followers
                    </span>
                    <span>
                      <strong className="text-slate-900">{stats.followingCount}</strong> Following
                    </span>
                  </div>
                  <div className="mt-2">
                    <FollowButton
                      targetUserId={userId}
                      currentUserId={user?._id || user?.id}
                      targetIsPrivate={profileUser.isPrivate}
                      showWhenFollowing
                      onFollowChange={handleFollowChange}
                      className="text-sm"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 border-b border-slate-200 mb-3 overflow-x-auto">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-sky-500 text-sky-600'
                      : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-200'
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                  <span className="text-slate-400 font-normal">({getTabCount(tab.id)})</span>
                </button>
              ))}
            </div>

            {/* Grid */}
            {loading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-10 w-10 animate-spin text-sky-500" />
              </div>
            ) : items.length === 0 ? (
              <div className="py-16 text-center text-slate-500">
                <LayoutGrid className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No {activeTab} yet</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-1 sm:gap-2">
                {items.map((item) => {
                  const thumb = getThumbnailUrl(item);
                  return (
                    <button
                      key={item._id}
                      type="button"
                      onClick={() => setViewingPost(item)}
                      className="aspect-square bg-slate-200 rounded-lg overflow-hidden focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2"
                    >
                      {thumb ? (
                        item.type === 'video' ? (
                          <video
                            src={getImageUrl(thumb)}
                            className="w-full h-full object-cover"
                            muted
                            playsInline
                          />
                        ) : (
                          <img
                            src={getImageUrl(thumb)}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        )
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          {item.type === 'audio' ? (
                            <Music2 className="h-12 w-12 text-slate-400" />
                          ) : (
                            <LayoutGrid className="h-12 w-12 text-slate-400" />
                          )}
                        </div>
                      )}
                    </button>
                  );
                })}
                <div ref={loadMoreSentinelRef} className="col-span-3 h-4" />
              </div>
            )}

            {loadingMore && (
              <div className="flex justify-center py-4">
                <Loader2 className="h-6 w-6 animate-spin text-sky-500" />
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Full post modal */}
      {viewingPost && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <button
            type="button"
            onClick={() => setViewingPost(null)}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20"
            aria-label="Close"
          >
            <X className="h-6 w-6" />
          </button>
          <div className="w-full max-w-md max-h-[90vh] overflow-y-auto">
            <TVGridTile
              item={viewingPost}
              liked={likedMap[viewingPost._id]}
              onLike={handleLike}
              onCommentAdded={handleCommentAdded}
              isVisible
            />
          </div>
        </div>
      )}

      <MobileBottomNav cartCount={cartCount} hasStore={hasStore} />
    </div>
  );
}

export default function UserProfilePage() {
  return (
    <ProtectedRoute>
      <UserProfileContent />
    </ProtectedRoute>
  );
}
