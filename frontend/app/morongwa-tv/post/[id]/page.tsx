'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, Tv } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useCartAndStores } from '@/lib/useCartAndStores';
import { AppSidebar, AppSidebarMenuButton } from '@/components/AppSidebar';
import { SearchButton } from '@/components/SearchButton';
import { TVGridTile } from '@/components/tv/TVGridTile';
import type { TVGridItem } from '@/components/tv/TVGridTile';
import { VideoSidebar } from '@/components/tv/VideoSidebar';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { tvAPI, productEnquiryAPI } from '@/lib/api';
import toast from 'react-hot-toast';

export default function PostPage() {
  const params = useParams();
  const router = useRouter();
  const postId = params.id as string;
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [item, setItem] = useState<TVGridItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [relatedVideos, setRelatedVideos] = useState<TVGridItem[]>([]);
  const [relatedLoading, setRelatedLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [likedMap, setLikedMap] = useState<Record<string, boolean>>({});
  const [enquireOpen, setEnquireOpen] = useState(false);
  const [enquireProductId, setEnquireProductId] = useState<string | null>(null);
  const [enquireMessage, setEnquireMessage] = useState('');
  const [enquireSending, setEnquireSending] = useState(false);
  const { cartCount, hasStore } = useCartAndStores(!!user);

  useEffect(() => {
    if (!postId) return;
    setLoading(true);
    tvAPI
      .getPost(postId)
      .then((res) => {
        const data = res.data?.data ?? res.data;
        setItem(data as TVGridItem);
      })
      .catch(() => setItem(null))
      .finally(() => setLoading(false));
  }, [postId]);

  useEffect(() => {
    setRelatedLoading(true);
    tvAPI
      .getFeed({ limit: 24, type: 'video', sort: 'newest' })
      .then((res) => {
        const data = res.data?.data ?? res.data ?? [];
        setRelatedVideos(Array.isArray(data) ? data : []);
      })
      .catch(() => setRelatedVideos([]))
      .finally(() => setRelatedLoading(false));
  }, []);

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  const handleLike = (id: string, liked: boolean) => {
    setLikedMap((m) => ({ ...m, [id]: liked }));
    if (item && item._id === id) {
      setItem((prev) =>
        prev
          ? { ...prev, likeCount: Math.max(0, (prev.likeCount ?? 0) + (liked ? 1 : -1)) }
          : null
      );
    }
    tvAPI.like(id).catch(() => {
      setLikedMap((m) => ({ ...m, [id]: !liked }));
    });
  };

  const handleRepost = (id: string) => {
    tvAPI.repost(id).then(() => {
      toast.success('Reposted');
    });
  };

  const handleCommentAdded = (id: string) => {
    if (item && item._id === id) {
      setItem((prev) =>
        prev ? { ...prev, commentCount: (prev.commentCount ?? 0) + 1 } : null
      );
    }
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
        toast.success('Enquiry sent. View in Messages → Product enquiries.');
        setEnquireOpen(false);
        setEnquireProductId(null);
      })
      .catch((e: any) => toast.error(e.response?.data?.message || 'Failed to send enquiry'))
      .finally(() => setEnquireSending(false));
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen flex flex-col bg-gradient-to-br from-sky-50 via-blue-50 to-white text-slate-900">
        <header className="sticky top-0 z-40 w-full bg-white/95 backdrop-blur-md border-b border-slate-100 shadow-sm flex-shrink-0">
          <div className="px-4 sm:px-6 lg:px-8 py-2 sm:py-3">
            <div className="flex items-center gap-2 sm:gap-4 min-w-0">
              <Link
                href="/morongwa-tv"
                className="shrink-0 flex items-center text-slate-600 hover:text-slate-900"
                aria-label="Back to QwertyTV"
              >
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <Link href="/wall" className="shrink-0 flex items-center" aria-label="Home">
                <img src="/qwertymates-logo-icon.png" alt="Qwertymates" className="h-16 w-16 sm:h-[4.25rem] sm:w-[4.25rem] object-contain lg:hidden shrink-0" />
                <img src="/qwertymates-logo.png" alt="Qwertymates" className="h-8 w-auto object-contain hidden lg:block" />
              </Link>
              <AppSidebarMenuButton onClick={() => setMenuOpen((v) => !v)} />
              <div className="flex items-center gap-2 min-w-0 shrink-0">
                <Tv className="h-5 w-5 text-sky-600" />
                <h1 className="text-base sm:text-lg font-semibold text-slate-900 truncate">Post</h1>
              </div>
              <div className="flex-1 min-w-0" />
              <SearchButton />
            </div>
          </div>
        </header>

        <div className="flex min-h-0 min-w-0 w-full flex-1">
          <AppSidebar
            variant="wall"
            userName={user?.name}
            userAvatar={(user as any)?.avatar}
            cartCount={cartCount}
            hasStore={hasStore}
            onLogout={handleLogout}
            menuOpen={menuOpen}
            setMenuOpen={setMenuOpen}
            hideLogo
            belowHeader
          />
          <div className="flex-1 flex flex-col lg:flex-row gap-0 min-h-0 min-w-0 overflow-hidden max-w-[1920px] mx-auto w-full lg:items-stretch">
            <main className="flex-1 min-w-0 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain [scrollbar-width:thin] px-4 sm:px-6 lg:px-8 py-4 pb-24 lg:pb-6">
              <div className="max-w-full">
                {loading ? (
                  <div className="flex justify-center py-24">
                    <Loader2 className="h-12 w-12 text-sky-500 animate-spin" />
                  </div>
                ) : !item ? (
                  <div className="rounded-2xl border border-slate-100 bg-white/90 backdrop-blur p-12 text-center">
                    <Tv className="h-16 w-16 text-slate-300 mx-auto mb-4" />
                    <h2 className="text-xl font-semibold text-slate-700 mb-2">Post not found</h2>
                    <p className="text-slate-600 mb-6">This post may have been removed or the link is invalid.</p>
                    <Link
                      href="/morongwa-tv"
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-500 text-white font-medium hover:bg-sky-600"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      Back to QwertyTV
                    </Link>
                  </div>
                ) : (
                  <TVGridTile
                    item={item}
                    liked={likedMap[item._id]}
                    onLike={handleLike}
                    onRepost={item.type !== 'product_tile' ? handleRepost : undefined}
                    onEnquire={handleEnquire}
                    onCommentAdded={item.type !== 'product_tile' ? handleCommentAdded : undefined}
                    onDelete={() => router.push('/wall')}
                    currentUserId={user?._id || user?.id}
                    isVisible
                  />
                )}
              </div>
            </main>
            {!isFullscreen && (
              <div className="w-full shrink-0 min-h-0 flex flex-col max-h-[45vh] lg:max-h-none lg:h-full lg:w-[320px] xl:w-[360px]">
                <VideoSidebar
                  items={relatedVideos}
                  currentPostId={postId}
                  loading={relatedLoading}
                  creatorId={item?.creatorId ? (typeof item.creatorId === 'object' ? (item.creatorId as any)._id : item.creatorId) : undefined}
                  creatorName={item?.creatorId && typeof item.creatorId === 'object' ? (item.creatorId as any).name : undefined}
                />
              </div>
            )}
          </div>
        </div>
        <MobileBottomNav cartCount={cartCount} hasStore={hasStore} />

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
    </ProtectedRoute>
  );
}
