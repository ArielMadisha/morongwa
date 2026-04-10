'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { LayoutGrid, Loader2, Plus } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useCartAndStores } from '@/lib/useCartAndStores';
import { AppSidebar, AppSidebarMenuButton } from '@/components/AppSidebar';
import { SearchButton } from '@/components/SearchButton';
import { ProfileHeaderButton } from '@/components/ProfileHeaderButton';
import { TVGridTileWithObserver } from '@/components/tv/TVGridTileWithObserver';
import type { TVGridItem } from '@/components/tv/TVGridTile';
import { CreatePostModal } from '@/components/tv/CreatePostModal';
import { StatusesStrip } from '@/components/tv/StatusesStrip';
import { AdvertSlot } from '@/components/AdvertSlot';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { AdvertTile } from '@/components/AdvertTile';
import { tvAPI, productEnquiryAPI, advertsAPI, usersAPI } from '@/lib/api';
import type { Product } from '@/lib/types';
import toast from 'react-hot-toast';
import {
  ContentPreferencesModal,
  shouldShowPreferencesModal,
  getHideProducts,
} from '@/components/ContentPreferencesModal';

/** Set to true to show the "Customize your feed" modal on first visit / re-ask cadence. */
const SHOW_FEED_PREFERENCES_PROMPT = false;

/** Used for merging feed posts with product tiles (same clock as TV posts). */
function getFeedItemSortTime(item: TVGridItem): number {
  if (item.createdAt) {
    const t = new Date(item.createdAt).getTime();
    if (!Number.isNaN(t)) return t;
  }
  const id = String(item._id ?? '');
  if (/^[a-f0-9]{24}$/i.test(id)) {
    return parseInt(id.slice(0, 8), 16) * 1000;
  }
  return 0;
}

function sortFeedNewestFirst(items: TVGridItem[]): TVGridItem[] {
  return [...items].sort((a, b) => {
    const d = getFeedItemSortTime(b) - getFeedItemSortTime(a);
    if (d !== 0) return d;
    return String(b._id).localeCompare(String(a._id));
  });
}

function productIdsFromProductPosts(posts: TVGridItem[]): Set<string> {
  const ids = new Set<string>();
  for (const p of posts) {
    if (p.type !== 'product') continue;
    const pid =
      p.productId && typeof p.productId === 'object' && (p.productId as { _id?: string })._id
        ? String((p.productId as { _id: string })._id)
        : undefined;
    if (pid) ids.add(pid);
  }
  return ids;
}

/** Merge TV feed with QwertyHub tiles by date so new products are not stuck below older posts. */
function mergeWallFeedWithTiles(
  posts: TVGridItem[],
  tiles: TVGridItem[],
  latestFromSession: TVGridItem | null
): TVGridItem[] {
  const seenProductIds = productIdsFromProductPosts(posts);
  const tilesDeduped = tiles.filter(
    (t) => t.type === 'product_tile' && !seenProductIds.has(String(t._id))
  );
  const combined = sortFeedNewestFirst([...posts, ...tilesDeduped]);
  if (!latestFromSession) return combined;
  const rest = combined.filter((x) => x._id !== latestFromSession._id);
  return [latestFromSession, ...rest];
}

