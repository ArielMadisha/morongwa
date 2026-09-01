'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Package, ArrowRight, HelpCircle } from 'lucide-react';
import { productsAPI, tvAPI, cartAPI, getImageUrl, getEffectivePrice } from '@/lib/api';
import type { Product } from '@/lib/types';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useCartAndStores } from '@/lib/useCartAndStores';
import { AppSidebar } from '@/components/AppSidebar';
import { AppShellHeader } from '@/components/AppShellHeader';
import { ProfileHeaderButton } from '@/components/ProfileHeaderButton';
import { AdvertSlot } from '@/components/AdvertSlot';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import {
  CollapsibleBottomChrome,
  CollapsibleChrome,
  ScrollAwareChromeRoot,
} from '@/components/ScrollAwareAppShell';
import { mergeScrollAwareRef } from '@/hooks/useScrollAwareChrome';
import { MarketplaceCartStepper } from '@/components/MarketplaceCartStepper';
import { formatCatalogProductPrice } from '@/lib/productPriceZar';
import { WebAdPlacement } from '@/components/WebAdPlacement';
import { FREE_DELIVERY_PROMO_LABEL, productShowsFreeDeliveryPromo } from '@/lib/freeShippingAreas';
import { QwertyHubSectionNav } from '@/components/marketplace/QwertyHubSectionNav';

function productQtyMapFromCartResponse(res: { data?: { data?: { items?: unknown[] } } }): Record<string, number> {
  const items = Array.isArray(res.data?.data?.items) ? res.data!.data!.items! : [];
  const m: Record<string, number> = {};
  for (const it of items) {
    const row = it as {
      type?: string;
      songId?: unknown;
      productId?: { _id?: string } | string;
      product?: { _id?: string };
      qty?: number;
    };
    if (row.type === 'music' || row.songId) continue;
    const pid = String(row.product?._id ?? (row.productId as { _id?: string } | undefined)?._id ?? row.productId ?? '');
    if (!pid) continue;
    m[pid] = Number(row.qty ?? 0);
  }
  return m;
}

