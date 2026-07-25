'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Loader2,
  Image as ImageIcon,
  Video,
  Music2,
  LayoutGrid,
  ShoppingBag,
  User,
  X,
  Settings,
  Mail,
  Pencil,
  Trash2,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useCartAndStores } from '@/lib/useCartAndStores';
import { AppSidebar, AppSidebarMenuButton } from '@/components/AppSidebar';
import { SearchButton } from '@/components/SearchButton';
import { FollowButton } from '@/components/FollowButton';
import type { TVGridItem } from '@/components/tv/TVGridTile';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { PAGE_PAD_BOTTOM_MOBILE_NAV } from '@/lib/appShellLayout';
import { usersAPI, tvAPI, getImageUrl, getImageUrlFull, checkoutAPI, musicAPI } from '@/lib/api';
import { SchoolDonateButton } from '@/components/SchoolDonateButton';
import { ProfileLocationButton } from '@/components/ProfileLocationButton';
import {
  hasPublicProfileMapCoords,
  type PublicProfileLocation,
} from '@/lib/publicProfileLocation';
import toast from 'react-hot-toast';
import { userPublicDisplayName, userAtUsername } from '@/lib/userDisplayLabel';
import { inferIsSchoolProfile } from '@/lib/schoolProfile';
import { publicContactPhoneFromUser, type PublicProfileKind } from '@/lib/publicContactPrivacy';
import { StatusStoryViewer } from '@/components/tv/StatusStoryViewer';
import type { StatusItem } from '@/components/tv/StatusesStrip';
import { ProfileConnectionsModal } from '@/components/ProfileConnectionsModal';
import { MessageActionsMenu } from '@/components/profile/MessageActionsMenu';

type TabType = 'posts' | 'images' | 'videos' | 'music' | 'orders';

const TABS: { id: TabType; label: string; icon: React.ReactNode }[] = [
  { id: 'posts', label: 'Posts', icon: <LayoutGrid className="h-4 w-4" /> },
  { id: 'images', label: 'Images', icon: <ImageIcon className="h-4 w-4" /> },
  { id: 'videos', label: 'Videos', icon: <Video className="h-4 w-4" /> },
  { id: 'music', label: 'Music', icon: <Music2 className="h-4 w-4" /> },
  { id: 'orders', label: 'Orders', icon: <ShoppingBag className="h-4 w-4" /> },
];

type ProductOrderRow = {
  _id: string;
  createdAt?: string;
  paidAt?: string;
  status?: string;
  amounts?: { total?: number };
};

type MusicPurchaseRow = {
  songId?: string;
  amount?: number;
  createdAt?: string;
  reference?: string;
  song?: { title?: string; artist?: string };
};

function getThumbnailUrl(item: TVGridItem): string | null {
  if (item.type === 'product_tile' && item.images?.[0]) return item.images[0];
  if (item.mediaUrls?.[0]) return item.mediaUrls[0];
  return null;
}

function profilePostStatusItem(userId: string, item: TVGridItem, profileUser: { name?: string; username?: string; avatar?: string }): StatusItem {
  const kind = item.type === 'product_tile' ? 'product' : item.type || 'image';
  const media = item.type === 'product_tile' ? item.images || [] : item.mediaUrls || [];
  return {
    userId,
    name: profileUser.name,
    username: profileUser.username,
    avatar: profileUser.avatar,
    latestPost: {
      _id: String(item._id),
      type: kind,
      mediaUrls: media.filter(Boolean) as string[],
      artworkUrl: item.artworkUrl,
      createdAt: item.createdAt || new Date().toISOString(),
    },
  };
}

function galleryStatusItem(userId: string, url: string, idx: number, profileUser: { name?: string; username?: string; avatar?: string }): StatusItem {
  return {
    userId,
    name: profileUser.name,
    username: profileUser.username,
    avatar: profileUser.avatar,
    latestPost: {
      _id: `gallery-${userId}-${idx}`,
      type: 'image',
      mediaUrls: [url],
      createdAt: new Date().toISOString(),
    },
  };
}

