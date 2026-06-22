'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Package, ArrowLeft, Loader2 } from 'lucide-react';
import { storesAPI, cartAPI, getImageUrl, getEffectivePrice } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { AppSidebar, AppSidebarMenuButton } from '@/components/AppSidebar';
import { SearchButton } from '@/components/SearchButton';
import { ProfileHeaderButton } from '@/components/ProfileHeaderButton';
import { useCartAndStores } from '@/lib/useCartAndStores';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import StoreHeader from '@/components/StoreHeader';
import { StorefrontProductCard } from '@/components/StorefrontProductCard';
import { formatCatalogProductPrice } from '@/lib/productPriceZar';
import { useCurrency } from '@/contexts/CurrencyContext';

interface StoreProduct {
  _id: string;
  title: string;
  slug: string;
  images: string[];
  price: number;
  currency: string;
  discountPrice?: number;
  allowResell?: boolean;
  stock?: number;
  outOfStock?: boolean;
}

interface WallProduct {
  productId: string;
  product: StoreProduct;
  resellerCommissionPct?: number;
}

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

export default function PublicStorePage() {
  const params = useParams();
  const slug = params.slug as string;
  const { user, logout } = useAuth();
  const { cartCount, hasStore, invalidate } = useCartAndStores(!!user);
  const [menuOpen, setMenuOpen] = useState(false);
  const [store, setStore] = useState<any>(null);
  const [wallProducts, setWallProducts] = useState<WallProduct[]>([]);
  const [storeType, setStoreType] = useState<'supplier' | 'reseller'>('reseller');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cartQtyByProduct, setCartQtyByProduct] = useState<Record<string, number>>({});
  const { rates } = useCurrency();

  const storeLoginHref = `/login?returnTo=${encodeURIComponent(typeof window !== 'undefined' ? window.location.pathname : `/store/${slug}`)}`;

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

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    Promise.all([storesAPI.getBySlug(slug), storesAPI.getProductsBySlug(slug)])
      .then(([storeRes, productsRes]) => {
        const s = storeRes.data?.data ?? storeRes.data;
        setStore(s);
        const payload = productsRes.data?.data ?? productsRes.data;
        const products = payload?.products ?? [];
        setStoreType(payload?.storeType === 'supplier' ? 'supplier' : 'reseller');
        setWallProducts(Array.isArray(products) ? products : []);
      })
      .catch(() => {
        setError('Store not found');
        setStore(null);
        setWallProducts([]);
      })
      .finally(() => setLoading(false));
  }, [slug]);

  const handleLogout = () => {
    logout();
    window.location.href = '/';
  };

  const storeOwnerName = store?.userId?.name ?? 'Store owner';
  const validWallProducts = wallProducts.filter((wp) => wp.product);
  const isGuest = !user;

  const formatStorePrice = (amount: number, sourceCurrency: string) =>
    formatCatalogProductPrice(amount, sourceCurrency || 'ZAR', rates);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-sky-50 via-blue-50 to-white">
        <Loader2 className="h-10 w-10 animate-spin text-brand-600" />
        <p className="mt-4 text-slate-600">Loading store…</p>
      </div>
    );
  }

  if (error || !store) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-sky-50 via-blue-50 to-white px-4">
        <Package className="h-16 w-16 text-slate-300 mb-4" />
        <h1 className="text-xl font-semibold text-slate-800">Store not found</h1>
        <p className="text-slate-600 mt-2 text-center">This store may have been removed or the link is incorrect.</p>
        <Link href="/marketplace" className="mt-6 text-brand-600 hover:text-brand-700 font-medium">
          Browse QwertyHub →
        </Link>
      </div>
    );
  }

  const resellerId = store.userId?._id ?? store.userId;

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-sky-50 via-blue-50 to-white text-slate-900">
      <header className="sticky top-0 z-40 w-full bg-white/95 backdrop-blur-md border-b border-slate-100 shadow-sm flex-shrink-0">
        <div className="px-4 sm:px-6 lg:px-8 py-3 sm:py-4">
          <div className="flex items-center justify-between gap-3 sm:gap-4 min-w-0">
            <Link href="/marketplace" className="shrink-0 flex items-center gap-2 text-slate-700 hover:text-sky-600" aria-label="Back">
              <ArrowLeft className="h-5 w-5" />
              <span className="hidden sm:inline">QwertyHub</span>
            </Link>
            {user && <AppSidebarMenuButton onClick={() => setMenuOpen((v) => !v)} />}
            <div className="flex-1 min-w-0" />
            <div className="flex items-center gap-2 shrink-0">
              <SearchButton />
              {user && <ProfileHeaderButton />}
            </div>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 min-w-0 w-full flex-1">
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
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <StoreHeader
            title={store.name}
            address={store.address || '—'}
            phone={store.cellphone || store.whatsapp || '—'}
            email={store.email || '—'}
            storeSlug={store.slug}
          />
          <main className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-8 pb-24 lg:pb-8">
            <div className="max-w-6xl mx-auto">
              <p className="text-sm text-slate-600 mb-6">
                {storeType === 'supplier' ? `Products from ${store.name}` : `Products from ${storeOwnerName}`}
              </p>
              {validWallProducts.length > 0 ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {validWallProducts.map((wp) => {
                    const p = wp.product;
                    const markup = storeType === 'supplier' ? 0 : (wp.resellerCommissionPct ?? 5);
                    const basePrice = getEffectivePrice(p);
                    const displayPrice =
                      storeType === 'supplier'
                        ? basePrice
                        : Math.round(basePrice * (1 + markup / 100) * 100) / 100;
                    const productHref =
                      storeType === 'reseller' && resellerId
                        ? `/marketplace/product/${p._id}?resellerId=${resellerId}&resellerCommissionPct=${markup}`
                        : `/marketplace/product/${p._id}`;
                    const outOfStock = !!p.outOfStock || (p.stock != null && p.stock < 1);
                    return (
                      <StorefrontProductCard
                        key={wp.productId}
                        productId={String(p._id)}
                        title={p.title}
                        image={p.images?.[0]}
                        priceLabel={formatStorePrice(displayPrice, p.currency || 'ZAR')}
                        productHref={productHref}
                        resellHref={p.allowResell ? `/marketplace/product/${p._id}?view=resell` : undefined}
                        allowResell={!!p.allowResell && storeType === 'supplier'}
                        outOfStock={outOfStock}
                        resellerId={storeType === 'reseller' && resellerId ? String(resellerId) : undefined}
                        cartQty={cartQtyByProduct[String(p._id)] ?? 0}
                        isGuest={isGuest}
                        loginHref={storeLoginHref}
                        onCartUpdated={handleCartUpdated}
                        colorsRequired={Array.isArray((p as { colors?: unknown[] }).colors) && (p as { colors: unknown[] }).colors.length > 0}
                      />
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-xl border-2 border-dashed border-slate-200 bg-white/70 backdrop-blur-sm p-12 text-center">
                  <Package className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-600">No products in this store yet.</p>
                  <Link href="/marketplace" className="inline-block mt-4 text-brand-600 hover:text-brand-700 font-medium">
                    Browse QwertyHub →
                  </Link>
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
      {user && <MobileBottomNav cartCount={cartCount} hasStore={hasStore} />}
    </div>
  );
}
