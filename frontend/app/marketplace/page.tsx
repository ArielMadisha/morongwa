'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Package, ArrowRight, ShoppingBag, Store, Building2, HelpCircle } from 'lucide-react';
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
import { MarketplaceCartStepper } from '@/components/MarketplaceCartStepper';
import { formatCurrencyAmount } from '@/lib/formatCurrency';

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

function formatPriceLocal(price: number, currency: string) {
  return formatCurrencyAmount(price, currency || 'ZAR');
}

function authHref(path: string) {
  return `/register?returnTo=${encodeURIComponent(path)}`;
}

function MarketplacePageContent() {
  const { user, logout } = useAuth();
  const { formatPrice: formatInLocal } = useCurrency();
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
  const activeCategoryRef = useRef<string>('All');
  const lastLoadAtRef = useRef<number>(0);

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
        if (list.length === 0 && selectedCategory === 'All' && !append && !random) {
          const feat = await tvAPI.getFeaturedProducts();
          const raw = feat.data?.data ?? feat.data ?? [];
          list = Array.isArray(raw) ? raw : [];
        }
        const hasMore = Boolean(res.data?.hasMore ?? (list.length >= 30));
        setHasMoreProducts(hasMore);
        setPage(pageToLoad);
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
    setHasMoreProducts(true);
    void loadMarketplaceProducts({ page: 1, append: false, random: false });
  }, [selectedCategory, loadMarketplaceProducts]);

  const loadNextProducts = useCallback(async () => {
    if (loading || loadingMore) return;
    if (Date.now() < randomBackoffUntil) return;
    if (hasMoreProducts) {
      await loadMarketplaceProducts({ page: page + 1, append: true, random: false });
      return;
    }
    // Endless browsing: when exhausted in "All", keep appending random catalog items.
    if (activeCategoryRef.current === 'All') {
      await loadMarketplaceProducts({ append: true, random: true });
    }
  }, [hasMoreProducts, loadMarketplaceProducts, loading, loadingMore, page, randomBackoffUntil]);

  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first?.isIntersecting) {
          void loadNextProducts();
        }
      },
      { root: null, rootMargin: '500px 0px', threshold: 0.01 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [loadNextProducts]);

  useEffect(() => {
    productsAPI
      .listCategories()
      .then((res) => {
        const rows = Array.isArray(res.data?.data) ? res.data.data : [];
        setCategories(rows);
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
  const supplierLink = isGuest ? authHref('/supplier/apply') : '/supplier/apply';
  const storeLink = isGuest ? authHref('/store') : '/store';
  const supplierProductsLink = isGuest ? authHref('/supplier/products') : '/supplier/products';
  const homeLink = isGuest ? '/' : '/wall';

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-gradient-to-br from-sky-50 via-blue-50 to-white text-slate-900">
      <AppShellHeader
        homeHref={homeLink}
        showMenuButton={!isGuest}
        onMenuClick={isGuest ? undefined : () => setMenuOpen((v) => !v)}
        center={
          <div className="flex w-full min-w-0 items-center gap-2 sm:gap-3">
            <div className="h-8 w-8 shrink-0 rounded-lg bg-brand-50 flex items-center justify-center">
              <ShoppingBag className="h-4 w-4 text-brand-600" />
            </div>
            <h1 className="min-w-0 flex-1 font-semibold text-slate-900 text-base sm:text-lg break-words">
              QwertyHub
            </h1>
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
      />
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
        <div className="flex min-h-0 min-w-0 w-full flex-1 flex-col gap-0 overflow-y-auto overflow-x-hidden overscroll-contain lg:flex-row">
        <main className="order-2 box-border min-h-0 w-full min-w-0 max-w-full flex-1 px-3 sm:px-6 lg:px-8 py-5 sm:py-6 pb-24 lg:pb-6 lg:order-none">
        {isGuest && (
          <div className="mb-6 rounded-xl border border-blue-100 bg-blue-50/80 px-4 py-3 text-sm text-slate-700">
            Browse our gallery. <Link href="/register" className="font-medium text-brand-600 hover:text-brand-700">Sign up</Link> or <Link href="/login" className="font-medium text-brand-600 hover:text-brand-700">sign in</Link> to add to cart, checkout, or sell.
          </div>
        )}
        <p className="mb-8 w-full max-w-full text-left text-pretty text-base leading-relaxed text-slate-600 break-words">
          Products from verified suppliers. Buy or resell with delivery by runners.
        </p>
        <div className="mb-5 flex flex-wrap gap-2">
          {['All', ...categories.map((c) => c.name)].slice(0, 18).map((cat) => {
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
                      {p.currency === 'USD' ? (
                        p.discountPrice != null && p.discountPrice < p.price ? (
                          <p
                            className="truncate whitespace-nowrap text-xs font-bold tabular-nums text-sky-600 sm:text-sm"
                            title={`${formatInLocal(p.discountPrice)} · was ${formatInLocal(p.price)}`}
                          >
                            <span>{formatInLocal(p.discountPrice)}</span>
                            <span className="ml-1 text-[9px] font-normal text-slate-400 line-through sm:text-[10px]">
                              {formatInLocal(p.price)}
                            </span>
                          </p>
                        ) : (
                          <span
                            className="block truncate whitespace-nowrap text-xs font-bold leading-none text-sky-600 tabular-nums sm:text-sm"
                            title={formatInLocal(p.price)}
                          >
                            {formatInLocal(p.price)}
                          </span>
                        )
                      ) : p.discountPrice != null && p.discountPrice < p.price ? (
                        <p
                          className="truncate whitespace-nowrap text-xs font-bold tabular-nums text-sky-600 sm:text-sm"
                          title={`${formatPriceLocal(p.discountPrice, p.currency)} · was ${formatPriceLocal(p.price, p.currency)}`}
                        >
                          <span>{formatPriceLocal(p.discountPrice, p.currency)}</span>
                          <span className="ml-1 text-[9px] font-normal text-slate-400 line-through sm:text-[10px]">
                            {formatPriceLocal(p.price, p.currency)}
                          </span>
                        </p>
                      ) : (
                        <span
                          className="block truncate whitespace-nowrap text-xs font-bold leading-none text-sky-600 tabular-nums sm:text-sm"
                          title={formatPriceLocal(p.price, p.currency)}
                        >
                          {formatPriceLocal(p.price, p.currency)}
                        </span>
                      )}
                    </div>
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
              const cartHref = `/marketplace/product/${p?._id}${resellerId ? `?resellerId=${resellerId}` : ''}`;
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
                        title={
                          p?.currency === 'USD'
                            ? formatInLocal(displayPrice)
                            : formatPriceLocal(displayPrice, p?.currency || 'ZAR')
                        }
                      >
                        {p?.currency === 'USD'
                          ? formatInLocal(displayPrice)
                          : formatPriceLocal(displayPrice, p?.currency || 'ZAR')}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div ref={loadMoreRef} className="h-8 w-full" />
        {(loadingMore || (selectedCategory === 'All' && !hasMoreProducts)) && (
          <p className="mt-3 text-center text-xs text-slate-500">
            {loadingMore ? 'Loading more products...' : 'Showing more products...'}
          </p>
        )}
        {!loadingMore && randomBackoffUntil > Date.now() && selectedCategory === 'All' && (
          <p className="mt-2 text-center text-xs text-amber-600">
            Too many requests detected. Auto-loading will resume shortly.
          </p>
        )}

        <div className="mt-12 rounded-2xl border border-slate-200 bg-white/90 p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Sell on Qwertymates</h2>
          <div className="grid sm:grid-cols-2 gap-6">
            <div className="rounded-xl border border-sky-100 bg-sky-50/50 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Store className="h-5 w-5 text-sky-600" />
                <span className="font-semibold text-slate-800">Reseller (no verification)</span>
              </div>
              <p className="text-sm text-slate-600 mb-3">Add products to MyStore and get a store automatically. Rename your store anytime.</p>
              <ol className="text-sm text-slate-700 space-y-1 list-decimal list-inside mb-4">
                <li>Click <strong>Add to MyStore</strong> on a product</li>
                <li>Your store is created; go to <Link href={storeLink} className="text-sky-600 hover:underline">My store</Link> to rename it</li>
                <li>Share your wall link so others can buy from you</li>
              </ol>
              <Link href={storeLink} className="text-sm font-medium text-sky-600 hover:underline">My store →</Link>
            </div>
            <div className="rounded-xl border border-sky-100 bg-sky-50/50 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Building2 className="h-5 w-5 text-sky-600" />
                <span className="font-semibold text-slate-800">Supplier (verified)</span>
              </div>
              <p className="text-sm text-slate-600 mb-3">List your own products. Apply once, get verified, then add as many products as you like.</p>
              <ol className="text-sm text-slate-700 space-y-1 list-decimal list-inside mb-4">
                <li><Link href={supplierLink} className="text-sky-600 hover:underline">Become a supplier</Link> and submit your details</li>
                <li>Admin approves; you get a supplier store</li>
                <li>Use <Link href={supplierProductsLink} className="text-sky-600 hover:underline">Add product</Link> to list items</li>
              </ol>
              <Link href={supplierLink} className="text-sm font-medium text-sky-600 hover:underline">Become a supplier →</Link>
            </div>
          </div>
          <p className="mt-6 text-center text-sm text-slate-500">
            Need help? <Link href="/support?category=products:marketplace" className="text-sky-600 hover:underline">Contact support</Link>
          </p>
        </div>
      </main>
        <AdvertSlot belowHeader />
        </div>
      </div>
      {!isGuest && <MobileBottomNav cartCount={cartCount} hasStore={hasStore} />}
    </div>
  );
}

export default function MarketplacePage() {
  return <MarketplacePageContent />;
}