const TV_POST_ID_RE = /^[a-f0-9]{24}$/i;

function isDeletableImageItem(item: TVGridItem): boolean {
  const type = item.type;
  if (type === 'image' || type === 'carousel') return true;
  if (type === 'video' || type === 'audio' || type === 'product_tile') return false;
  return !!item.mediaUrls?.[0];
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
  const [viewingGallerySrc, setViewingGallerySrc] = useState<string | null>(null);
  const [storyViewerOpen, setStoryViewerOpen] = useState(false);
  const [storyViewerIndex, setStoryViewerIndex] = useState(0);
  const [storyViewerRows, setStoryViewerRows] = useState<StatusItem[]>([]);
  const [orderRows, setOrderRows] = useState<ProductOrderRow[]>([]);
  const [musicPurchaseRows, setMusicPurchaseRows] = useState<MusicPurchaseRow[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [avatarBroken, setAvatarBroken] = useState(false);
  const [deletingPhotoKey, setDeletingPhotoKey] = useState<string | null>(null);
  const [connectionsModal, setConnectionsModal] = useState<'followers' | 'following' | null>(null);
  const [schoolPage, setSchoolPage] = useState<{
    canEditProfile: boolean;
    canManageManagers: boolean;
    managerCount: number;
    isOwner: boolean;
  } | null>(null);
  const { cartCount, hasStore } = useCartAndStores(!!user);
  const containerRef = useRef<HTMLDivElement>(null);
  const tabsSectionRef = useRef<HTMLDivElement>(null);
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
      setSchoolPage(data?.schoolPage ?? null);
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
      if (activeTab === 'orders') {
        setItems([]);
        setLoading(false);
        setLoadingMore(false);
        setHasMore(false);
        return;
      }
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

  const loadOrders = useCallback(async () => {
    const currentUserId = user?._id || user?.id;
    if (!currentUserId || currentUserId !== userId) {
      setOrderRows([]);
      setMusicPurchaseRows([]);
      return;
    }
    setOrdersLoading(true);
    try {
      const [ordersRes, musicRes] = await Promise.all([
        checkoutAPI.getMyOrders({ page: 1, limit: 50 }),
        musicAPI.getMyPurchases(),
      ]);
      const ordersData = ordersRes.data?.data ?? [];
      const musicData = musicRes.data?.data ?? [];
      const successfulOrders = (Array.isArray(ordersData) ? ordersData : []).filter(
        (o: any) => String(o?.status || '').toLowerCase() === 'paid'
      );
      setOrderRows(successfulOrders);
      setMusicPurchaseRows(Array.isArray(musicData) ? musicData : []);
    } catch {
      setOrderRows([]);
      setMusicPurchaseRows([]);
      toast.error('Failed to load order history');
    } finally {
      setOrdersLoading(false);
    }
  }, [user?._id, user?.id, userId]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    setAvatarBroken(false);
  }, [profileUser?.avatar, userId]);

  useEffect(() => {
    if (!profileUser) return;
    if (activeTab === 'orders') {
      loadOrders();
      return;
    }
    setPage(1);
    loadFeed(1);
  }, [activeTab, userId, loadFeed, loadOrders, profileUser]);

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

  const handleFollowChange = (following: boolean) => {
    setStats((s) => ({ ...s, followerCount: Math.max(0, s.followerCount + (following ? 1 : -1)) }));
  };

  const openPostsTab = useCallback(() => {
    setActiveTab('posts');
    requestAnimationFrame(() => {
      tabsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, []);

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
      case 'orders':
        return orderRows.length + musicPurchaseRows.length;
      default:
        return 0;
    }
  };

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  const galleryUrls: string[] = useMemo(
    () =>
      Array.isArray(profileUser?.profileGalleryUrls)
        ? profileUser.profileGalleryUrls.filter((u: unknown) => typeof u === 'string' && u.trim())
        : [],
    [profileUser?.profileGalleryUrls]
  );

  const canDeleteOwnPhotos = !!(user && (user._id || user.id) === userId);

  const showProfilePhotosSection =
    galleryUrls.length > 0 &&
    !((activeTab === 'posts' || activeTab === 'images') && items.length > 0);

  const handleDeletePhoto = useCallback(
    async (opts: { url: string; postId?: string }) => {
      if (!canDeleteOwnPhotos) return;
      if (!confirm('Delete this photo? This cannot be undone.')) return;
      const key = opts.postId || opts.url;
      setDeletingPhotoKey(key);
      try {
        const postId = String(opts.postId || '');
        if (TV_POST_ID_RE.test(postId)) {
          await tvAPI.deletePost(postId);
        } else {
          await usersAPI.removeGalleryPhoto(userId, opts.url);
        }
        setProfileUser((prev: typeof profileUser) => {
          if (!prev) return prev;
          const urls = Array.isArray(prev.profileGalleryUrls)
            ? prev.profileGalleryUrls.filter((u: string) => u !== opts.url)
            : [];
          return { ...prev, profileGalleryUrls: urls };
        });
        setItems((prev) =>
          prev.filter((item) => {
            if (postId && String(item._id) === postId) return false;
            const thumb = getThumbnailUrl(item);
            return thumb !== opts.url;
          })
        );
        setStats((s) => ({
          ...s,
          postCount: Math.max(0, s.postCount - 1),
          imageCount: Math.max(0, s.imageCount - 1),
        }));
        toast.success('Photo deleted');
        void loadProfile();
      } catch (e: unknown) {
        const msg =
          e && typeof e === 'object' && 'response' in e
            ? (e as { response?: { data?: { message?: string } } }).response?.data?.message
            : undefined;
        toast.error(msg || 'Failed to delete photo');
      } finally {
        setDeletingPhotoKey(null);
      }
    },
    [canDeleteOwnPhotos, userId, loadProfile]
  );

  const openStoryAt = useCallback((rows: StatusItem[], index: number) => {
    setStoryViewerRows(rows);
    setStoryViewerIndex(index);
    setStoryViewerOpen(true);
  }, []);

  const profileStoryRows = useMemo((): StatusItem[] => {
    if (!profileUser) return [];
    const base = {
      name: profileUser.name,
      username: profileUser.username,
      avatar: profileUser.avatar,
    };
    const fromFeed = items.map((item) => profilePostStatusItem(userId, item, base));
    if (fromFeed.length) return fromFeed;
    return galleryUrls.map((url, idx) => galleryStatusItem(userId, url, idx, base));
  }, [profileUser, items, userId, galleryUrls]);

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

  const displayName = userPublicDisplayName(profileUser);
  const atHandle = userAtUsername(profileUser);
  const isSchoolProfile = inferIsSchoolProfile(profileUser, { hasSchoolPageAccess: !!schoolPage });
  const publicProfileKind = (profileUser.publicProfileKind as PublicProfileKind | undefined) || (isSchoolProfile ? 'school' : 'individual');
  const publicContactPhone = publicContactPhoneFromUser(profileUser);
  const schoolEmail =
    typeof profileUser.schoolPublicEmail === 'string'
      ? profileUser.schoolPublicEmail.trim()
      : '';
  const publicLocation = profileUser.publicProfileLocation as PublicProfileLocation | undefined;
  const showProfileLocation = hasPublicProfileMapCoords(publicLocation);

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      <StatusStoryViewer
        open={storyViewerOpen}
        onClose={() => setStoryViewerOpen(false)}
        statuses={storyViewerRows}
        startIndex={storyViewerIndex}
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
          <div className={`max-w-2xl md:max-w-4xl lg:max-w-5xl mx-auto px-4 sm:px-6 pt-2 ${PAGE_PAD_BOTTOM_MOBILE_NAV}`}>
            {/* Profile header - compact at top */}
            <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4 mb-4">
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  className="h-16 w-16 sm:h-20 sm:w-20 rounded-full bg-slate-200 overflow-hidden flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:cursor-default"
                  onClick={() => {
                    if (profileUser.avatar && !avatarBroken) setViewingGallerySrc(profileUser.avatar);
                  }}
                  aria-label={profileUser.avatar && !avatarBroken ? 'View profile picture' : 'Profile picture'}
                  disabled={!profileUser.avatar || avatarBroken}
                >
                  {profileUser.avatar && !avatarBroken ? (
                    <img
                      src={getImageUrl(profileUser.avatar)}
                      alt=""
                      className="w-full h-full object-cover hover:opacity-90 transition-opacity"
                      onError={(e) => {
                        const el = e.currentTarget;
                        const full = getImageUrlFull(profileUser.avatar);
                        if (full && el.src !== full) {
                          el.src = full;
                          return;
                        }
                        setAvatarBroken(true);
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-slate-500">
                      {(displayName || '?')[0]}
                    </div>
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <h1 className="text-lg sm:text-xl font-bold text-slate-900 truncate">
                    {displayName}
                  </h1>
                  {atHandle && (
                    <p className="text-slate-500 text-sm truncate">{atHandle}</p>
                  )}
                  <div className="flex items-center gap-3 mt-1.5 text-sm text-slate-600">
                    <button
                      type="button"
                      onClick={openPostsTab}
                      className="rounded-md px-0.5 -mx-0.5 hover:text-sky-700 hover:bg-sky-50/80 transition-colors"
                      aria-label={`${stats.postCount} posts`}
                    >
                      <strong className="text-slate-900">{stats.postCount}</strong> Posts
                    </button>
                    <button
                      type="button"
                      onClick={() => setConnectionsModal('followers')}
                      className="rounded-md px-0.5 -mx-0.5 hover:text-sky-700 hover:bg-sky-50/80 transition-colors"
                      aria-label={`${stats.followerCount} followers`}
                    >
                      <strong className="text-slate-900">{stats.followerCount}</strong> Followers
                    </button>
                    <button
                      type="button"
                      onClick={() => setConnectionsModal('following')}
                      className="rounded-md px-0.5 -mx-0.5 hover:text-sky-700 hover:bg-sky-50/80 transition-colors"
                      aria-label={`${stats.followingCount} following`}
                    >
                      <strong className="text-slate-900">{stats.followingCount}</strong> Following
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {user && (user._id || user.id) !== userId ? (
                      <MessageActionsMenu userId={userId} displayName={displayName} />
                    ) : null}
                    <FollowButton
                      targetUserId={userId}
                      currentUserId={user?._id || user?.id}
                      targetIsPrivate={profileUser.isPrivate}
                      showWhenFollowing
                      onFollowChange={handleFollowChange}
                      className="text-sm"
                    />
                    {publicContactPhone && (
                      <span className="shrink-0 tabular-nums text-sm text-slate-500">{publicContactPhone}</span>
                    )}
                    {schoolPage?.canEditProfile && (
                      <Link
                        href={`/profile/school/${userId}`}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:border-sky-300 hover:text-sky-700"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Manage page
                      </Link>
                    )}
                  </div>
                  {schoolEmail && (
                    <div className="mt-2 text-sm">
                      <a
                        href={`mailto:${schoolEmail}`}
                        className="inline-flex min-w-0 items-center gap-2 text-sky-600 hover:text-sky-800"
                      >
                        <Mail className="h-4 w-4 shrink-0" />
                        <span className="break-all">{schoolEmail}</span>
                      </a>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Tabs + Donate — above profile Photos gallery */}
            <div className="mb-3 border-b border-slate-200" ref={tabsSectionRef}>
              <div className="flex min-w-0 items-center gap-1 overflow-x-auto scroll-smooth [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                {TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex shrink-0 items-center gap-2 px-3 sm:px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
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
                {isSchoolProfile && (
                  <div className="relative z-20 shrink-0 self-center pb-2.5 pl-1">
                    <SchoolDonateButton
                      recipientId={userId}
                      recipientName={displayName}
                      currentUserId={user?._id || user?.id}
                      compact
                    />
                  </div>
                )}
                {showProfileLocation && publicLocation && (
                  <div className="relative z-20 shrink-0 self-center pb-2.5 pl-1">
                    <ProfileLocationButton
                      profileName={displayName}
                      location={publicLocation}
                      compact
                    />
                  </div>
                )}
              </div>
            </div>

            {showProfilePhotosSection && (
              <div className="mb-4 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Photos</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {galleryUrls.map((src, idx) => (
                    <div key={src} className="relative group">
                      <button
                        type="button"
                        onClick={() => {
                          const rows = galleryUrls.map((url, i) =>
                            galleryStatusItem(userId, url, i, {
                              name: profileUser.name,
                              username: profileUser.username,
                              avatar: profileUser.avatar,
                            })
                          );
                          openStoryAt(rows, idx);
                        }}
                        className="aspect-[4/3] w-full overflow-hidden rounded-lg bg-slate-100 cursor-pointer hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-sky-500"
                        aria-label="View profile photo"
                      >
                        <img
                          src={getImageUrl(src)}
                          alt=""
                          className="h-full w-full object-cover pointer-events-none"
                          loading="lazy"
                          onError={(e) => {
                            const el = e.currentTarget;
                            const full = getImageUrlFull(src);
                            if (full && el.src !== full) el.src = full;
                          }}
                        />
                      </button>
                      {canDeleteOwnPhotos && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleDeletePhoto({ url: src });
                          }}
                          disabled={deletingPhotoKey === src}
                          className="absolute top-1.5 right-1.5 z-10 rounded-full bg-black/55 p-1.5 text-white opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100 transition-opacity hover:bg-rose-600 disabled:opacity-60"
                          aria-label="Delete photo"
                        >
                          {deletingPhotoKey === src ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Grid */}
            {activeTab === 'orders' ? (
              ordersLoading ? (
                <div className="flex justify-center py-16">
                  <Loader2 className="h-10 w-10 animate-spin text-sky-500" />
                </div>
              ) : (user?._id || user?.id) !== userId ? (
                <div className="py-16 text-center text-slate-500">
                  <ShoppingBag className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>Orders are visible only on your own profile.</p>
                </div>
              ) : orderRows.length === 0 && musicPurchaseRows.length === 0 ? (
                <div className="py-16 text-center text-slate-500">
                  <ShoppingBag className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No orders yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {orderRows
                    .slice()
                    .sort((a, b) => {
                      const ta = new Date(a?.paidAt || a?.createdAt || 0).getTime();
                      const tb = new Date(b?.paidAt || b?.createdAt || 0).getTime();
                      return tb - ta;
                    })
                    .map((o) => (
                      <div key={`order-${o._id}`} className="rounded-xl border border-slate-200 bg-white p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-slate-900">ORDER-{String(o._id).slice(-12)}</p>
                          <p className="text-sm font-semibold text-slate-900">
                            R{Number(o?.amounts?.total || 0).toFixed(2)}
                          </p>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          {o?.paidAt || o?.createdAt ? new Date(o.paidAt || o.createdAt || '').toLocaleString() : '—'} · successful
                        </p>
                      </div>
                    ))}
                  {musicPurchaseRows
                    .slice()
                    .sort((a, b) => {
                      const ta = new Date(a?.createdAt || 0).getTime();
                      const tb = new Date(b?.createdAt || 0).getTime();
                      return tb - ta;
                    })
                    .map((m, idx) => (
                      <div key={`music-${m.reference || m.songId || idx}`} className="rounded-xl border border-slate-200 bg-white p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-slate-900">
                            Music purchase{m.song?.title ? `: ${m.song.title}` : ''}
                          </p>
                          <p className="text-sm font-semibold text-slate-900">
                            R{Number(m?.amount || 0).toFixed(2)}
                          </p>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          {m?.createdAt ? new Date(m.createdAt).toLocaleString() : '—'} · successful
                        </p>
                      </div>
                    ))}
                </div>
              )
            ) : loading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-10 w-10 animate-spin text-sky-500" />
              </div>
            ) : items.length === 0 && galleryUrls.length === 0 ? (
              <div className="py-16 text-center text-slate-500">
                <LayoutGrid className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No {activeTab} yet</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-1 sm:gap-2">
                {(items.length ? items : galleryUrls.map((url, idx) => ({
                  _id: `gallery-${userId}-${idx}`,
                  type: 'image' as const,
                  mediaUrls: [url],
                }))).map((item, idx) => {
                  const thumb = getThumbnailUrl(item);
                  const mediaUrl = thumb || item.mediaUrls?.[0] || '';
                  const showDelete = canDeleteOwnPhotos && isDeletableImageItem(item) && !!mediaUrl;
                  const deleteKey = String(item._id);
                  return (
                    <div key={item._id} className="relative group">
                      <button
                        type="button"
                        onClick={() => openStoryAt(profileStoryRows, idx)}
                        className="aspect-square bg-slate-200 rounded-lg overflow-hidden cursor-pointer hover:opacity-90 active:scale-[0.98] transition-all focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 block w-full border-0 p-0"
                        aria-label={`View post ${item.caption || item.heading || item._id}`}
                      >
                        {thumb ? (
                          item.type === 'video' ? (
                            <video
                              src={getImageUrl(thumb)}
                              className="w-full h-full object-cover pointer-events-none"
                              muted
                              playsInline
                              preload="metadata"
                            />
                          ) : (
                            <img
                              src={getImageUrl(thumb)}
                              alt=""
                              className="w-full h-full object-cover pointer-events-none"
                              onError={(e) => {
                                const el = e.currentTarget;
                                const full = getImageUrlFull(thumb);
                                if (full && el.src !== full) el.src = full;
                              }}
                            />
                          )
                        ) : (
                          <div className="w-full h-full flex items-center justify-center pointer-events-none">
                            {item.type === 'audio' ? (
                              <Music2 className="h-12 w-12 text-slate-400" />
                            ) : (
                              <LayoutGrid className="h-12 w-12 text-slate-400" />
                            )}
                          </div>
                        )}
                      </button>
                      {showDelete && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleDeletePhoto({
                              url: mediaUrl,
                              postId: TV_POST_ID_RE.test(deleteKey) ? deleteKey : undefined,
                            });
                          }}
                          disabled={deletingPhotoKey === deleteKey || deletingPhotoKey === mediaUrl}
                          className="absolute top-1.5 right-1.5 z-10 rounded-full bg-black/55 p-1.5 text-white opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100 transition-opacity hover:bg-rose-600 disabled:opacity-60"
                          aria-label="Delete photo"
                        >
                          {deletingPhotoKey === deleteKey || deletingPhotoKey === mediaUrl ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </button>
                      )}
                    </div>
                  );
                })}
                <div ref={loadMoreSentinelRef} className="col-span-3 md:col-span-4 lg:col-span-5 h-4" />
              </div>
            )}

            {activeTab !== 'orders' && loadingMore && (
              <div className="flex justify-center py-4">
                <Loader2 className="h-6 w-6 animate-spin text-sky-500" />
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Profile gallery lightbox */}
      {viewingGallerySrc && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Profile photo"
          onClick={() => setViewingGallerySrc(null)}
        >
          <button
            type="button"
            onClick={() => setViewingGallerySrc(null)}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 z-10"
            aria-label="Close"
          >
            <X className="h-6 w-6" />
          </button>
          <img
            src={getImageUrl(viewingGallerySrc)}
            alt=""
            className="max-w-full max-h-[90vh] object-contain"
            onClick={(e) => e.stopPropagation()}
            onError={(e) => {
              const el = e.currentTarget;
              const full = getImageUrlFull(viewingGallerySrc);
              if (full && el.src !== full) el.src = full;
            }}
          />
        </div>
      )}

      <ProfileConnectionsModal
        open={connectionsModal !== null}
        onClose={() => setConnectionsModal(null)}
        userId={userId}
        mode={connectionsModal ?? 'followers'}
        title={connectionsModal === 'following' ? 'Following' : 'Followers'}
      />

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