function MarketplacePageContent() {
  const { user, logout } = useAuth();
  const { rates } = useCurrency();
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Array<{ name: string; count: number }>>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [resoldProducts, setResoldProducts] = useState<Array<{ _id: string; productId: any; creatorId?: { _id: string; name?: string }; caption?: string; resellerCommissionPct?: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMoreProducts, setHasMoreProducts] = useState(true);
  const [randomBackoffUntil, setRandomBackoffUntil] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [cartQtyByProduct, setCartQtyByProduct] = useState<Record<string, number>>({});
  const { cartCount, hasStore, invalidate } = useCartAndStores(!!user);

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
    invalidate();
    refreshCartQty();
  }, [invalidate, refreshCartQty]);

  useEffect(() => {
    refreshCartQty();
  }, [refreshCartQty]);

  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const categoryRowRef = useRef<HTMLDivElement | null>(null);
  const categoryScrollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeCategoryRef = useRef<string>('All');
  const stopCategoryAutoScroll = useCallback(() => {
    if (categoryScrollTimerRef.current) {
      clearInterval(categoryScrollTimerRef.current);
      categoryScrollTimerRef.current = null;
    }
  }, []);

  const startCategoryAutoScroll = useCallback((direction: 'left' | 'right') => {
    stopCategoryAutoScroll();
    categoryScrollTimerRef.current = setInterval(() => {
      const node = categoryRowRef.current;
      if (!node) return;
      const delta = direction === 'right' ? 24 : -24;
      node.scrollBy({ left: delta, behavior: 'auto' });
    }, 32);
  }, [stopCategoryAutoScroll]);

  useEffect(() => {
    return () => stopCategoryAutoScroll();
  }, [stopCategoryAutoScroll]);

  const lastLoadAtRef = useRef<number>(0);
  const pageRef = useRef<number>(1);

  const loadMarketplaceProducts = useCallback(
    async (opts?: { page?: number; append?: boolean; random?: boolean }) => {
      const pageToLoad = opts?.page ?? 1;
      const append = !!opts?.append;
      const random = !!opts?.random;
      const now = Date.now();
      // Prevent tight-loop load storms when sentinel stays in view.
      const minGapMs = random ? 1800 : 450;
      if (append && now - lastLoadAtRef.current < minGapMs) return;
      lastLoadAtRef.current = now;
      if (append) setLoadingMore(true);
      else setLoading(true);
      try {
        const res = await productsAPI.list({
          limit: 30,
          page: random ? 1 : pageToLoad,
          random,
          category: selectedCategory !== 'All' ? selectedCategory : undefined,
        });
        let list = res.data?.data ?? res.data ?? [];
        if (!Array.isArray(list)) list = [];
        let hasMore = Boolean(res.data?.hasMore ?? (list.length >= 30));

        // Never show empty catalog for category views: fallback to general catalog.
        if (list.length === 0 && selectedCategory !== 'All' && !append && !random) {
          const fallback = await productsAPI.list({ limit: 30, page: 1, random: false });
          const fallbackList = fallback.data?.data ?? fallback.data ?? [];
          list = Array.isArray(fallbackList) ? fallbackList : [];
          hasMore = Boolean(fallback.data?.hasMore ?? (list.length >= 30));
        }

        if (list.length === 0 && selectedCategory === 'All' && !append && !random) {
          const feat = await tvAPI.getFeaturedProducts();
          const raw = feat.data?.data ?? feat.data ?? [];
          list = Array.isArray(raw) ? raw : [];
          hasMore = false;
        }
        setHasMoreProducts(hasMore);
        setPage(pageToLoad);
        pageRef.current = pageToLoad;
        if (append) {
          setProducts((prev) => [...prev, ...list]);
        } else {
          setProducts(list);
        }
      } catch (err: any) {
        if (random && Number(err?.response?.status) === 429) {
          // Pause continuous random loading briefly when backend rate-limit responds.
          setRandomBackoffUntil(Date.now() + 30_000);
        }
        if (!append) setProducts([]);
        setHasMoreProducts(false);
      } finally {
        if (append) setLoadingMore(false);
        else setLoading(false);
      }
    },
    [selectedCategory]
  );

  useEffect(() => {
    activeCategoryRef.current = selectedCategory;
    setProducts([]);
    setPage(1);
    pageRef.current = 1;
    setHasMoreProducts(true);
    void loadMarketplaceProducts({ page: 1, append: false, random: false });
  }, [selectedCategory, loadMarketplaceProducts]);

  const loadNextProducts = useCallback(async () => {
    if (loading || loadingMore) return;
    if (Date.now() < randomBackoffUntil) return;
    if (hasMoreProducts) {
      const nextPage = pageRef.current + 1;
      await loadMarketplaceProducts({ page: nextPage, append: true, random: false });
      return;
    }
    // Endless browsing: when exhausted in "All", keep appending random catalog items.
    if (activeCategoryRef.current === 'All') {
      await loadMarketplaceProducts({ append: true, random: true });
    }
  }, [hasMoreProducts, loadMarketplaceProducts, loading, loadingMore, randomBackoffUntil]);

  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node) return;
    const rootNode = scrollContainerRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first?.isIntersecting) {
          void loadNextProducts();
        }
      },
      { root: rootNode, rootMargin: '500px 0px', threshold: 0.01 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [loadNextProducts]);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const onScroll = () => {
      // Fallback for cases where intersection events are missed in nested scroll containers.
      const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (remaining < 900) {
        void loadNextProducts();
      }
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener('scroll', onScroll);
  }, [loadNextProducts]);

  useEffect(() => {
    productsAPI
      .listCategories()
      .then((res) => {
        const rows = Array.isArray(res.data?.data) ? res.data.data : [];
        const foodLike = new Set([
          'food & restaurant',
          'kota / bunny chow',
          'extras',
        ]);
        setCategories(
          rows.filter((r: { name?: string }) => !foodLike.has(String(r?.name || '').trim().toLowerCase()))
        );
      })
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    tvAPI
      .getFeed({ type: 'product', limit: 24, sort: 'newest' })
      .then((res) => {
        const posts = res.data?.data ?? res.data ?? [];
        const valid = (Array.isArray(posts) ? posts : []).filter(
          (p: any) => p?.productId?._id && p?.creatorId?._id
        );
        setResoldProducts(valid);
      })
      .catch(() => setResoldProducts([]));
  }, []);

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  const isGuest = !user;
  const marketplaceLoginHref = `/login?returnTo=${encodeURIComponent('/marketplace')}`;
  const homeLink = isGuest ? '/' : '/wall';

  return (
    <ScrollAwareChromeRoot>
      {(attachScroll) => (
    <div className="h-screen flex flex-col overflow-hidden bg-gradient-to-br from-sky-50 via-blue-50 to-white text-slate-900">
      <CollapsibleChrome edge="top">
      <AppShellHeader
        homeHref={homeLink}
        showMenuButton={!isGuest}
        onMenuClick={isGuest ? undefined : () => setMenuOpen((v) => !v)}
        center={
          <div className="flex w-full min-w-0 items-center justify-end gap-2 sm:gap-3">
            {isGuest ? (
              <Link
                href="/support"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-sky-600 shadow-sm transition-colors hover:bg-sky-50"
                title="Help & support"
                aria-label="Help and support"
              >
                <HelpCircle className="h-5 w-5" />
              </Link>
            ) : (
              <ProfileHeaderButton className="shrink-0" />
            )}
          </div>
        }
        actions={
          isGuest ? (
            <>
              <Link href="/login" className="shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
                Sign in
              </Link>
              <Link href="/register" className="shrink-0 rounded-lg bg-brand-500 px-2.5 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-semibold text-white hover:bg-brand-600 transition-colors">
                Register
              </Link>
            </>
          ) : null
        }
        bottom={<QwertyHubSectionNav active="hub" />}
      />
      </CollapsibleChrome>
      {/* min-w-0 + w-full: required so flex row beside AppSidebar does not collapse main to a narrow strip on mobile */}
      <div className="flex min-h-0 min-w-0 w-full flex-1 overflow-hidden">
        {!isGuest && (
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
        <div
          ref={mergeScrollAwareRef(attachScroll, scrollContainerRef)}
          className="flex min-h-0 min-w-0 w-full flex-1 flex-col gap-0 overflow-y-auto overflow-x-hidden overscroll-contain lg:flex-row"
        >
        <main className="order-2 box-border min-h-0 w-full min-w-0 max-w-full flex-1 px-3 sm:px-6 lg:px-8 py-5 sm:py-6 pb-24 md:pb-6 lg:order-none">
        {isGuest && (
          <div className="mb-6 rounded-xl border border-blue-100 bg-blue-50/80 px-4 py-3 text-sm text-slate-700">
            Browse our gallery. <Link href="/register" className="font-medium text-brand-600 hover:text-brand-700">Sign up</Link> or <Link href="/login" className="font-medium text-brand-600 hover:text-brand-700">sign in</Link> to add to cart, checkout, or sell.
          </div>
        )}
        <p className="mb-6 w-full max-w-full text-left text-pretty text-base leading-relaxed text-slate-600 break-words">
          Products from verified suppliers. Buy or resell with delivery by runners.
        </p>
        <WebAdPlacement placement="marketplace_top_row" audience="shopper" variant="banner" className="mb-4" />
        <div className="relative mb-5">
          <div
            onMouseEnter={() => startCategoryAutoScroll('left')}
            onMouseLeave={stopCategoryAutoScroll}
            className="absolute left-0 top-1/2 z-10 -translate-y-1/2 rounded-full border border-slate-200 bg-white/90 px-2 py-1 text-xs text-slate-600 shadow-sm cursor-ew-resize select-none"
            title="Hover to scroll left"
          >
            ◀
          </div>
          <div
            onMouseEnter={() => startCategoryAutoScroll('right')}
            onMouseLeave={stopCategoryAutoScroll}
            className="absolute right-0 top-1/2 z-10 -translate-y-1/2 rounded-full border border-slate-200 bg-white/90 px-2 py-1 text-xs text-slate-600 shadow-sm cursor-ew-resize select-none"
            title="Hover to scroll right"
          >
            ▶
          </div>
          <div
            ref={categoryRowRef}
            className="mx-9 flex flex-nowrap gap-2 overflow-x-auto whitespace-nowrap scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
          {['All', ...categories.map((c) => c.name).filter((name) => String(name || '').trim().toLowerCase() !== 'local')].map((cat) => {
            const active = selectedCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  active
                    ? 'border-sky-300 bg-sky-100 text-sky-800'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-sky-200 hover:text-sky-700'
                }`}
              >
                {cat}
              </button>
            );
          })}
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-4 lg:grid-cols-2 lg:gap-5 xl:grid-cols-3 xl:gap-5">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="bg-white/80 rounded-2xl border border-slate-100 p-6 animate-pulse">
                <div className="mb-3 h-40 rounded-xl bg-slate-200 sm:h-44 lg:h-48" />
                <div className="h-5 bg-slate-200 rounded w-3/4 mb-2" />
                <div className="h-5 bg-slate-200 rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : products.length === 0 && resoldProducts.length === 0 ? (
          <div className="bg-white/90 backdrop-blur rounded-2xl border border-slate-100 p-12 text-center">
            <Package className="h-16 w-16 text-slate-300 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-slate-700 mb-2">No products yet</h2>
            <p className="text-slate-600 mb-6">Suppliers will list products here soon. Check back or post a task in the meantime.</p>
            <Link
              href={homeLink}
              className="inline-flex items-center gap-2 text-sky-600 hover:text-sky-700 font-medium"
            >
              Back to home
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-4 lg:grid-cols-2 lg:gap-5 xl:grid-cols-3 xl:gap-5">
            {/* Supplier / imported catalog first (newest via API), then reseller posts from feed */}
            {products.map((p, idx) => {
              const outOfStock = (p as any).outOfStock || (p.stock != null && p.stock < 1);
              const allowResell = (p as any).allowResell ?? false;
              const cartHref = `/marketplace/product/${p._id}`;
              const resellHref = `/marketplace/product/${p._id}?view=resell`;
              return (
                <div
                  key={`${p._id}-${idx}`}
                  className="group relative flex flex-col bg-white/90 backdrop-blur rounded-2xl border border-slate-100 overflow-hidden shadow-sm hover:shadow-lg hover:border-sky-200 transition-all"
                >
                  <div className="relative h-40 w-full shrink-0 overflow-hidden bg-slate-100 sm:h-44 lg:h-48">
                    <Link href={cartHref} className="absolute inset-0 z-0 block bg-slate-100" aria-label={p.title}>
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-100">
                        <Package className="h-12 w-12 text-slate-300 sm:h-14 sm:w-14" />
                      </div>
                      {p.images?.[0] ? (
                        <img
                          src={getImageUrl(p.images[0])}
                          alt={p.title}
                          className="relative z-10 h-full w-full object-cover"
                          loading="lazy"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      ) : null}
                    </Link>
                    {allowResell && (
                      <Link
                        href={resellHref}
                        onClick={(e) => e.stopPropagation()}
                        className="absolute left-2 top-2 z-10 inline-flex items-center rounded-md bg-white/95 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-sky-800 shadow-md ring-1 ring-slate-200/90 hover:bg-white sm:left-2.5 sm:top-2.5 sm:text-xs"
                        title="Resell – add markup"
                      >
                        Resell
                      </Link>
                    )}
                    <div className="absolute right-2 top-2 z-20">
                      <MarketplaceCartStepper
                        productId={p._id}
                        qty={cartQtyByProduct[String(p._id)] ?? 0}
                        colorsRequired={Array.isArray((p as { colors?: unknown[] }).colors) && (p as { colors: unknown[] }).colors.length > 0}
                        outOfStock={outOfStock}
                        isGuest={isGuest}
                        loginHref={marketplaceLoginHref}
                        onUpdated={handleCartUpdated}
                        compact
                      />
                    </div>
                    {outOfStock && (
                      <span className="absolute bottom-2 left-2 z-10 rounded px-2 py-0.5 text-[10px] font-medium text-amber-800 sm:text-xs bg-amber-100/95 shadow-sm">
                        Out of stock
                      </span>
                    )}
                  </div>
                  <Link href={cartHref} className="block min-w-0 px-3 pt-2 sm:px-4">
                    <h3 className="truncate text-sm font-semibold text-slate-900 group-hover:text-sky-700 sm:text-base">
                      {p.title}
                    </h3>
                  </Link>
                  <div className="mt-auto px-3 pb-3 pt-1.5 sm:px-4 sm:pb-3">
                    <div className="min-w-0 overflow-hidden">
                      {p.discountPrice != null && p.discountPrice < p.price ? (
                        <p
                          className="truncate whitespace-nowrap text-xs font-bold tabular-nums text-sky-600 sm:text-sm"
                          title={`${formatCatalogProductPrice(p.discountPrice, p.currency, rates)} · was ${formatCatalogProductPrice(p.price, p.currency, rates)}`}
                        >
                          <span>{formatCatalogProductPrice(p.discountPrice, p.currency, rates)}</span>
                          <span className="ml-1 text-[9px] font-normal text-slate-400 line-through sm:text-[10px]">
                            {formatCatalogProductPrice(p.price, p.currency, rates)}
                          </span>
                        </p>
                      ) : (
                        <span
                          className="block truncate whitespace-nowrap text-xs font-bold leading-none text-sky-600 tabular-nums sm:text-sm"
                          title={formatCatalogProductPrice(getEffectivePrice(p), p.currency, rates)}
                        >
                          {formatCatalogProductPrice(getEffectivePrice(p), p.currency, rates)}
                        </span>
                      )}
                    </div>
                    {productShowsFreeDeliveryPromo(p) ? (
                      <p className="text-[11px] font-semibold text-sky-600 mt-1">{FREE_DELIVERY_PROMO_LABEL}</p>
                    ) : null}
                  </div>
                  {p.ratingAvg != null && (
                    <p className="text-xs text-slate-500 px-3 pb-2 sm:px-4 sm:text-sm">
                      {p.ratingAvg.toFixed(1)}★
                      {p.ratingCount != null && p.ratingCount > 0 && ` (${p.ratingCount})`}
                    </p>
                  )}
                </div>
              );
            })}
            {resoldProducts.map((post) => {
              const p = post.productId;
              const resellerId = post.creatorId?._id;
              let displayPrice = getEffectivePrice({ price: p?.price ?? 0, discountPrice: p?.discountPrice });
              const resellerPct = post.resellerCommissionPct;
              if (resellerPct != null) {
                displayPrice = Math.round(displayPrice * (1 + resellerPct / 100) * 100) / 100;
              }
              const cartHref = `/marketplace/product/${p?._id}${resellerId ? `?resellerId=${resellerId}${resellerPct != null ? `&resellerCommissionPct=${resellerPct}` : ''}` : ''}`;
              return (
                <div
                  key={`resold-${post._id}-${p?._id}`}
                  className="group relative flex flex-col bg-white/90 backdrop-blur rounded-2xl border border-slate-100 overflow-hidden shadow-sm hover:shadow-lg hover:border-sky-200 transition-all"
                >
                  <div className="relative h-40 w-full shrink-0 overflow-hidden bg-slate-100 sm:h-44 lg:h-48">
                    <Link href={cartHref} className="absolute inset-0 z-0 block bg-slate-100" aria-label={p?.title || 'Product'}>
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-100">
                        <Package className="h-12 w-12 text-slate-300 sm:h-14 sm:w-14" />
                      </div>
                      {p?.images?.[0] ? (
                        <img
                          src={getImageUrl(p.images[0])}
                          alt={p?.title || ''}
                          className="relative z-10 h-full w-full object-cover"
                          loading="lazy"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      ) : null}
                    </Link>
                    {p?._id && (
                      <div className="absolute right-2 top-2 z-20">
                        <MarketplaceCartStepper
                          productId={String(p._id)}
                          resellerId={resellerId ? String(resellerId) : undefined}
                          qty={cartQtyByProduct[String(p._id)] ?? 0}
                          colorsRequired={Array.isArray((p as { colors?: unknown[] }).colors) && (p as { colors: unknown[] }).colors.length > 0}
                          outOfStock={!!(p as any)?.outOfStock || (p?.stock != null && p.stock < 1)}
                          isGuest={isGuest}
                          loginHref={marketplaceLoginHref}
                          onUpdated={handleCartUpdated}
                          compact
                        />
                      </div>
                    )}
                  </div>
                  <Link href={cartHref} className="block min-w-0 px-3 pt-2 sm:px-4">
                    <h3 className="truncate text-sm font-semibold text-slate-900 group-hover:text-sky-700 sm:text-base">
                      {p?.title || post.caption}
                    </h3>
                  </Link>
                  <div className="mt-auto px-3 pb-3 pt-1.5 sm:px-4 sm:pb-3">
                    <div className="min-w-0 overflow-hidden">
                      <span
                        className="block truncate whitespace-nowrap text-xs font-bold leading-none text-sky-600 tabular-nums sm:text-sm"
                        title={formatCatalogProductPrice(displayPrice, p?.currency, rates)}
                      >
                        {formatCatalogProductPrice(displayPrice, p?.currency, rates)}
                      </span>
                    </div>
                    {productShowsFreeDeliveryPromo(p) ? (
                      <p className="text-[11px] font-semibold text-sky-600 mt-1">{FREE_DELIVERY_PROMO_LABEL}</p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div ref={loadMoreRef} className="h-8 w-full" />
        {loadingMore && (
          <p className="mt-3 text-center text-xs text-slate-500">
            Loading more products...
          </p>
        )}
        {!loadingMore && randomBackoffUntil > Date.now() && selectedCategory === 'All' && (
          <p className="mt-2 text-center text-xs text-amber-600">
            Too many requests detected. Auto-loading will resume shortly.
          </p>
        )}
        <div className="mt-4">
          <WebAdPlacement placement="marketplace_inline" audience="shopper" variant="offer" />
        </div>

      </main>
        <AdvertSlot belowHeader />
        </div>
      </div>
      {!isGuest && (
        <CollapsibleBottomChrome>
          <MobileBottomNav cartCount={cartCount} hasStore={hasStore} embedded />
        </CollapsibleBottomChrome>
      )}
    </div>
      )}
    </ScrollAwareChromeRoot>
  );
}

export default function MarketplacePage() {
  return <MarketplacePageContent />;
}
