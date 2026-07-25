'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { LayoutGrid, Loader2, Plus, Hash, X } from 'lucide-react';
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
import { APP_SHELL_MOBILE_LOGO_CLASS } from '@/components/AppShellHeader';
import { PAGE_PAD_BOTTOM_MOBILE_NAV } from '@/lib/appShellLayout';
import { AdvertTile } from '@/components/AdvertTile';
import {
  type FeedAd,
  legacyAdvertToFeedAd,
  isBrokenLegacyAdvert,
  pickFeedAd,
  sponsoredAdToFeedAd,
} from '@/lib/feedAd';
import { tvAPI, productEnquiryAPI, advertsAPI, usersAPI, cartAPI } from '@/lib/api';
import { productQtyMapFromCartResponse } from '@/lib/cartProductQty';
import type { Product } from '@/lib/types';
import toast from 'react-hot-toast';
import {
  ContentPreferencesModal,
  shouldShowPreferencesModal,
  getHideProducts,
} from '@/components/ContentPreferencesModal';
import { normalizeClientUser, userPublicDisplayName } from '@/lib/userDisplayLabel';
import { dispatchAvatarUpdated } from '@/lib/avatarUpdatedEvent';
import { mapProductToTvTile } from '@/lib/mapProductToTvTile';
import { parseHashtagFromQuery } from '@/lib/hashtagQuery';
import {
  FEED_SCROLL_TOP_THRESHOLD,
  mergeFreshFeedHead,
  prependNewFeedItems,
  readFeedScrollTop,
  useFeedAutoRefresh,
} from '@/lib/useFeedAutoRefresh';

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
/** Append feed pages without duplicate post ids (stable infinite scroll). */
function mergeFeedPages(prev: TVGridItem[], incoming: TVGridItem[], append: boolean): TVGridItem[] {
  if (!append) return sortFeedNewestFirst(incoming);
  const seen = new Set(prev.map((p) => String(p._id)));
  const fresh = incoming.filter((p) => !seen.has(String(p._id)));
  if (!fresh.length) return prev;
  return sortFeedNewestFirst([...prev, ...fresh]);
}

