'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { LayoutGrid, Plus, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useCartAndStores } from '@/lib/useCartAndStores';
import { AppSidebar, AppSidebarMenuButton } from '@/components/AppSidebar';
import { ProfileDropdown } from '@/components/ProfileDropdown';
import { TVGridTileWithObserver } from '@/components/tv/TVGridTileWithObserver';
import type { TVGridItem } from '@/components/tv/TVGridTile';
import { CreatePostModal } from '@/components/tv/CreatePostModal';
import { tvAPI, productEnquiryAPI } from '@/lib/api';
import type { Product } from '@/lib/types';
import toast from 'react-hot-toast';

function WallPageContent() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [gridItems, setGridItems] = useState<TVGridItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [enquireOpen, setEnquireOpen] = useState(false);
  const [enquireProductId, setEnquireProductId] = useState<string | null>(null);
  const [enquireMessage, setEnquireMessage] = useState('');
  const [enquireSending, setEnquireSending] = useState(false);
  const [likedMap, setLikedMap] = useState<Record<string, boolean>>({});
  const { cartCount, hasStore } = useCartAndStores(!!user);
  const containerRef = useRef<HTMLDivElement>(null);
  const limit = 24;

  const loadFeed = useCallback(async (pageNum = 1, append = false) => {
    if (pageNum === 1) setLoading(true);
    else setLoadingMore(true);
    try {
      const res = await tvAPI.getFeed({ page: pageNum, limit });
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
  }, []);

  const [productTiles, setProductTiles] = useState<TVGridItem[]>([]);
  const [featuredProducts, setFeaturedProducts] = useState<(Product & { _id: string })[]>([]);

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

  useEffect(() => {
    loadFeed(1);
    loadFeaturedProducts();
  }, [loadFeed, loadFeaturedProducts]);

  const loadMore = () => {
    if (loadingMore || gridItems.length >= total) return;
    const nextPage = page + 1;
    setPage(nextPage);
    loadFeed(nextPage, true);
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

  const allItems: TVGridItem[] = [...productTiles, ...gridItems];

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-blue-50 to-white text-slate-900 flex">
      <AppSidebar
        variant="wall"
        userName={user?.name}
        cartCount={cartCount}
        hasStore={hasStore}
        onLogout={handleLogout}
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
      />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="bg-white/85 backdrop-blur-md border-b border-slate-100 shadow-sm flex-shrink-0">
          <div className="px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <AppSidebarMenuButton onClick={() => setMenuOpen(true)} />
                <div className="flex items-center gap-2">
                  <LayoutGrid className="h-5 w-5 text-sky-500" />
                  <p className="text-sm font-medium text-slate-700 truncate">
                    Welcome back, {user?.name}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setCreateOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-500 text-white font-medium hover:bg-sky-600 transition-colors"
                >
                  <Plus className="h-5 w-5" />
                  Create
                </button>
                <ProfileDropdown userName={user?.name} onLogout={handleLogout} />
              </div>
            </div>
          </div>
        </header>

        <main
          ref={containerRef}
          className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-6"
        >
          {loading && allItems.length === 0 ? (
            <div className="flex justify-center py-24">
              <Loader2 className="h-12 w-12 text-sky-500 animate-spin" />
            </div>
          ) : allItems.length === 0 ? (
            <div className="rounded-2xl border border-slate-100 bg-white/90 backdrop-blur p-12 text-center">
              <LayoutGrid className="h-16 w-16 text-slate-300 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-slate-700 mb-2">No content yet</h2>
              <p className="text-slate-600 mb-6">Share something new or browse the marketplace.</p>
              <button
                onClick={() => setCreateOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-500 text-white font-medium hover:bg-sky-600"
              >
                <Plus className="h-5 w-5" />
                Create post
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 lg:gap-6">
              {allItems.map((item) => (
                <TVGridTileWithObserver
                  key={item._id}
                  item={item}
                  liked={likedMap[item._id]}
                  onLike={handleLike}
                  onRepost={item.type !== 'product_tile' ? handleRepost : undefined}
                  onEnquire={handleEnquire}
                  onCommentAdded={item.type !== 'product_tile' ? handleCommentAdded : undefined}
                />
              ))}
            </div>
          )}

          {!loading && gridItems.length < total && (
            <div className="flex justify-center py-8">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="px-6 py-2 rounded-xl border border-slate-200 text-slate-700 font-medium hover:bg-slate-50 disabled:opacity-50"
              >
                {loadingMore ? <Loader2 className="h-5 w-5 animate-spin inline" /> : 'Load more'}
              </button>
            </div>
          )}
        </main>
      </div>

      <CreatePostModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setPage(1);
          loadFeed(1);
        }}
        featuredProducts={featuredProducts}
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