function WallPageContent() {
  const { user, logout, refreshUser } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchQ, setSearchQ] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [gridItems, setGridItems] = useState<TVGridItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [statusRefreshKey, setStatusRefreshKey] = useState(0);
  const [latestCreatedPost, setLatestCreatedPost] = useState<TVGridItem | null>(null);
  const [enquireOpen, setEnquireOpen] = useState(false);
  const [enquireProductId, setEnquireProductId] = useState<string | null>(null);
  const [enquireMessage, setEnquireMessage] = useState('');
  const [enquireSending, setEnquireSending] = useState(false);
  const [likedMap, setLikedMap] = useState<Record<string, boolean>>({});
  const [prefsModalOpen, setPrefsModalOpen] = useState(false);
  const hideProducts = getHideProducts(user);
  const { cartCount, hasStore } = useCartAndStores(!!user);
  const containerRef = useRef<HTMLDivElement>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);
  const limit = 24;

  const prefillHashtag = searchParams.get('hashtag')?.replace(/^#/, '').trim() || undefined;
  useEffect(() => {
    setSearchQ(searchParams.get('q') ?? '');
  }, [searchParams]);
  useEffect(() => {
    if (searchParams.get('create') === '1') setCreateOpen(true);
  }, [searchParams]);

  const loadFeed = useCallback(
    async (pageNum = 1, append = false) => {
      if (pageNum === 1) setLoading(true);
      else setLoadingMore(true);
      if (pageNum === 1) setHasMore(true);
      try {
        const res = await tvAPI.getFeed({
          page: pageNum,
          limit,
          sort: 'newest',
          q: searchQ || undefined,
          hideProducts: !user ? hideProducts : undefined,
        });
      const data = res.data?.data ?? res.data ?? [];
      const raw = Array.isArray(data) ? data : [];
      const posts = sortFeedNewestFirst(raw as TVGridItem[]);
      const fetchedTotal = Number(res.data?.total ?? posts.length);
      setTotal(fetchedTotal);
      let nextCount = posts.length;
      setGridItems((prev) => {
        const next = append ? sortFeedNewestFirst([...prev, ...posts]) : posts;
        nextCount = next.length;
        return next;
      });
      setHasMore(nextCount < fetchedTotal && posts.length > 0);
    } catch {
      if (!append) setGridItems([]);
      if (append) setHasMore(false);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  },
    [searchQ, limit, user, hideProducts]
  );

  const [productTiles, setProductTiles] = useState<TVGridItem[]>([]);
  const [featuredProducts, setFeaturedProducts] = useState<(Product & { _id: string })[]>([]);
  const [adverts, setAdverts] = useState<Array<{ _id: string; title: string; imageUrl: string; linkUrl?: string }>>([]);

  const loadFeaturedProducts = useCallback(() => {
    tvAPI
      .getFeaturedProducts(!user ? hideProducts : undefined)
      .then((res) => {
        const list = res.data?.data ?? res.data ?? [];
        const products = Array.isArray(list) ? list : [];
        setFeaturedProducts(products);
        setProductTiles(
          products.map((p: any) => ({
            _id: p._id,
            type: 'product_tile' as const,
            title: p.title,
            description: p.description,
            images: p.images,
            price: p.price,
            discountPrice: p.discountPrice,
            currency: p.currency,
            supplierId: p.supplierId,
            allowResell: p.allowResell ?? false,
            likeCount: 0,
            commentCount: 0,
            shareCount: 0,
            createdAt: p.createdAt ? String(p.createdAt) : undefined,
          }))
        );
      })
      .catch(() => {
        setProductTiles([]);
        setFeaturedProducts([]);
      });
  }, [user, hideProducts]);

  // Read post created on another page (e.g. QwertyTV) so it appears on Home
  useEffect(() => {
    if (typeof sessionStorage === 'undefined') return;
    try {
      const raw = sessionStorage.getItem('qwerty_latest_post');
      if (!raw) return;
      const parsed = JSON.parse(raw) as TVGridItem;
      if (parsed?._id) setLatestCreatedPost(parsed);
      sessionStorage.removeItem('qwerty_latest_post');
    } catch (_) {}
  }, []);

  useEffect(() => {
    loadFeed(1);
    loadFeaturedProducts();
  }, [loadFeed, loadFeaturedProducts]);

  // Show content preferences modal (first visit or every 30 days)
  useEffect(() => {
    if (!SHOW_FEED_PREFERENCES_PROMPT) return;
    if (!loading && user !== undefined && shouldShowPreferencesModal(user)) {
      setPrefsModalOpen(true);
    }
  }, [loading, user]);
  useEffect(() => {
    advertsAPI.getAdverts().then((res) => {
      const data = res.data?.data ?? res.data ?? [];
      const list = Array.isArray(data) ? data : [];
      setAdverts(list);
    }).catch(() => setAdverts([]));
  }, []);

  const loadMore = useCallback(() => {
    if (!hasMore || loadingMore || gridItems.length >= total) return;
    const nextPage = page + 1;
    setPage(nextPage);
    loadFeed(nextPage, true);
  }, [hasMore, loadingMore, gridItems.length, total, page, loadFeed]);

  useEffect(() => {
    const sentinel = loadMoreSentinelRef.current;
    const container = containerRef.current;
    if (!sentinel || !container) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const [e] = entries;
        if (e?.isIntersecting && hasMore && !loading && !loadingMore && gridItems.length < total && gridItems.length > 0) {
          loadMore();
        }
      },
      { root: container, rootMargin: '200px', threshold: 0.1 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore, hasMore, loading, loadingMore, gridItems.length, total]);

  const handleSetProfilePicFromUrl = async (url: string) => {
    if (!user?._id && !user?.id) return;
    try {
      await usersAPI.setAvatarFromUrl(user._id || user.id!, url);
      toast.success('Profile picture updated');
      refreshUser?.();
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Failed to update profile picture');
    }
  };

  const handleSetStripBackgroundFromUrl = async (url: string) => {
    if (!user?._id && !user?.id) return;
    try {
      await usersAPI.updateProfile(user._id || user.id!, { stripBackgroundPic: url });
      toast.success('Strip background updated');
      refreshUser?.();
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Failed to update strip background');
    }
  };

  const handleLike = (id: string, liked: boolean) => {
    setLikedMap((m) => ({ ...m, [id]: liked }));
    setGridItems((prev) =>
      prev.map((p) =>
        p._id === id
          ? { ...p, likeCount: Math.max(0, (p.likeCount ?? 0) + (liked ? 1 : -1)) }
          : p
      )
    );
    tvAPI
      .like(id)
      .then((res) => {
        const likeCount = res.data?.data?.likeCount ?? res.data?.likeCount;
        if (typeof likeCount === 'number') {
          setGridItems((prev) =>
            prev.map((p) => (p._id === id ? { ...p, likeCount } : p))
          );
        }
      })
      .catch(() => {
        setLikedMap((m) => ({ ...m, [id]: !liked }));
        setGridItems((prev) =>
          prev.map((p) =>
            p._id === id
              ? { ...p, likeCount: Math.max(0, (p.likeCount ?? 0) + (liked ? -1 : 1)) }
              : p
          )
        );
      });
  };

  const handleRepost = (id: string) => {
    tvAPI.repost(id).then((res) => {
      const newPost = res.data?.data ?? res.data;
      if (newPost) setGridItems((prev) => [newPost, ...prev]);
    });
  };

  const handleCommentAdded = (id: string) => {
    setGridItems((prev) =>
      prev.map((p) => (p._id === id ? { ...p, commentCount: (p.commentCount ?? 0) + 1 } : p))
    );
  };

  const handleEnquire = (productId: string) => {
    setEnquireProductId(productId);
    setEnquireMessage('');
    setEnquireOpen(true);
  };

  const submitEnquire = () => {
    if (!enquireProductId) return;
    setEnquireSending(true);
    productEnquiryAPI
      .enquire(enquireProductId, enquireMessage.trim() || undefined)
      .then(() => {
        toast.success('Enquiry sent. Seller will be notified. View in Messages → Product enquiries.');
        setEnquireOpen(false);
        setEnquireProductId(null);
      })
      .catch((e: any) => toast.error(e.response?.data?.message || 'Failed to send enquiry'))
      .finally(() => setEnquireSending(false));
  };

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  // Intersperse sponsored adverts every 6 items between posts (same dimensions as posts)
  const insertAdvertsEvery = 6;
  // TV posts + QwertyHub product tiles merged by createdAt (newest first)
  const feedWithoutLatest = latestCreatedPost
    ? gridItems.filter((p) => p._id !== latestCreatedPost._id)
    : gridItems;
  const baseItems: TVGridItem[] = mergeWallFeedWithTiles(
    feedWithoutLatest,
    productTiles,
    latestCreatedPost
  );
  const allItemsWithAds: (TVGridItem | { _id: string; type: 'advert'; title: string; imageUrl: string; linkUrl?: string })[] = [];
  baseItems.forEach((item, i) => {
    if (i > 0 && i % insertAdvertsEvery === 0 && adverts.length > 0) {
      const ad = adverts[Math.floor(Math.random() * adverts.length)];
      if (ad) allItemsWithAds.push({ type: 'advert', ...ad, _id: `ad-${ad._id}` });
    }
    allItemsWithAds.push(item);
  });

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-sky-50 via-blue-50 to-white text-slate-900">
      {/* Full-width frozen header - logo at top-left */}
      <header className="sticky top-0 z-40 w-full bg-white/95 backdrop-blur-md border-b border-slate-100 shadow-sm flex-shrink-0">
        <div className="px-3 sm:px-6 lg:px-8 py-1">
          <div className="flex items-center gap-2 sm:gap-3 w-full">
            <div className="shrink-0 flex items-center gap-1 sm:gap-2">
              <Link href="/wall" className="shrink-0 flex items-center" aria-label="Home">
                <img src="/qwertymates-logo-icon.png" alt="Qwertymates" className="h-16 w-16 sm:h-[4.25rem] sm:w-[4.25rem] object-contain lg:hidden shrink-0" />
                <img src="/qwertymates-logo.png" alt="Qwertymates" className="h-8 w-auto max-w-[132px] sm:max-w-none object-contain hidden lg:block" />
              </Link>
              <AppSidebarMenuButton onClick={() => setMenuOpen((v) => !v)} />
            </div>
            <div className="flex-1 min-w-0 overflow-x-auto overflow-y-hidden scrollbar-thin">
              <StatusesStrip
                currentUserId={user?._id || user?.id}
                userAvatar={(user as any)?.avatar}
                stripBackgroundPic={(user as any)?.stripBackgroundPic}
                onAddStatus={() => setCreateOpen(true)}
                refreshTrigger={statusRefreshKey}
                currentUserLatestPost={latestCreatedPost ?? undefined}
                currentUserName={user?.name}
              />
            </div>
            <div className="shrink-0 flex items-center gap-2">
              {/* Mobile-only: remove the top "Ask MacGyver" pill; keep it on desktop/web */}
              <SearchButton className="hidden lg:flex" />
              <ProfileHeaderButton />
            </div>
          </div>
        </div>
      </header>

      {/* Menu (sidebar) + content below header */}
      <div className="flex min-h-0 min-w-0 w-full flex-1">
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
          hideLogo
          belowHeader
        />
        <div ref={containerRef} className="flex-1 flex flex-col lg:flex-row lg:justify-center gap-0 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden lg:items-start">
        <main className="min-w-0 w-full max-w-[calc(720px+4rem)] lg:w-[calc(720px+4rem)] pl-3 pr-3 sm:pl-6 sm:pr-0 lg:pl-8 pb-24 lg:pb-6 order-2 lg:order-none">
          {loading && allItemsWithAds.length === 0 ? (
            <div className="flex justify-center py-24 min-h-[60vh]">
              <Loader2 className="h-12 w-12 text-sky-500 animate-spin" />
            </div>
          ) : allItemsWithAds.length === 0 ? (
            <div className="rounded-2xl border border-slate-100 bg-white/90 backdrop-blur p-12 text-center mx-4 mt-6">
              <LayoutGrid className="h-16 w-16 text-slate-300 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-slate-700 mb-2">No content yet</h2>
              <p className="text-slate-600 mb-6">Share something new or browse QwertyHub.</p>
              <button
                onClick={() => setCreateOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-500 text-white font-medium hover:bg-sky-600"
              >
                <Plus className="h-5 w-5" />
                Create post
              </button>
            </div>
          ) : (
            <div className="flex flex-col w-full max-w-[720px] mx-auto gap-4">
              {allItemsWithAds.map((item, index) => (
                <div
                  key={`${item._id}-${index}`}
                  className="flex flex-col px-1 sm:px-2 flex-shrink-0"
                >
                  {(item as any).type === 'advert' ? (
                    <AdvertTile
                      _id={item._id}
                      title={(item as any).title}
                      imageUrl={(item as any).imageUrl}
                      linkUrl={(item as any).linkUrl}
                    />
                  ) : (
                    <TVGridTileWithObserver
                      item={item as TVGridItem}
                      liked={likedMap[item._id]}
                      onLike={handleLike}
                      onRepost={(item as TVGridItem).type !== 'product_tile' ? handleRepost : undefined}
                      onEnquire={(item as TVGridItem).type === 'product_tile' ? undefined : handleEnquire}
                      onCommentAdded={(item as TVGridItem).type !== 'product_tile' ? handleCommentAdded : undefined}
                      onDelete={(id) => setGridItems((prev) => prev.filter((i) => (i as TVGridItem)._id !== id))}
                      currentUserId={user?._id || user?.id}
                      onSetProfilePicFromUrl={handleSetProfilePicFromUrl}
                      onSetStripBackgroundFromUrl={handleSetStripBackgroundFromUrl}
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          {!loading && hasMore && gridItems.length < total && (
            <div ref={loadMoreSentinelRef} className="flex justify-center py-8 min-h-[80px]">
              {loadingMore ? (
                <Loader2 className="h-8 w-8 text-sky-500 animate-spin" />
              ) : (
                <div className="h-4" aria-hidden />
              )}
            </div>
          )}
        </main>
        <AdvertSlot belowHeader />
        </div>
      </div>
      <MobileBottomNav cartCount={cartCount} hasStore={hasStore} />

      <ContentPreferencesModal
        open={prefsModalOpen}
        onClose={() => setPrefsModalOpen(false)}
        user={user}
        onSaved={() => {
          refreshUser?.();
          loadFeed(1);
          loadFeaturedProducts();
        }}
      />

      <CreatePostModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        prefillHashtag={prefillHashtag}
        onCreated={(created) => {
          if (created) {
            setLatestCreatedPost(created);
            setGridItems((prev) => [created, ...prev]);
          }
          setStatusRefreshKey((k) => k + 1);
          if (!created) {
            setPage(1);
            loadFeed(1);
          }
        }}
        featuredProducts={featuredProducts}
        currentUserId={user?._id || user?.id}
      />

      {enquireOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Enquire about product</h2>
            <textarea
              value={enquireMessage}
              onChange={(e) => setEnquireMessage(e.target.value)}
              placeholder="Your message to the seller..."
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm resize-none"
              rows={4}
            />
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => {
                  setEnquireOpen(false);
                  setEnquireProductId(null);
                }}
                className="flex-1 px-4 py-2 rounded-xl border border-slate-200 text-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={submitEnquire}
                disabled={enquireSending}
                className="flex-1 px-4 py-2 rounded-xl bg-sky-500 text-white font-medium disabled:opacity-50"
              >
                {enquireSending ? 'Sending...' : 'Send enquiry'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function WallPage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={<div className="min-h-screen bg-gradient-to-br from-slate-50 to-white" />}>
        <WallPageContent />
      </Suspense>
    </ProtectedRoute>
  );
}
