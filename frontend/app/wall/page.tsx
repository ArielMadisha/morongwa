'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { LayoutGrid, Loader2, MessageSquare, Plus } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useCartAndStores } from '@/lib/useCartAndStores';
import { AppSidebar, AppSidebarMenuButton } from '@/components/AppSidebar';
import { SearchButton } from '@/components/SearchButton';
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

function WallPageContent() {
  const { user, logout, refreshUser } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchQ = searchParams.get('q') ?? '';
  const [menuOpen, setMenuOpen] = useState(false);
  const [gridItems, setGridItems] = useState<TVGridItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [statusRefreshKey, setStatusRefreshKey] = useState(0);
  const [latestCreatedPost, setLatestCreatedPost] = useState<TVGridItem | null>(null);
  const [enquireOpen, setEnquireOpen] = useState(false);
  const [enquireProductId, setEnquireProductId] = useState<string | null>(null);
  const [enquireMessage, setEnquireMessage] = useState('');
  const [enquireSending, setEnquireSending] = useState(false);
  const [likedMap, setLikedMap] = useState<Record<string, boolean>>({});
  const { cartCount, hasStore } = useCartAndStores(!!user);
  const containerRef = useRef<HTMLDivElement>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);
  const limit = 24;

  const loadFeed = useCallback(async (pageNum = 1, append = false) => {
    if (pageNum === 1) setLoading(true);
    else setLoadingMore(true);
    try {
      const res = await tvAPI.getFeed({ page: pageNum, limit, q: searchQ || undefined });
      const data = res.data?.data ?? res.data ?? [];
      const posts = Array.isArray(data) ? data : [];
      setTotal(res.data?.total ?? posts.length);
      setGridItems((prev) => (append ? [...prev, ...posts] : posts));
    } catch {
      if (!append) setGridItems([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [searchQ]);

  const [productTiles, setProductTiles] = useState<TVGridItem[]>([]);
  const [featuredProducts, setFeaturedProducts] = useState<(Product & { _id: string })[]>([]);
  const [adverts, setAdverts] = useState<Array<{ _id: string; title: string; imageUrl: string; linkUrl?: string }>>([]);

  const loadFeaturedProducts = useCallback(() => {
    tvAPI
      .getFeaturedProducts()
      .then((res) => {
        const list = res.data?.data ?? res.data ?? [];
        const products = Array.isArray(list) ? list : [];
        setFeaturedProducts(products);
        setProductTiles(
          products.map((p: any) => ({
            _id: p._id,
            type: 'product_tile' as const,
            title: p.title,
            images: p.images,
            price: p.price,
            discountPrice: p.discountPrice,
            currency: p.currency,
            supplierId: p.supplierId,
            allowResell: p.allowResell ?? false,
            likeCount: 0,
            commentCount: 0,
            shareCount: 0,
          }))
        );
      })
      .catch(() => {
        setProductTiles([]);
        setFeaturedProducts([]);
      });
  }, []);

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
  }, [loadFeed]);
  useEffect(() => {
    advertsAPI.getAdverts().then((res) => {
      const data = res.data?.data ?? res.data ?? [];
      const list = Array.isArray(data) ? data : [];
      setAdverts(list);
    }).catch(() => setAdverts([]));
  }, []);

  const loadMore = useCallback(() => {
    if (loadingMore || gridItems.length >= total) return;
    const nextPage = page + 1;
    setPage(nextPage);
    loadFeed(nextPage, true);
  }, [loadingMore, gridItems.length, total, page, loadFeed]);

  useEffect(() => {
    const sentinel = loadMoreSentinelRef.current;
    const container = containerRef.current;
    if (!sentinel || !container) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const [e] = entries;
        if (e?.isIntersecting && !loading && !loadingMore && gridItems.length < total && gridItems.length > 0) {
          loadMore();
        }
      },
      { root: container, rootMargin: '200px', threshold: 0.1 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore, loading, loadingMore, gridItems.length, total]);

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

  // Intersperse adverts every 6 items for mobile (lg:hidden) - web uses AdvertSlot in right column
  const insertAdvertsEvery = 6;
  // Feed first (all posts including videos in sequence), then product tiles
  const feedWithoutLatest =
    latestCreatedPost
      ? gridItems.filter((p) => p._id !== latestCreatedPost._id)
      : gridItems;
  const baseItems: TVGridItem[] = latestCreatedPost
    ? [latestCreatedPost, ...feedWithoutLatest, ...productTiles]
    : [...gridItems, ...productTiles];
  const allItemsWithAds: (TVGridItem | { _id: string; type: 'advert'; title: string; imageUrl: string; linkUrl?: string })[] = [];
  baseItems.forEach((item, i) => {
    if (i > 0 && i % insertAdvertsEvery === 0 && adverts.length > 0) {
      const ad = adverts[Math.floor(Math.random() * adverts.length)];
      if (ad) allItemsWithAds.push({ _id: `ad-${ad._id}`, type: 'advert', ...ad });
    }
    allItemsWithAds.push(item);
  });

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-sky-50 via-blue-50 to-white text-slate-900">
      {/* Full-width frozen header - logo at top-left */}
      <header className="sticky top-0 z-40 w-full bg-white/95 backdrop-blur-md border-b border-slate-100 shadow-sm flex-shrink-0">
        <div className="px-4 sm:px-6 lg:px-8 py-2 sm:py-3">
          <div className="flex items-center justify-between gap-3 sm:gap-4 min-w-0 overflow-hidden">
            <Link href="/wall" className="shrink-0 flex items-center" aria-label="Home">
              <img src="/qwertymates-logo-icon.png" alt="Qwertymates" className="h-9 w-9 object-contain lg:hidden" />
              <img src="/qwertymates-logo.png" alt="Qwertymates" className="h-9 w-auto object-contain hidden lg:block" />
            </Link>
            <AppSidebarMenuButton onClick={() => setMenuOpen(true)} />
            <div className="flex-1 min-w-0 overflow-hidden">
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
            <SearchButton />
          </div>
        </div>
      </header>

      {/* Menu (sidebar) + content below header */}
      <div className="flex flex-1 min-h-0">
        <AppSidebar
          variant="wall"
          userName={user?.name}
          cartCount={cartCount}
          hasStore={hasStore}
          onLogout={handleLogout}
          menuOpen={menuOpen}
          setMenuOpen={setMenuOpen}
          hideLogo
          belowHeader
        />
        <div ref={containerRef} className="flex-1 flex flex-col lg:flex-row gap-2 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden">
        <main className="flex-1 min-w-0 pb-24 lg:pb-6 order-2 lg:order-none">
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
                      currentUserId={user?._id || user?.id}
                      onSetProfilePicFromUrl={handleSetProfilePicFromUrl}
                      onSetStripBackgroundFromUrl={handleSetStripBackgroundFromUrl}
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          {!loading && gridItems.length < total && (
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

      <Link
        href="/messages"
        className="fixed right-4 bottom-20 lg:bottom-6 z-40 flex items-center justify-center w-14 h-14 rounded-full bg-sky-500 text-white shadow-lg hover:bg-sky-600 hover:shadow-xl transition-all"
        aria-label="Morongwa"
      >
        <MessageSquare className="h-6 w-6" />
      </Link>

      <CreatePostModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
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
      <WallPageContent />
    </ProtectedRoute>
  );
}
