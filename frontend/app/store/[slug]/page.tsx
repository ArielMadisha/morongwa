'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Package, ArrowLeft, Store, Loader2 } from 'lucide-react';
import { storesAPI, resellerAPI, getImageUrl, getEffectivePrice } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { AppSidebar, AppSidebarMenuButton } from '@/components/AppSidebar';
import { SearchButton } from '@/components/SearchButton';
import { ProfileHeaderButton } from '@/components/ProfileHeaderButton';
import { useCartAndStores } from '@/lib/useCartAndStores';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import StoreHeader from '@/components/StoreHeader';
import { formatCurrencyAmount } from '@/lib/formatCurrency';
import { useCurrency } from '@/contexts/CurrencyContext';

interface WallProduct {
  productId: string;
  product: { _id: string; title: string; slug: string; images: string[]; price: number; currency: string; discountPrice?: number };
  resellerCommissionPct?: number;
}

export default function PublicStorePage() {
  const params = useParams();
  const slug = params.slug as string;
  const { user, logout } = useAuth();
  const { cartCount, hasStore } = useCartAndStores(!!user);
  const [menuOpen, setMenuOpen] = useState(false);
  const [store, setStore] = useState<any>(null);
  const [wallProducts, setWallProducts] = useState<WallProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { currency: localCurrency, rates } = useCurrency();

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    storesAPI
      .getBySlug(slug)
      .then((res) => {
        const s = res.data?.data ?? res.data;
        setStore(s);
        const ownerId =
          s?.userId && typeof s.userId === 'object'
            ? (s.userId as { _id?: string })._id
            : s?.userId;
        if (ownerId) {
          return resellerAPI.getWall(String(ownerId)).then((w) => {
            const products = (w.data?.data ?? w.data)?.products ?? [];
            setWallProducts(Array.isArray(products) ? products : []);
          });
        }
        setWallProducts([]);
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
  const toViewerCurrency = (amount: number, sourceCurrency: string) => {
    const from = String(sourceCurrency || 'USD').toUpperCase();
    const to = String(localCurrency || from).toUpperCase();
    if (!Number.isFinite(amount)) return formatCurrencyAmount(0, to || 'ZAR');
    if (from === to) return formatCurrencyAmount(amount, to);
    const fromRate = Number(rates?.[from] ?? 0);
    const toRate = Number(rates?.[to] ?? 0);
    if (!(fromRate > 0) || !(toRate > 0)) return formatCurrencyAmount(amount, from);
    const usd = amount / fromRate;
    const converted = Math.round(usd * toRate * 100) / 100;
    return formatCurrencyAmount(converted, to);
  };

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
              <p className="text-sm text-slate-600 mb-6">Products from {storeOwnerName}</p>
              {validWallProducts.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {validWallProducts.map((wp) => {
                    const p = wp.product!;
                    const markup = wp.resellerCommissionPct ?? 5;
                    const basePrice = getEffectivePrice(p);
                    const resellerPrice = Math.round(basePrice * (1 + markup / 100) * 100) / 100;
                    const resellerId = store.userId?._id ?? store.userId;
                    const productHref = resellerId ? `/marketplace/product/${p._id}?resellerId=${resellerId}&resellerCommissionPct=${markup}` : `/marketplace/product/${p._id}`;
                    return (
                      <Link key={wp.productId} href={productHref} className="group flex flex-col rounded-xl border border-slate-100 overflow-hidden bg-white shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
                        <div className="aspect-square bg-slate-100 overflow-hidden">
                          {p.images?.[0] ? (
                            <img src={getImageUrl(p.images[0])} alt="" className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-200" />
                          ) : (
                            <div className="h-full w-full flex items-center justify-center text-slate-400 text-sm">No image</div>
                          )}
                        </div>
                        <div className="p-4 flex-1 flex flex-col">
                          <p className="font-medium text-slate-800 line-clamp-2">{p.title}</p>
                          <p className="text-base text-brand-600 font-semibold mt-2">
                            {toViewerCurrency(resellerPrice, p.currency || 'ZAR')}
                          </p>
                        </div>
                      </Link>
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
