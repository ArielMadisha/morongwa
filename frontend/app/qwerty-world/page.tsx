'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { TVGridTile } from '@/components/tv/TVGridTile';
import type { TVGridItem } from '@/components/tv/TVGridTile';
import { AppSidebar } from '@/components/AppSidebar';
import { AppShellHeader } from '@/components/AppShellHeader';
import { SearchButton } from '@/components/SearchButton';
import { ProfileHeaderButton } from '@/components/ProfileHeaderButton';
import { AdvertSlot } from '@/components/AdvertSlot';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { useAuth } from '@/contexts/AuthContext';
import { useCartAndStores } from '@/lib/useCartAndStores';
import { tvAPI, musicAPI, productsAPI, type SongRecord } from '@/lib/api';
import type { Product } from '@/lib/types';

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export default function QwertyWorldPage() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const { cartCount, hasStore } = useCartAndStores(!!user);

  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cards, setCards] = useState<TVGridItem[]>([]);
  const [likedMap, setLikedMap] = useState<Record<string, boolean>>({});
  const [worldPage, setWorldPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const limitPerKind = {
    product: 6,
    video: 8,
    image: 4,
    text: 4,
    music: 8,
  };

  const loadWorld = useCallback(async (pageNum = 1, append = false, random = false) => {
    if (pageNum === 1 && !append) setLoading(true);
    else setLoadingMore(true);
    try {
      const [featuredProductsRes, videosRes, imagesRes, textsRes, songsRes] = await Promise.all([
        random ? productsAPI.list({ limit: limitPerKind.product, random: true }) : productsAPI.list({ page: pageNum, limit: limitPerKind.product }),
        tvAPI.getFeed({ page: pageNum, limit: limitPerKind.video, type: 'video', sort: random ? 'random' : 'newest' }),
        tvAPI.getFeed({ page: pageNum, limit: limitPerKind.image, type: 'image', sort: random ? 'random' : 'newest' }),
        tvAPI.getFeed({ page: pageNum, limit: limitPerKind.text, type: 'text', sort: random ? 'random' : 'newest' }),
        musicAPI.getSongs({ type: 'song', page: pageNum, limit: limitPerKind.music, random }),
      ]);

      const featuredProducts = (featuredProductsRes.data?.data ?? featuredProductsRes.data ?? []) as Product[];
      const videos = (videosRes.data?.data ?? videosRes.data ?? []) as TVGridItem[];
      const images = (imagesRes.data?.data ?? imagesRes.data ?? []) as TVGridItem[];
      const texts = (textsRes.data?.data ?? textsRes.data ?? []) as TVGridItem[];
      const songs = (songsRes.data?.data ?? songsRes.data ?? []) as SongRecord[];

      const productTiles: TVGridItem[] = (Array.isArray(featuredProducts) ? featuredProducts : []).slice(0, limitPerKind.product).map((p: any) => ({
        _id: String(p._id),
        type: 'product_tile',
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
      }));

      const tvItems: TVGridItem[] = [
        ...((Array.isArray(videos) ? videos : []) || []).slice(0, limitPerKind.video),
        ...((Array.isArray(images) ? images : []) || []).slice(0, limitPerKind.image),
        ...((Array.isArray(texts) ? texts : []) || []).slice(0, limitPerKind.text),
        ...productTiles,
      ].filter((x) => !!x?._id);

      const audioItems: TVGridItem[] = (Array.isArray(songs) ? songs : [])
        .slice(0, limitPerKind.music)
        .map((s) => {
          const songId = (s._id ?? '') ? String(s._id) : '';
          const userId = s.userId?._id ? String(s.userId._id) : undefined;

          // Feed into TVGridTile's "audio post" renderer for consistent card sizing.
          return {
            _id: `audio-${songId}`,
            type: 'audio',
            mediaUrls: [s.audioUrl],
            artworkUrl: s.artworkUrl,
            songId: {
              _id: songId,
              title: s.title,
              artist: s.artist,
              artworkUrl: s.artworkUrl,
              downloadEnabled: s.downloadEnabled,
              downloadPrice: s.downloadPrice,
            },
            creatorId: userId
              ? { _id: userId, name: s.userId?.name }
              : undefined,
            caption: s.title,
            likeCount: 0,
            commentCount: 0,
            shareCount: 0,
            createdAt: s.createdAt ? String(s.createdAt) : undefined,
          } as TVGridItem;
        });

      const combined: TVGridItem[] = [...tvItems, ...audioItems].filter((x) => !!x?._id);

      const shuffled = shuffleArray(combined);
      const batch = shuffled.slice(0, 24);
      if (append) setCards((prev) => [...prev, ...batch]);
      else setCards(batch);

      if (!random) {
        const tvTotal = Number(videosRes.data?.total ?? 0);
        const songsTotal = Number(songsRes.data?.total ?? 0);
        const productsHasMore = Boolean(featuredProductsRes.data?.hasMore);
        const tvHasMore = tvTotal > pageNum * limitPerKind.video;
        const songsHasMore = songsTotal > pageNum * limitPerKind.music;
        setHasMore(productsHasMore || tvHasMore || songsHasMore || batch.length > 0);
        setWorldPage(pageNum);
      } else {
        setHasMore(batch.length > 0);
      }
    } catch {
      if (!append) setCards([]);
      setHasMore(false);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    void loadWorld(1);
  }, [loadWorld]);

  const loadMore = useCallback(async () => {
    if (loading || loadingMore) return;
    if (hasMore) {
      await loadWorld(worldPage + 1, true, false);
      return;
    }
    // Endless feed: when paged data is exhausted, keep appending random mixed cards.
    await loadWorld(1, true, true);
  }, [loading, loadingMore, hasMore, worldPage, loadWorld]);

  useEffect(() => {
    const container = containerRef.current;
    const sentinel = sentinelRef.current;
    if (!container || !sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first?.isIntersecting && cards.length > 0 && !loading && !loadingMore) {
          void loadMore();
        }
      },
      { root: container, rootMargin: '360px 0px', threshold: 0.01 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [cards.length, loading, loadingMore, loadMore]);

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  const handleLike = (id: string, liked: boolean) => {
    setLikedMap((m) => ({ ...m, [id]: liked }));
    setCards((prev) =>
      prev.map((c) => {
        if (c._id !== id) return c;
        const nextLikeCount = Math.max(0, (c.likeCount ?? 0) + (liked ? 1 : -1));
        return { ...c, likeCount: nextLikeCount };
      }),
    );

    tvAPI
      .like(id)
      .then(() => {
        // keep optimistic state; backend response not needed for this view
      })
      .catch(() => {
        // revert on failure
        setLikedMap((m) => ({ ...m, [id]: !liked }));
        setCards((prev) =>
          prev.map((c) => {
            if (c._id !== id) return c;
            const nextLikeCount = Math.max(0, (c.likeCount ?? 0) + (liked ? -1 : 1));
            return { ...c, likeCount: nextLikeCount };
          }),
        );
      });
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-sky-50 via-blue-50 to-white text-slate-900">
      <AppShellHeader
        onMenuClick={() => setMenuOpen((v) => !v)}
        center={
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-semibold text-slate-900 truncate">QwertyWorld</h1>
            <p className="hidden sm:block text-[10px] sm:text-xs text-slate-500 truncate">
              Join the Qwerty Revolution, Lets Qwerty
            </p>
          </div>
        }
        actions={
          <>
            <SearchButton />
            <ProfileHeaderButton />
          </>
        }
      />

      <div className="flex min-h-0 min-w-0 w-full flex-1 overflow-hidden">
        {user && (
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
        )}

        <div ref={containerRef} className="flex-1 flex flex-col lg:flex-row min-w-0 min-h-0 overflow-y-auto overflow-x-hidden">
          <main className="min-w-0 flex-1 px-4 sm:px-6 lg:px-8 py-6 pb-24 lg:pb-6 order-2 lg:order-none w-full">
            {loading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 auto-rows-fr">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                  <div
                    key={i}
                    className="bg-white/80 rounded-2xl border border-slate-100 p-4 animate-pulse aspect-[3/4]"
                  >
                    <div className="mb-3 aspect-square rounded-xl bg-slate-200" />
                    <div className="h-4 bg-slate-200 rounded w-3/4 mb-2" />
                    <div className="h-4 bg-slate-200 rounded w-1/2" />
                  </div>
                ))}
              </div>
            ) : cards.length === 0 ? (
              <div className="bg-white/90 backdrop-blur rounded-2xl border border-slate-100 p-12 text-center">
                <Loader2 className="h-16 w-16 text-slate-300 mx-auto mb-4 animate-spin" />
                <h2 className="text-xl font-semibold text-slate-700 mb-2">No items found</h2>
                <p className="text-slate-600">Try again later.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 auto-rows-fr">
                {cards.map((item, idx) => (
                  <div key={`${item._id}-${idx}`} className="aspect-[3/4]">
                    <TVGridTile
                      item={item}
                      variant="grid"
                      liked={!!likedMap[item._id]}
                      onLike={user ? (item.type === 'audio' ? undefined : handleLike) : undefined}
                      currentUserId={user?._id || user?.id}
                    />
                  </div>
                ))}
              </div>
            )}
            {!loading && cards.length > 0 && (
              <div ref={sentinelRef} className="flex justify-center py-8 min-h-[80px]">
                {loadingMore ? <Loader2 className="h-8 w-8 text-sky-500 animate-spin" /> : <div className="h-4" aria-hidden />}
              </div>
            )}
          </main>
          <AdvertSlot belowHeader />
        </div>
      </div>

      <MobileBottomNav cartCount={cartCount} hasStore={hasStore} />
    </div>
  );
}

