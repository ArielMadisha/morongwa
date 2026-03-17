'use client';

import { useState, useEffect, useCallback } from 'react';
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
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { tvAPI } from '@/lib/api';

function UserFeedContent() {
  const params = useParams();
  const router = useRouter();
  const userId = params.userId as string;
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [items, setItems] = useState<TVGridItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [likedMap, setLikedMap] = useState<Record<string, boolean>>({});
  const { cartCount, hasStore } = useCartAndStores(!!user);

  const loadFeed = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await tvAPI.getFeed({ creatorId: userId, limit: 100, sort: 'newest' });
      const data = res.data?.data ?? res.data ?? [];
      setItems(Array.isArray(data) ? data : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadFeed();
  }, [loadFeed]);

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  const handleLike = (id: string, liked: boolean) => {
    setLikedMap((m) => ({ ...m, [id]: liked }));
    setItems((prev) =>
      prev.map((p) =>
        p._id === id
          ? { ...p, likeCount: Math.max(0, (p.likeCount ?? 0) + (liked ? 1 : -1)) }
          : p
      )
    );
    tvAPI.like(id).then((res) => {
      const likeCount = res.data?.data?.likeCount ?? res.data?.likeCount;
      if (typeof likeCount === 'number') {
        setItems((prev) =>
          prev.map((p) => (p._id === id ? { ...p, likeCount } : p))
        );
      }
    }).catch(() => {
      setLikedMap((m) => ({ ...m, [id]: !liked }));
    });
  };

  const handleRepost = (id: string) => {
    tvAPI.repost(id).then((res) => {
      const newPost = res.data?.data ?? res.data;
      if (newPost) setItems((prev) => [newPost, ...prev]);
    });
  };

  const handleCommentAdded = (id: string) => {
    setItems((prev) =>
      prev.map((p) => (p._id === id ? { ...p, commentCount: (p.commentCount ?? 0) + 1 } : p))
    );
  };

  const creatorName = items[0]?.creatorId?.name || 'Creator';

  return (
    <div className="min-h-screen bg-slate-900 text-white flex">
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
              <p className="text-slate-400 text-center mb-6">No posts yet</p>
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
                className="min-h-[100dvh] min-h-[100svh] snap-start snap-always flex items-center justify-center py-4 px-2 pb-24 lg:pb-8"
              >
                <div className="w-full max-w-md mx-auto flex-1 flex items-center justify-center min-h-0">
                  <TVGridTile
                    item={item}
                    liked={likedMap[item._id]}
                    onLike={handleLike}
                    onRepost={item.type !== 'product_tile' ? handleRepost : undefined}
                    onCommentAdded={item.type !== 'product_tile' ? handleCommentAdded : undefined}
                    onDelete={(id) => setItems((prev) => prev.filter((i) => i._id !== id))}
                    currentUserId={user?._id || user?.id}
                    isVisible={true}
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
      <UserFeedContent />
    </ProtectedRoute>
  );
}