function feedScrollRoot(container: HTMLDivElement | null): Element | null {
  if (!container) return null;
  return container.scrollHeight > container.clientHeight + 2 ? container : null;
}

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
  const [searchQ, setSearchQ] = useState(() => searchParams.get('q') ?? '');
  const [menuOpen, setMenuOpen] = useState(false);
  const [gridItems, setGridItems] = useState<TVGridItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [statusRefreshKey, setStatusRefreshKey] = useState(0);
  const [trendingRefreshKey, setTrendingRefreshKey] = useState(0);
  const [newPostsBanner, setNewPostsBanner] = useState(0);
  const [latestCreatedPost, setLatestCreatedPost] = useState<TVGridItem | null>(null);
  const [enquireOpen, setEnquireOpen] = useState(false);
  const [enquireProductId, setEnquireProductId] = useState<string | null>(null);
  const [enquireMessage, setEnquireMessage] = useState('');
  const [enquireSending, setEnquireSending] = useState(false);
  const [likedMap, setLikedMap] = useState<Record<string, boolean>>({});
  const [prefsModalOpen, setPrefsModalOpen] = useState(false);
  const hideProducts = getHideProducts(user);
  const { cartCount, hasStore, invalidate: invalidateCart } = useCartAndStores(!!user);
  const [cartQtyByProduct, setCartQtyByProduct] = useState<Record<string, number>>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);
  const loadingMoreRef = useRef(false);
  const lastLoadedPageRef = useRef(0);
  const maybeLoadMoreRef = useRef<() => void>(() => {});
  const limit = 24;

  const refreshCartQty = useCallback(() => {
    if (!user) {
      setCartQtyByProduct({});
      return;
    }
    cartAPI
      .get()
      .then((res) => setCartQtyByProduct(productQtyMapFromCartResponse(res)))
      .catch(() => setCartQtyByProduct({}));
  }, [user]);

  const handleCartUpdated = useCallback(() => {
    invalidateCart();
    refreshCartQty();
  }, [invalidateCart, refreshCartQty]);

  useEffect(() => {
    refreshCartQty();
  }, [refreshCartQty]);

  const prefillHashtag =
    searchParams.get('hashtag')?.replace(/^#/, '').trim() ||
    parseHashtagFromQuery(searchQ) ||
    undefined;
  const activeHashtag = parseHashtagFromQuery(searchQ) || prefillHashtag;
  useEffect(() => {
    setSearchQ(searchParams.get('q') ?? '');
  }, [searchParams]);
  useEffect(() => {
    if (searchParams.get('create') === '1') setCreateOpen(true);
  }, [searchParams]);

  const loadFeed = useCallback(
    async (pageNum = 1, append = false, opts?: { q?: string | null; emptySkip?: number }) => {
      if (pageNum === 1) setLoading(true);
      else setLoadingMore(true);
      loadingMoreRef.current = true;
      if (pageNum === 1) setHasMore(true);
      const qParam =
        opts && Object.prototype.hasOwnProperty.call(opts, 'q')
          ? opts.q === null || opts.q === ''
            ? undefined
            : String(opts.q).trim() || undefined
          : searchQ.trim() || undefined;
      try {
        const res = await tvAPI.getFeed({
          page: pageNum,
          limit,
          sort: 'newest',
          q: qParam,
          hideProducts: !user ? hideProducts : undefined,
        });
        const data = res.data?.data ?? res.data ?? [];
        const raw = Array.isArray(data) ? data : [];
        const posts = sortFeedNewestFirst(raw as TVGridItem[]);
        const fetchedTotal = Number(res.data?.total ?? posts.length);
        setTotal(fetchedTotal);
        const receivedCount = posts.length;
        let addedCount = 0;
        setGridItems((prev) => {
          const next = mergeFeedPages(prev, posts, append);
          addedCount = append ? next.length - prev.length : next.length;
          return next;
        });
        lastLoadedPageRef.current = pageNum;
        setPage(pageNum);

        // Full API page ⇒ more may exist; partial/empty page ⇒ end (unless skipping filtered empties).
        const stillHasMore = receivedCount >= limit;
        const emptySkip = opts?.emptySkip ?? 0;

        if (
          append &&
          receivedCount === 0 &&
          pageNum * limit < fetchedTotal &&
          emptySkip < 8
        ) {
          setHasMore(true);
          await loadFeed(pageNum + 1, true, { ...opts, emptySkip: emptySkip + 1 });
          return;
        }

        if (append && receivedCount >= limit && addedCount === 0 && emptySkip < 4) {
          setHasMore(true);
          await loadFeed(pageNum + 1, true, { ...opts, emptySkip: emptySkip + 1 });
          return;
        }

        setHasMore(stillHasMore);
      } catch {
        if (!append) setGridItems([]);
        if (append) setHasMore(false);
      } finally {
        setLoading(false);
        setLoadingMore(false);
        loadingMoreRef.current = false;
        requestAnimationFrame(() => maybeLoadMoreRef.current());
      }
    },
    [searchQ, limit, user, hideProducts]
  );

  useEffect(() => {
    const onAvatarUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ avatar?: string; feedPost?: TVGridItem }>).detail;
      setStatusRefreshKey((k) => k + 1);
      refreshUser?.();
      const uid = user?._id || user?.id;
      const avatar = detail?.avatar || (user as { avatar?: string } | undefined)?.avatar;
      if (uid && avatar) {
        setGridItems((prev) =>
          prev.map((p) => {
            const c = p.creatorId;
            if (!c || typeof c !== 'object') return p;
            const cid = String((c as { _id?: string })._id ?? '');
            if (cid !== String(uid)) return p;
            return { ...p, creatorId: { ...(c as object), avatar } as TVGridItem['creatorId'] };
          })
        );
      }
      if (detail?.feedPost?._id) {
        const enriched = uid
          ? {
              ...detail.feedPost,
              creatorId: normalizeClientUser({
                ...(typeof detail.feedPost.creatorId === 'object' ? detail.feedPost.creatorId : {}),
                _id: uid,
                avatar: detail.feedPost.creatorId?.avatar || avatar,
                name: user ? userPublicDisplayName(user) : detail.feedPost.creatorId?.name,
                username: (user as { username?: string })?.username || detail.feedPost.creatorId?.username,
              }),
            }
          : detail.feedPost;
        setLatestCreatedPost(enriched);
        setGridItems((prev) => {
          if (prev.some((p) => p._id === enriched._id)) return prev;
          return [enriched, ...prev];
        });
      } else {
        void loadFeed(1, false);
      }
    };
    window.addEventListener('qwertymates:avatar-updated', onAvatarUpdated);
    return () => window.removeEventListener('qwertymates:avatar-updated', onAvatarUpdated);
  }, [loadFeed, refreshUser, user]);

  useEffect(() => {
    const container = containerRef.current;
    const onScroll = () => {
      if (readFeedScrollTop(container) <= FEED_SCROLL_TOP_THRESHOLD) {
        setNewPostsBanner(0);
      }
    };
    container?.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      container?.removeEventListener('scroll', onScroll);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  const jumpToNewPosts = useCallback(() => {
    setNewPostsBanner(0);
    requestAnimationFrame(() => {
      containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }, []);

  const [productTiles, setProductTiles] = useState<TVGridItem[]>([]);
  const [featuredProducts, setFeaturedProducts] = useState<(Product & { _id: string })[]>([]);
  const [feedAds, setFeedAds] = useState<FeedAd[]>([]);

  const loadFeaturedProducts = useCallback(() => {
    tvAPI
      .getFeaturedProducts(!user ? hideProducts : undefined, 120)
      .then((res) => {
        const list = res.data?.data ?? res.data ?? [];
        const products = Array.isArray(list) ? list : [];
        setFeaturedProducts(products);
        setProductTiles(products.map((p: any) => mapProductToTvTile(p)));
      })
      .catch(() => {
        setProductTiles([]);
        setFeaturedProducts([]);
      });
  }, [user, hideProducts]);

  /** Silent wall refresh — feed, stories strip, sidebar, and featured products (no full-page loader). */
  const refreshFeedHead = useCallback(async () => {
    if (loading && gridItems.length === 0) return;
    if (loadingMoreRef.current) return;

    setStatusRefreshKey((k) => k + 1);
    setTrendingRefreshKey((k) => k + 1);
    if (!activeHashtag) loadFeaturedProducts();

    const qParam = searchQ.trim() || undefined;
    const scrollTop = readFeedScrollTop(containerRef.current);
    const atTop = scrollTop <= FEED_SCROLL_TOP_THRESHOLD;

    try {
      const res = await tvAPI.getFeed({
        page: 1,
        limit,
        sort: 'newest',
        q: qParam,
        hideProducts: !user ? hideProducts : undefined,
      });
      const data = res.data?.data ?? res.data ?? [];
      const raw = Array.isArray(data) ? data : [];
      const incoming = sortFeedNewestFirst(raw as TVGridItem[]);
      let newCount = 0;
      setGridItems((prev) => {
        const result = atTop
          ? mergeFreshFeedHead(prev, incoming, sortFeedNewestFirst)
          : prependNewFeedItems(prev, incoming, sortFeedNewestFirst);
        newCount = result.newCount;
        return result.next;
      });
      if (newCount > 0 && !atTop) {
        setNewPostsBanner((n) => n + newCount);
      } else if (atTop) {
        setNewPostsBanner(0);
      }
    } catch {
      /* keep current feed on transient errors */
    }
  }, [
    loading,
    gridItems.length,
    searchQ,
    limit,
    user,
    hideProducts,
    activeHashtag,
    loadFeaturedProducts,
  ]);

  useFeedAutoRefresh({
    enabled: !loading || gridItems.length > 0,
    onRefresh: refreshFeedHead,
  });

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
    setPage(1);
    lastLoadedPageRef.current = 0;
    setHasMore(true);
    setGridItems([]);
    loadFeed(1, false);
    if (activeHashtag) {
      setProductTiles([]);
    } else {
      loadFeaturedProducts();
    }
  }, [loadFeed, loadFeaturedProducts, activeHashtag]);

  // Show content preferences modal (first visit or every 30 days)
  useEffect(() => {
    if (!SHOW_FEED_PREFERENCES_PROMPT) return;
    if (!loading && user !== undefined && shouldShowPreferencesModal(user)) {
      setPrefsModalOpen(true);
    }
  }, [loading, user]);
  useEffect(() => {
    Promise.all([
      advertsAPI.getAdverts(),
      advertsAPI.getSponsored({ placement: 'web_wall', platform: 'web', limit: 5 }),
    ])
      .then(([legacyRes, sponsoredRes]) => {
        const legacyRows = legacyRes.data?.data ?? legacyRes.data ?? [];
        const legacyList = Array.isArray(legacyRows) ? legacyRows : [];
        const sponsoredRows = sponsoredRes.data?.data ?? [];
        const sponsoredList = Array.isArray(sponsoredRows) ? sponsoredRows : [];
        const merged: FeedAd[] = [
          ...legacyList
            .filter((row: Parameters<typeof isBrokenLegacyAdvert>[0]) => !isBrokenLegacyAdvert(row))
            .map((row: Parameters<typeof legacyAdvertToFeedAd>[0]) => legacyAdvertToFeedAd(row)),
          ...sponsoredList.map((row: Parameters<typeof sponsoredAdToFeedAd>[0]) => sponsoredAdToFeedAd(row)),
        ];
        setFeedAds(merged);
      })
      .catch(() => setFeedAds([]));
  }, []);

  const loadMore = useCallback(() => {
    if (!hasMore || loadingMoreRef.current || loading) return;
    const nextPage = lastLoadedPageRef.current + 1;
    void loadFeed(nextPage, true);
  }, [hasMore, loading, loadFeed]);

  const maybeLoadMore = useCallback(() => {
    if (!hasMore || loadingMoreRef.current || loading) return;
    const container = containerRef.current;
    const sentinel = loadMoreSentinelRef.current;
    if (!sentinel) return;
    const root = feedScrollRoot(container);
    const rootRect = root
      ? root.getBoundingClientRect()
      : { top: 0, bottom: window.innerHeight };
    const sentinelRect = sentinel.getBoundingClientRect();
    if (sentinelRect.top <= rootRect.bottom + 320) {
      loadMore();
    }
  }, [hasMore, loading, loadMore]);

  useEffect(() => {
    maybeLoadMoreRef.current = maybeLoadMore;
  }, [maybeLoadMore]);

  useEffect(() => {
    const sentinel = loadMoreSentinelRef.current;
    const container = containerRef.current;
    if (!sentinel) return;
    const root = feedScrollRoot(container);
    const observer = new IntersectionObserver(
      (entries) => {
        const [e] = entries;
        if (e?.isIntersecting) maybeLoadMore();
      },
      { root, rootMargin: '320px', threshold: 0 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [maybeLoadMore, hasMore, gridItems.length]);

  useEffect(() => {
    const container = containerRef.current;
    const onContainerScroll = () => maybeLoadMore();
    container?.addEventListener('scroll', onContainerScroll, { passive: true });
    const onWindowScroll = () => maybeLoadMore();
    window.addEventListener('scroll', onWindowScroll, { passive: true });
    return () => {
      container?.removeEventListener('scroll', onContainerScroll);
      window.removeEventListener('scroll', onWindowScroll);
    };
  }, [maybeLoadMore]);

  // Keep fetching until the scroll area is filled or the feed is exhausted.
  useEffect(() => {
    if (loading || loadingMore || !hasMore) return;
    const container = containerRef.current;
    if (!container) return;
    const raf = requestAnimationFrame(() => {
      if (container.scrollHeight <= container.clientHeight + 160) {
        maybeLoadMore();
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [gridItems.length, loading, loadingMore, hasMore, maybeLoadMore]);

  const handleSetProfilePicFromUrl = async (url: string) => {
    if (!user?._id && !user?.id) return;
    try {
      const res = await usersAPI.setAvatarFromUrl(user._id || user.id!, url);
      toast.success('Profile picture updated');
      await refreshUser?.();
      dispatchAvatarUpdated({
        avatar: res.data?.avatar || url,
        feedPost: res.data?.feedPost as Record<string, unknown> | undefined,
      });
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

  /** Logo / home: same route as `/wall` would no-op with Next.js `<Link>` — scroll to top, clear filters, refresh feed. */
  const goWallHome = useCallback(() => {
    setSearchQ('');
    setPage(1);
    setHasMore(true);
    setLatestCreatedPost(null);
    router.replace('/wall');
    void loadFeed(1, false, { q: '' });
    loadFeaturedProducts();
    setStatusRefreshKey((k) => k + 1);
    requestAnimationFrame(() => {
      containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }, [router, loadFeed, loadFeaturedProducts]);

  // Intersperse sponsored adverts every 6 items between posts (same dimensions as posts)
  const insertAdvertsEvery = 6;
  // TV posts + QwertyHub product tiles merged by createdAt (newest first)
  const feedWithoutLatest = latestCreatedPost
    ? gridItems.filter((p) => p._id !== latestCreatedPost._id)
    : gridItems;
  const baseItems: TVGridItem[] = activeHashtag
    ? latestCreatedPost
      ? sortFeedNewestFirst([latestCreatedPost, ...feedWithoutLatest])
      : sortFeedNewestFirst(feedWithoutLatest)
    : mergeWallFeedWithTiles(feedWithoutLatest, productTiles, latestCreatedPost);
  const allItemsWithAds: (TVGridItem | (FeedAd & { type: 'advert' }))[] = [];
  if (activeHashtag) {
    allItemsWithAds.push(...baseItems);
  } else {
    baseItems.forEach((item, i) => {
      if (i > 0 && i % insertAdvertsEvery === 0 && feedAds.length > 0) {
        const ad = pickFeedAd(feedAds);
        if (ad) allItemsWithAds.push({ type: 'advert', ...ad });
      }
      allItemsWithAds.push(item);
    });
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-sky-50 via-blue-50 to-white text-slate-900">
      {/* Full-width frozen header - logo at top-left */}
      <header className="sticky top-0 z-40 w-full bg-white/95 backdrop-blur-md border-b border-slate-100 shadow-sm flex-shrink-0">
        <div className="px-3 sm:px-6 lg:px-8 py-2.5 sm:py-3">
          <div className="flex items-center gap-2 sm:gap-3 w-full">
            <div className="shrink-0 flex items-center gap-1 sm:gap-2">
              <button
                type="button"
                onClick={() => goWallHome()}
                className="shrink-0 flex items-center cursor-pointer rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
                aria-label="Home — scroll to top and refresh feed"
              >
                <img
                  src="/qwertymates-q-mark-official.png"
                  alt=""
                  width={48}
                  height={48}
                  className={APP_SHELL_MOBILE_LOGO_CLASS}
                  aria-hidden
                />
                <img src="/qwertymates-logo.png" alt="Qwertymates" className="h-8 w-auto max-w-[132px] sm:max-w-none object-contain hidden md:block" />
              </button>
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
                currentUserName={user ? userPublicDisplayName(user) : undefined}
              />
            </div>
            <div className="shrink-0 flex items-center gap-2">
              {/* Mobile-only: remove the top "Ask MacGyver" pill; keep it on desktop/web */}
              <SearchButton className="hidden md:flex" />
              <ProfileHeaderButton />
            </div>
          </div>
        </div>
      </header>

      {/* Menu (sidebar) + content below header */}
      <div className="flex min-h-0 min-w-0 w-full flex-1">
        <AppSidebar
          variant="wall"
          userName={user ? userPublicDisplayName(user) : undefined}
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
        <main className={`min-w-0 w-full flex-1 max-w-full lg:max-w-[calc(720px+4rem)] lg:w-[calc(720px+4rem)] pl-3 pr-3 sm:pl-6 sm:pr-3 md:pr-4 lg:pl-8 ${PAGE_PAD_BOTTOM_MOBILE_NAV} order-2 lg:order-none`}>
          {newPostsBanner > 0 && (
            <div className="sticky top-2 z-30 flex justify-center py-2 pointer-events-none">
              <button
                type="button"
                onClick={jumpToNewPosts}
                className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full bg-sky-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-sky-500/25 hover:bg-sky-600 transition-colors"
                aria-label={`${newPostsBanner} new posts — scroll to top`}
              >
                ↑ {newPostsBanner} new post{newPostsBanner !== 1 ? 's' : ''}
              </button>
            </div>
          )}
          {activeHashtag && (
            <div className="mx-auto mt-4 mb-2 w-full max-w-[720px] rounded-2xl border border-sky-100 bg-white/95 px-4 py-3 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-sky-600 flex items-center gap-1">
                    <Hash className="h-3 w-3" />
                    Hashtag topic
                  </p>
                  <h1 className="text-lg font-bold text-slate-900 break-words">#{activeHashtag}</h1>
                  {!loading && (
                    <p className="text-xs text-slate-500 mt-0.5">
                      {total} post{total !== 1 ? 's' : ''} in this topic
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => goWallHome()}
                  className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  aria-label="Clear hashtag filter"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setCreateOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-sky-500 px-3 py-2 text-sm font-medium text-white hover:bg-sky-600"
                >
                  <Plus className="h-4 w-4" />
                  Start topic with #{activeHashtag}
                </button>
                <Link
                  href={`/hashtag/${encodeURIComponent(activeHashtag)}`}
                  className="inline-flex items-center rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Explore creators
                </Link>
              </div>
            </div>
          )}
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
                  {(item as { type?: string }).type === 'advert' ? (
                    <AdvertTile {...(item as FeedAd & { type: 'advert' })} />
                  ) : (
                    <TVGridTileWithObserver
                      item={item as TVGridItem}
                      liked={likedMap[item._id]}
                      onLike={handleLike}
                      onRepost={(item as TVGridItem).type !== 'product_tile' ? handleRepost : undefined}
                      onEnquire={(item as TVGridItem).type === 'product_tile' ? undefined : handleEnquire}
                      onCommentAdded={(item as TVGridItem).type !== 'product_tile' ? handleCommentAdded : undefined}
                      onDelete={(id) => setGridItems((prev) => prev.filter((i) => (i as TVGridItem)._id !== id))}
                      onMediaUnavailable={(id) => {
                        setGridItems((prev) => prev.filter((i) => (i as TVGridItem)._id !== id));
                        requestAnimationFrame(() => maybeLoadMoreRef.current());
                      }}
                      onUpdated={(updated) =>
                        setGridItems((prev) =>
                          prev.map((i) => ((i as TVGridItem)._id === updated._id ? { ...(i as TVGridItem), ...updated } : i))
                        )
                      }
                      currentUserId={user?._id || user?.id}
                      onSetProfilePicFromUrl={handleSetProfilePicFromUrl}
                      onSetStripBackgroundFromUrl={handleSetStripBackgroundFromUrl}
                      cartQty={(() => {
                        const it = item as TVGridItem;
                        const pid =
                          it.type === 'product_tile'
                            ? String(it._id)
                            : it.productId
                              ? String((it.productId as { _id?: string })._id ?? it.productId)
                              : '';
                        return pid ? (cartQtyByProduct[pid] ?? 0) : 0;
                      })()}
                      onCartUpdated={handleCartUpdated}
                      loginHref={`/login?returnTo=${encodeURIComponent('/wall')}`}
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          {!loading && hasMore && (
            <div ref={loadMoreSentinelRef} className="flex justify-center py-8 min-h-[80px]">
              {loadingMore ? (
                <Loader2 className="h-8 w-8 text-sky-500 animate-spin" />
              ) : (
                <div className="h-4" aria-hidden />
              )}
            </div>
          )}
        </main>
        <AdvertSlot
          belowHeader
          trendingRefreshKey={trendingRefreshKey}
          activeHashtag={activeHashtag}
          onStartTopicWithHashtag={() => setCreateOpen(true)}
        />
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
            const uid = user?._id || user?.id;
            const creatorRaw = created.creatorId;
            const creatorIdStr =
              typeof creatorRaw === 'object' && creatorRaw && '_id' in creatorRaw
                ? String((creatorRaw as { _id: string })._id)
                : creatorRaw
                  ? String(creatorRaw)
                  : '';
            const enriched =
              user && uid && creatorIdStr === String(uid)
                ? {
                    ...created,
                    creatorId: normalizeClientUser({
                      ...(typeof creatorRaw === 'object' && creatorRaw ? creatorRaw : {}),
                      _id: uid,
                      username: (creatorRaw as { username?: string })?.username || user.username,
                      name: userPublicDisplayName(user),
                      email: user.email,
                      avatar: (creatorRaw as { avatar?: string })?.avatar || user.avatar,
                    }),
                  }
                : created;
            setLatestCreatedPost(enriched);
            setGridItems((prev) => [enriched, ...prev]);
          }
          setStatusRefreshKey((k) => k + 1);
          setTrendingRefreshKey((k) => k + 1);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('qwertymates:status-strip-refresh'));
          }
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
