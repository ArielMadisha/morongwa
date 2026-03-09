'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Tv, Plus, Loader2, User } from 'lucide-react';
import { QwertyTVWithGenres } from '@/components/tv/QwertyTVWithGenres';
import { useAuth } from '@/contexts/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useCartAndStores } from '@/lib/useCartAndStores';
import { AppSidebar, AppSidebarMenuButton } from '@/components/AppSidebar';
import { SearchButton } from '@/components/SearchButton';
import { TVGridTileWithObserver } from '@/components/tv/TVGridTileWithObserver';
import type { TVGridItem } from '@/components/tv/TVGridTile';
import { CreatePostModal } from '@/components/tv/CreatePostModal';
import { AdvertSlot } from '@/components/AdvertSlot';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { tvAPI, productEnquiryAPI } from '@/lib/api';
import type { Product } from '@/lib/types';
import toast from 'react-hot-toast';

function MorongwaTVPageContent() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
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
  const [liveUsers, setLiveUsers] = useState<Array<{ userId: string; name?: string; avatar?: string }>>([]);
  const [genre, setGenre] = useState<string>('qwertz');
  const { cartCount, hasStore } = useCartAndStores(!!user);
  const containerRef = useRef<HTMLDivElement>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);
  const composeHandledRef = useRef(false);
  const limit = 8;

  const loadLiveUsers = useCallback(() => {
    tvAPI.getStatuses().then((res) => {
      const statuses = res.data?.data ?? res.data ?? [];
      const live = Array.isArray(statuses)
        ? statuses.filter((s: any) => s.isLive).map((s: any) => ({
            userId: String(s.userId?._id ?? s.userId),
            name: s.name,
            avatar: s.avatar,
          }))
        : [];
      setLiveUsers(live);
    }).catch(() => setLiveUsers([]));
  }, []);

  const loadFeed = useCallback(async (pageNum = 1, append = false) => {
    if (pageNum === 1) setLoading(true);
    else setLoadingMore(true);
    try {
      const res = await tvAPI.getFeed({ page: pageNum, limit, type: 'video', genre: genre || undefined });
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
  }, [limit, genre]);

  useEffect(() => {
    loadFeed(1);
    loadLiveUsers();
  }, [loadFeed, loadLiveUsers, genre]);

  useEffect(() => {
    const compose = searchParams.get('compose');
    if (composeHandledRef.current) return;
    if (compose === 'qwertz') {
      composeHandledRef.current = true;
      setGenre('qwertz');
      setCreateOpen(true);
      router.replace('/morongwa-tv');
    }
  }, [router, searchParams]);

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

  const allItems: TVGridItem[] = [...gridItems];

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-sky-50 via-blue-50 to-white text-slate-900">
      {/* Full-width frozen header - logo, QwertyTV title, Live now strip, actions */}
      <header className="sticky top-0 z-40 w-full bg-white/95 backdrop-blur-md border-b border-slate-100 shadow-sm flex-shrink-0">
        <div className="px-4 sm:px-6 lg:px-8 py-2 sm:py-3">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <Link href="/wall" className="shrink-0 flex items-center" aria-label="Home">
              <img src="/qwertymates-logo-icon.png" alt="Qwertymates" className="h-8 w-8 object-contain lg:hidden" />
              <img src="/qwertymates-logo.png" alt="Qwertymates" className="h-8 w-auto object-contain hidden lg:block" />
            </Link>
            <AppSidebarMenuButton onClick={() => setMenuOpen(true)} />
            <button
              onClick={() => setCreateOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand-500 text-white font-medium hover:bg-brand-600 transition-colors shrink-0"
            >
              <Plus className="h-4 w-4" />
              <span className="text-sm">Create</span>
            </button>
            {/* Live now strip - in top bar */}
            <div className="flex-1 min-w-0 overflow-x-auto scrollbar-thin flex items-center gap-2 py-1">
              {liveUsers.length > 0 && (
                <>
                  <span className="flex items-center gap-1.5 shrink-0 text-xs font-medium text-slate-600">
                    <span className="inline-flex h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                    Live now
                  </span>
                  {liveUsers.map((u) => (
                    <Link
                      key={u.userId}
                      href={`/morongwa-tv/user/${u.userId}`}
                      className="flex-shrink-0 flex items-center gap-2 px-2 py-1.5 rounded-lg bg-red-50 border border-red-200 hover:border-red-400 transition-colors"
                    >
                      <div className="relative">
                        <div className="h-7 w-7 rounded-full bg-sky-100 border-2 border-red-300 flex items-center justify-center overflow-hidden">
                          {u.avatar ? (
                            <img src={u.avatar} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <User className="h-4 w-4 text-sky-600" />
                          )}
                        </div>
                        <span className="absolute -bottom-0.5 -right-0.5 inline-flex h-2 w-2 rounded-full bg-red-500" />
                      </div>
                      <span className="text-xs font-medium text-slate-800 truncate max-w-[60px] sm:max-w-[80px]">{u.name || 'User'}</span>
                    </Link>
                  ))}
                </>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <SearchButton />
              <QwertyTVWithGenres selectedGenre={genre} onGenreSelect={setGenre} />
            </div>
          </div>
        </div>
      </header>

      {/* Menu (sidebar) + content below header */}
      <div className="flex flex-1 min-h-0">
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
        <div ref={containerRef} className="flex-1 flex flex-col lg:flex-row gap-0 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain">
        <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-4 pb-24 lg:pb-6 order-2 lg:order-none">
          {loading && allItems.length === 0 ? (
            <div className="flex justify-center py-24">
              <Loader2 className="h-12 w-12 text-sky-500 animate-spin" />
            </div>
          ) : allItems.length === 0 ? (
            <div className="rounded-2xl border border-slate-100 bg-white/90 backdrop-blur p-12 text-center">
              <Tv className="h-16 w-16 text-slate-300 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-slate-700 mb-2">No content yet</h2>
              <p className="text-slate-600 mb-6">Be the first to share. Create a post to get started.</p>
              <button
                onClick={() => setCreateOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-500 text-white font-medium hover:bg-sky-600"
              >
                <Plus className="h-5 w-5" />
                Create post
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 w-full">
              {allItems.map((item) => (
                <div key={item._id} className="w-full min-h-[300px] flex flex-col rounded-xl bg-white border border-slate-100 shadow-sm overflow-hidden">
                  <TVGridTileWithObserver
                    item={item}
                    liked={likedMap[item._id]}
                    onLike={handleLike}
                    onRepost={item.type !== 'product_tile' ? handleRepost : undefined}
                    currentUserId={user?._id || user?.id}
                    onEnquire={handleEnquire}
                    onCommentAdded={item.type !== 'product_tile' ? handleCommentAdded : undefined}
                    variant="grid"
                  />
                </div>
              ))}
            </div>
          )}

          {!loading && allItems.length < total && (
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

      <CreatePostModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setPage(1);
          loadFeed(1);
          loadLiveUsers();
        }}
        featuredProducts={[]}
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

export default function MorongwaTVPage() {
  return (
    <ProtectedRoute>
      <MorongwaTVPageContent />
    </ProtectedRoute>
  );
}
