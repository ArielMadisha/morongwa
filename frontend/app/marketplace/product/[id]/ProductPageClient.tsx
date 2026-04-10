'use client';

import { Suspense, useState, useEffect, useRef } from 'react';
import { useParams, usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import DOMPurify from 'dompurify';
import { Package, ArrowLeft, ShoppingCart, X, MapPin } from 'lucide-react';
import { productsAPI, cartAPI, resellerAPI, getImageUrl, getEffectivePrice } from '@/lib/api';
import { invalidateCartStoresCache, useCartAndStores } from '@/lib/useCartAndStores';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrency } from '@/contexts/CurrencyContext';
import type { Product } from '@/lib/types';
import { AppSidebar, AppSidebarMenuButton } from '@/components/AppSidebar';
import { SearchButton } from '@/components/SearchButton';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import toast from 'react-hot-toast';
import { formatCurrencyAmount } from '@/lib/formatCurrency';
import { markWallExpectRefresh } from '@/lib/wallRefresh';

const DEFAULT_RESELL_MARKUP_PCT = 3;

function formatPriceLocal(price: number, currency: string) {
  return formatCurrencyAmount(price, currency || 'ZAR');
}

function ProductPageContent() {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const { user, logout } = useAuth();
  const { formatPrice: formatInLocal } = useCurrency();
  const { cartCount, hasStore } = useCartAndStores(!!user);
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [addingCart, setAddingCart] = useState(false);
  const [addingWall, setAddingWall] = useState(false);
  const [addToWallModal, setAddToWallModal] = useState(false);
  const [resellerCommissionPct, setResellerCommissionPct] = useState(DEFAULT_RESELL_MARKUP_PCT);
  const [menuOpen, setMenuOpen] = useState(false);
  const [fetchedResellerCommission, setFetchedResellerCommission] = useState<number | null>(null);
  const [resellerName, setResellerName] = useState<string | null>(null);
  const viewResell = searchParams.get('view') === 'resell';
  const autoResell = searchParams.get('autoResell') === '1';
  const resellerIdFromUrl = searchParams.get('resellerId');
  const resellerCommissionPctFromUrl = searchParams.get('resellerCommissionPct');
  const autoResellMarkupRaw = Number(searchParams.get('markup'));
  const autoResellMarkup = Number.isFinite(autoResellMarkupRaw) && autoResellMarkupRaw >= 3 && autoResellMarkupRaw <= 7
    ? Math.round(autoResellMarkupRaw)
    : DEFAULT_RESELL_MARKUP_PCT;
  const autoResellDoneRef = useRef(false);

  useEffect(() => {
    if (!id) return;
    productsAPI
      .getByIdOrSlug(id)
      .then((res) => setProduct(res.data?.data ?? res.data ?? null))
      .catch(() => setProduct(null))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (viewResell && product && user && (product as any).allowResell && !resellerIdFromUrl) {
      setResellerCommissionPct(autoResellMarkup);
      setAddToWallModal(true);
    }
  }, [viewResell, product, user, resellerIdFromUrl, autoResellMarkup]);

  useEffect(() => {
    if (!autoResell || autoResellDoneRef.current) return;
    if (!product || !user || !(product as any).allowResell || resellerIdFromUrl) return;
    autoResellDoneRef.current = true;
    setAddingWall(true);
    setResellerCommissionPct(autoResellMarkup);
    resellerAPI.addToWall(product._id, autoResellMarkup)
      .then(() => {
        toast.success('Resell synced — added to your store');
        invalidateCartStoresCache();
        setAddToWallModal(false);
        setAddingWall(false);
        markWallExpectRefresh();
        router.push('/store');
      })
      .catch((e) => {
        autoResellDoneRef.current = false;
        setAddingWall(false);
        setAddToWallModal(true);
        toast.error(e.response?.data?.message ?? 'Failed to sync resell');
      });
  }, [autoResell, autoResellMarkup, product, resellerIdFromUrl, router, user]);

  useEffect(() => {
    if (!resellerIdFromUrl || !product?._id) {
      setResellerName(null);
      return;
    }
    resellerAPI
      .getWall(resellerIdFromUrl)
      .then((res) => {
        const data = res.data?.data ?? res.data;
        const products = data?.products ?? [];
        const wp = products.find((p: any) => (p.productId ?? p.product?._id)?.toString() === product._id);
        if (wp?.resellerCommissionPct != null && !resellerCommissionPctFromUrl) {
          setFetchedResellerCommission(wp.resellerCommissionPct);
        }
        const name = data?.reseller?.name;
        if (name) setResellerName(name);
      })
      .catch(() => {
        setResellerName(null);
      });
  }, [resellerIdFromUrl, resellerCommissionPctFromUrl, product?._id]);

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sky-50 to-white flex items-center justify-center">
        <p className="text-slate-600">Loading...</p>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sky-50 to-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-600 mb-4">Product not found</p>
          <Link href="/marketplace" className="text-sky-600 hover:text-sky-700 font-medium">
            Back to marketplace
          </Link>
        </div>
      </div>
    );
  }

  const storeName =
    !resellerIdFromUrl && typeof product.supplierId === 'object' && product.supplierId?.storeName
      ? product.supplierId.storeName
      : null;
  const allowResell = !resellerIdFromUrl && ('allowResell' in product ? (product as any).allowResell : false);
  const isOutOfStock = (product as any).outOfStock || (product.stock != null && product.stock < 1);

  const effectiveCommission = resellerCommissionPctFromUrl ? Number(resellerCommissionPctFromUrl) : fetchedResellerCommission;
  const displayPrice = resellerIdFromUrl && effectiveCommission != null
    ? Math.round(getEffectivePrice(product) * (1 + effectiveCommission / 100) * 100) / 100
    : getEffectivePrice(product);

  const addToCart = () => {
    if (isOutOfStock) { toast.error('Product is out of stock'); return; }
    if (!user) {
      router.push(`/register?returnTo=${encodeURIComponent(pathname || `/marketplace/product/${id}`)}`);
      return;
    }
    setAddingCart(true);
    cartAPI.add(product._id, 1, resellerIdFromUrl || undefined).then(() => { toast.success('Added to cart'); invalidateCartStoresCache(); setAddingCart(false); }).catch(() => { toast.error('Failed'); setAddingCart(false); });
  };

  const addToWall = () => {
    if (!user) return;
    setAddingWall(true);
    resellerAPI.addToWall(product._id, resellerCommissionPct)
      .then(() => {
        toast.success('Added to MyStore');
        invalidateCartStoresCache();
        setAddToWallModal(false);
        setAddingWall(false);
        markWallExpectRefresh();
        router.push('/store');
      })
      .catch((e) => {
        toast.error(e.response?.data?.message ?? 'Failed');
        setAddingWall(false);
      });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-blue-50 to-white text-slate-900 flex">
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
        />
      )}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="bg-white/85 backdrop-blur-md border-b border-slate-100 shadow-sm flex-shrink-0">
          <div className="px-4 sm:px-6 lg:px-8 py-3 sm:py-4 flex items-center justify-between gap-3 sm:gap-4">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              {user && <AppSidebarMenuButton onClick={() => setMenuOpen((v) => !v)} />}
              <Link href="/marketplace" className="text-slate-700 hover:text-sky-600 font-medium">← QwertyHub</Link>
            </div>
            <div className="flex-1 min-w-0" />
            <SearchButton />
            {!user && (
              <div className="flex gap-2">
                <Link href="/login" className="rounded-lg border border-sky-200 px-4 py-2 text-sm font-medium text-sky-700 hover:bg-sky-50">Sign in</Link>
                <Link href={`/register?returnTo=${encodeURIComponent(pathname || '/marketplace')}`} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700">Register</Link>
              </div>
            )}
          </div>
        </header>
        <main className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-8 pb-24 lg:pb-8">
          <div className="max-w-4xl mx-auto">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-6 text-sm">
          {resellerIdFromUrl ? (
            <>
              <Link
                href={`/morongwa-tv/user/${resellerIdFromUrl}`}
                className="inline-flex items-center gap-2 text-sky-600 hover:text-sky-700 font-medium"
              >
                <ArrowLeft className="h-4 w-4" />
                {resellerName ? `${resellerName}'s profile` : 'Seller profile'}
              </Link>
              <Link href="/marketplace" className="text-slate-500 hover:text-sky-600 font-medium">
                QwertyHub
              </Link>
            </>
          ) : (
            <Link
              href="/marketplace"
              className="inline-flex items-center gap-2 text-sky-600 hover:text-sky-700 font-medium"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to marketplace
            </Link>
          )}
        </div>

        <div className="bg-white/90 backdrop-blur rounded-2xl border border-slate-100 overflow-hidden shadow-lg">
          <div className="grid md:grid-cols-2 gap-0">
            <div className="relative isolate aspect-square bg-slate-100 flex items-center justify-center min-h-[280px] z-0">
              {product.images?.[0] ? (
                <img
                  src={getImageUrl(product.images[0])}
                  alt={product.title}
                  className="w-full h-full object-cover relative z-10"
                  data-pin-nopin="true"
                />
              ) : (
                <Package className="h-24 w-24 text-slate-300" />
              )}
            </div>
            <div className="p-8 flex flex-col justify-center">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-slate-900">{product.title}</h1>
                {isOutOfStock && <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">Out of stock</span>}
              </div>
              {((product as any)._id || (product as any).externalProductId) && (
                <p className="mt-2 text-xs text-slate-500 font-mono flex flex-wrap gap-x-3 gap-y-0.5">
                  {(product as any)._id && <span title={(product as any)._id}>ID: {(product as any)._id}</span>}
                  {(product as any).externalProductId && (
                    <span
                      className="cursor-copy hover:text-sky-600"
                      title={`${((product as any).supplierSource === 'eprolo' ? 'EPROLO' : (product as any).supplierSource === 'cj' ? 'CJ' : 'Supplier')} Product ID – click to copy`}
                      onClick={() => {
                        navigator.clipboard.writeText((product as any).externalProductId);
                        toast.success('Product ID copied');
                      }}
                    >
                      {(product as any).supplierSource === 'eprolo' ? 'EPROLO' : (product as any).supplierSource === 'cj' ? 'CJ' : 'Supplier'}: {(product as any).externalProductId}
                    </span>
                  )}
                </p>
              )}
              <div className="mt-2">
                {resellerIdFromUrl ? (
                  <p className="text-2xl font-bold text-sky-600">
                    {product.currency === 'USD' ? formatInLocal(displayPrice) : formatPriceLocal(displayPrice, product.currency)}
                  </p>
                ) : product.currency === 'USD' ? (
                  product.discountPrice != null && product.discountPrice < product.price ? (
                    <>
                      <span className="text-2xl font-bold text-sky-600">{formatInLocal(product.discountPrice)}</span>
                      <span className="ml-2 text-base text-slate-400 line-through">{formatInLocal(product.price)}</span>
                    </>
                  ) : (
                    <p className="text-2xl font-bold text-sky-600">{formatInLocal(product.price)}</p>
                  )
                ) : (
                  product.discountPrice != null && product.discountPrice < product.price ? (
                    <>
                      <span className="text-2xl font-bold text-sky-600">{formatPriceLocal(product.discountPrice, product.currency)}</span>
                      <span className="ml-2 text-base text-slate-400 line-through">{formatPriceLocal(product.price, product.currency)}</span>
                    </>
                  ) : (
                    <p className="text-2xl font-bold text-sky-600">{formatPriceLocal(product.price, product.currency)}</p>
                  )
                )}
              </div>
              {(product as any).estimatedShipping != null ? (
                <p className="text-sm text-slate-600 mt-2">
                  Shipping estimate: {formatPriceLocal((product as any).estimatedShipping, 'ZAR')}
                </p>
              ) : (
                <p className="text-sm text-slate-600 mt-2">
                  Shipping is calculated at checkout.
                </p>
              )}
              {(product as any).shippingNote && (
                <p className="text-xs text-slate-500 mt-1">{String((product as any).shippingNote)}</p>
              )}
              {(product as any).bulkTiers?.length > 0 && (
                <div className="mt-2 rounded-lg bg-sky-50 border border-sky-100 px-3 py-2">
                  <p className="text-xs font-medium text-sky-800 mb-1">Bulk pricing</p>
                  <ul className="text-sm text-sky-700 space-y-0.5">
                    {((product as any).bulkTiers as Array<{ minQty: number; maxQty: number; price: number }>).map((t, i) => (
                      <li key={i}>
                        {t.minQty}–{t.maxQty} units: {product.currency === 'USD' ? formatInLocal(t.price) : formatPriceLocal(t.price, product.currency)} each
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {resellerIdFromUrl ? (
                <p className="text-sm text-slate-600 mt-1">
                  Offered by{' '}
                  <span className="font-medium text-slate-800">{resellerName || 'this seller'}</span>
                  <span className="text-slate-500"> · Fulfilled by supplier</span>
                </p>
              ) : (
                storeName && <p className="text-sm text-slate-500 mt-1">Sold by {storeName}</p>
              )}
              {(product as any).availableCountries?.length > 0 && (
                <p className="text-sm text-slate-600 mt-2 flex items-center gap-1.5">
                  <MapPin className="h-4 w-4 text-slate-500 shrink-0" />
                  Available in {(product as any).availableCountries.length === 1
                    ? (product as any).availableCountries[0]
                    : (product as any).availableCountries.join(', ')}
                </p>
              )}
              {(product as any).sizes?.length > 0 && (
                <p className="text-sm text-slate-600 mt-2">Sizes: {(product as any).sizes.join(', ')}</p>
              )}
              {product.ratingAvg != null && (
                <p className="text-sm text-slate-600 mt-2">
                  {product.ratingAvg.toFixed(1)}★
                  {product.ratingCount != null && product.ratingCount > 0 && ` (${product.ratingCount} reviews)`}
                </p>
              )}
              {product.description && (
                <div
                  className="text-slate-600 mt-4 prose prose-slate prose-sm prose-img:rounded-lg prose-img:max-w-full max-w-none"
                  dangerouslySetInnerHTML={{
                    __html: DOMPurify.sanitize(product.description, { ADD_ATTR: ['target'] }),
                  }}
                />
              )}
              <div className="flex flex-wrap gap-3 mt-6">
                <button
                  type="button"
                  onClick={addToCart}
                  disabled={addingCart || isOutOfStock}
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-sky-600 text-white font-medium hover:bg-sky-700 disabled:opacity-50"
                >
                  <ShoppingCart className="h-4 w-4" />
                  {isOutOfStock ? 'Out of stock' : addingCart ? 'Adding...' : 'Add to cart'}
                </button>
              </div>
              <p className="text-sm text-slate-500 mt-4">
                <Link href={user ? '/cart' : `/register?returnTo=${encodeURIComponent('/cart')}`} className="text-sky-600 hover:text-sky-700">View cart</Link>
                {' · '}
                {resellerIdFromUrl ? (
                  <Link href={`/morongwa-tv/user/${resellerIdFromUrl}`} className="text-sky-600 hover:text-sky-700">Seller</Link>
                ) : (
                  <Link href="/marketplace" className="text-sky-600 hover:text-sky-700">Back to marketplace</Link>
                )}
                {' · '}
                <Link href="/support?category=products:marketplace" className="text-sky-600 hover:text-sky-700">Need help?</Link>
              </p>
            </div>
          </div>
        </div>
          </div>
        </main>
      </div>
      {user && <MobileBottomNav cartCount={cartCount} hasStore={hasStore} />}

        {addToWallModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => setAddToWallModal(false)} aria-hidden="true" />
            <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-900">Add to MyStore</h3>
                <button onClick={() => setAddToWallModal(false)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
              </div>
              <p className="text-sm text-slate-600 mb-4">Set your commission (3–7%). This markup will be added to the price in your store.</p>
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-2">Your commission %</label>
                <input
                  type="range"
                  min="3"
                  max="7"
                  value={resellerCommissionPct}
                  onChange={(e) => setResellerCommissionPct(Number(e.target.value))}
                  className="w-full"
                />
                <p className="text-sm font-semibold text-sky-600 mt-1">{resellerCommissionPct}% — Selling price: {product.currency === 'USD' ? formatInLocal(Math.round(getEffectivePrice(product) * (1 + resellerCommissionPct / 100) * 100) / 100) : formatPriceLocal(Math.round(getEffectivePrice(product) * (1 + resellerCommissionPct / 100) * 100) / 100, product.currency)}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={addToWall} disabled={addingWall} className="flex-1 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50">
                  {addingWall ? 'Adding...' : 'Add to MyStore'}
                </button>
                <button onClick={() => setAddToWallModal(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}

export default function ProductPageClient() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gradient-to-br from-sky-50 via-blue-50 to-white" />}>
      <ProductPageContent />
    </Suspense>
  );
}
