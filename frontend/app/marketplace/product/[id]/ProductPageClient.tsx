'use client';

import { Suspense, useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import DOMPurify from 'dompurify';
import { Package, ArrowLeft, ShoppingCart, X, MapPin } from 'lucide-react';
import { productsAPI, cartAPI, resellerAPI, getImageUrl, getEffectivePrice, getProductPriceForQty, isValidCatalogDiscountPrice } from '@/lib/api';
import { invalidateCartStoresCache, useCartAndStores } from '@/lib/useCartAndStores';
import { MarketplaceCartStepper } from '@/components/MarketplaceCartStepper';
import { ProductColorSelector } from '@/components/ProductColorSelector';
import type { ProductColorOption } from '@/components/ProductColorSelector';
import { ProductSizeSelector } from '@/components/ProductSizeSelector';
import { normalizeProductSizes } from '@/lib/productSizes';
import { productQtyMapFromCartResponse } from '@/lib/cartProductQty';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrency } from '@/contexts/CurrencyContext';
import type { Product } from '@/lib/types';
import { AppSidebar, AppSidebarMenuButton } from '@/components/AppSidebar';
import { SearchButton } from '@/components/SearchButton';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import toast from 'react-hot-toast';
import { formatCatalogProductPrice } from '@/lib/productPriceZar';
import { markWallExpectRefresh } from '@/lib/wallRefresh';
import { resellerMarkupBoundsForProductCategories } from '@/lib/marketplaceCategoryMarkups';
import { formatBulkTierRange, normalizeBulkTierMaxQty } from '@/lib/bulkTierLimits';
import { buildProductSupportHref } from '@/lib/productSupportSubject';
import { FREE_DELIVERY_PROMO_LABEL, productShowsFreeDeliveryPromo } from '@/lib/freeShippingAreas';

const EMPTY_MARKUP_BOUNDS = resellerMarkupBoundsForProductCategories([]);

function formatPriceLocal(price: number, currency: string, rates?: Record<string, number>) {
  return formatCatalogProductPrice(price, currency || 'ZAR', rates);
}

function ProductPageContent() {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const { user, logout } = useAuth();
  const { rates } = useCurrency();
  const { cartCount, hasStore } = useCartAndStores(!!user);
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [cartQty, setCartQty] = useState(0);
  const [addingWall, setAddingWall] = useState(false);
  const [addToWallModal, setAddToWallModal] = useState(false);
  const [resellerCommissionPct, setResellerCommissionPct] = useState(EMPTY_MARKUP_BOUNDS.defaultPct);
  const [menuOpen, setMenuOpen] = useState(false);
  const [fetchedResellerCommission, setFetchedResellerCommission] = useState<number | null>(null);
  const [resellerName, setResellerName] = useState<string | null>(null);
  const [resellerStoreName, setResellerStoreName] = useState<string | null>(null);
  const [resellerStoreSlug, setResellerStoreSlug] = useState<string | null>(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [selectedColor, setSelectedColor] = useState<ProductColorOption | null>(null);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [mainImageFailed, setMainImageFailed] = useState(false);
  const optionsSectionRef = useRef<HTMLDivElement>(null);
  const viewResell = searchParams.get('view') === 'resell';
  const autoResell = searchParams.get('autoResell') === '1';
  const pickOptions = searchParams.get('pickOptions') === '1';
  const resellerIdFromUrl = searchParams.get('resellerId');
  const resellerCommissionPctFromUrl = searchParams.get('resellerCommissionPct');

  const markupBounds = useMemo(
    () => resellerMarkupBoundsForProductCategories(product?.categories ?? []),
    [product?.categories, product?._id]
  );

  const productImages = useMemo(() => {
    if (!product?.images?.length) return [];
    return product.images.map((img) => String(img || '').trim()).filter(Boolean);
  }, [product?.images, product?._id]);

  useEffect(() => {
    setSelectedImageIndex(0);
    setSelectedColor(null);
    setSelectedSize(null);
    setMainImageFailed(false);
  }, [product?._id]);

  const productColors = useMemo(() => {
    const raw = (product as Product & { colors?: ProductColorOption[] })?.colors;
    return Array.isArray(raw) ? raw.filter((c) => c?.name && c?.hex) : [];
  }, [product]);

  const productSizes = useMemo(() => {
    const raw = (product as Product & { sizes?: string[] })?.sizes;
    return normalizeProductSizes(Array.isArray(raw) ? raw : []);
  }, [product]);

  useEffect(() => {
    if (pickOptions) return;
    if (productColors.length > 0 && !selectedColor) {
      setSelectedColor(productColors[0]);
      setSelectedImageIndex(productColors[0].imageIndex ?? 0);
    }
  }, [productColors, selectedColor, pickOptions]);

  useEffect(() => {
    if (pickOptions) return;
    if (productSizes.length > 0 && !selectedSize) {
      setSelectedSize(productSizes[0]);
    }
  }, [productSizes, selectedSize, pickOptions]);

  useEffect(() => {
    if (!pickOptions || loading || !product) return;
    if (productColors.length === 0 && productSizes.length === 0) return;
    toast('Choose your options, then tap + on the image to add to cart');
    requestAnimationFrame(() => {
      optionsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }, [pickOptions, loading, product, productColors.length, productSizes.length]);

  useEffect(() => {
    setMainImageFailed(false);
  }, [selectedImageIndex, product?._id]);

  const displayImageSrc = useMemo(() => {
    if (mainImageFailed && productImages.length > 1) {
      const fallback = productImages.find((_, i) => i !== selectedImageIndex);
      return fallback ? getImageUrl(fallback) : '';
    }
    const raw = productImages[selectedImageIndex] ?? productImages[0];
    return raw ? getImageUrl(raw) : '';
  }, [mainImageFailed, productImages, selectedImageIndex]);

  const autoResellMarkup = useMemo(() => {
    const raw = Number(searchParams.get('markup'));
    const b = markupBounds;
    if (Number.isFinite(raw)) return Math.min(b.maxPct, Math.max(b.minPct, Math.round(raw)));
    return b.defaultPct;
  }, [searchParams, markupBounds]);

  const autoResellDoneRef = useRef(false);

  useEffect(() => {
    if (!product || resellerIdFromUrl || viewResell || autoResell) return;
    setResellerCommissionPct(markupBounds.defaultPct);
  }, [product?._id, markupBounds.defaultPct, markupBounds.minPct, markupBounds.maxPct, resellerIdFromUrl, viewResell, autoResell]);

  useEffect(() => {
    if (!id) return;
    productsAPI
      .getByIdOrSlug(id)
      .then((res) => setProduct(res.data?.data ?? res.data ?? null))
      .catch(() => setProduct(null))
      .finally(() => setLoading(false));
  }, [id]);

  const refreshCartQty = useCallback(() => {
    if (!user) {
      setCartQty(0);
      return;
    }
    cartAPI
      .get()
      .then((res) => {
        const m = productQtyMapFromCartResponse(res, {
          productId: String(product?._id ?? ''),
          selectedColor: selectedColor?.name,
          selectedSize: selectedSize,
        });
        setCartQty(m[String(product?._id ?? '')] ?? 0);
      })
      .catch(() => setCartQty(0));
  }, [user, product?._id, selectedColor?.name, selectedSize]);

  useEffect(() => {
    refreshCartQty();
  }, [refreshCartQty]);

  const handleCartUpdated = useCallback(() => {
    invalidateCartStoresCache();
    refreshCartQty();
  }, [refreshCartQty]);

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
      setResellerStoreName(null);
      setResellerStoreSlug(null);
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
        const rs = data?.resellerStore;
        const storeNameFromApi = rs?.name ? String(rs.name).trim() : '';
        const storeSlugFromApi = rs?.slug ? String(rs.slug).trim() : '';
        if (storeNameFromApi) setResellerStoreName(storeNameFromApi);
        if (storeSlugFromApi) setResellerStoreSlug(storeSlugFromApi);
        const name = data?.reseller?.name;
        if (name) setResellerName(String(name).trim());
        if (!storeNameFromApi && name) setResellerStoreName(String(name).trim());
      })
      .catch(() => {
        setResellerName(null);
        setResellerStoreName(null);
        setResellerStoreSlug(null);
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

  const supplierStoreName =
    typeof product.supplierId === 'object' && product.supplierId?.storeName
      ? product.supplierId.storeName
      : null;
  const resellerSellerLabel = resellerStoreName || resellerName || 'this store';
  const resellerSellerHref = resellerStoreSlug
    ? `/store/${resellerStoreSlug}`
    : resellerIdFromUrl
      ? `/morongwa-tv/user/${resellerIdFromUrl}`
      : null;
  const allowResell = !resellerIdFromUrl && ('allowResell' in product ? (product as any).allowResell : false);
  const isOutOfStock = (product as any).outOfStock || (product.stock != null && product.stock < 1);

  const effectiveCommission = resellerCommissionPctFromUrl ? Number(resellerCommissionPctFromUrl) : fetchedResellerCommission;
  const qtyForPricing = Math.max(cartQty, 1);
  const unitCatalogPrice = getProductPriceForQty(product as Product, qtyForPricing);
  const displayPrice =
    resellerIdFromUrl && effectiveCommission != null
      ? Math.round(unitCatalogPrice * (1 + effectiveCommission / 100) * 100) / 100
      : unitCatalogPrice;
  const listUnitPrice = getEffectivePrice(product);
  const bulkTiers = (product as Product & { bulkTiers?: Array<{ minQty: number; maxQty: number; price: number }> })
    .bulkTiers;

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
            <div className="relative isolate flex flex-col bg-slate-100 min-h-[280px] z-0">
              <div className="relative aspect-square flex items-center justify-center">
                {productImages.length > 0 ? (
                  <img
                    src={displayImageSrc}
                    alt={product.title}
                    className="w-full h-full object-cover relative z-10"
                    data-pin-nopin="true"
                    onError={() => setMainImageFailed(true)}
                  />
                ) : (
                  <Package className="h-24 w-24 text-slate-300" />
                )}
                <div className="absolute right-3 top-3 z-20">
                  <MarketplaceCartStepper
                    productId={product._id}
                    resellerId={resellerIdFromUrl || undefined}
                    selectedColor={selectedColor?.name}
                    selectedSize={selectedSize || undefined}
                    colorsRequired={productColors.length > 0}
                    sizesRequired={productSizes.length > 0}
                    qty={cartQty}
                    outOfStock={isOutOfStock}
                    isGuest={!user}
                    loginHref={`/login?returnTo=${encodeURIComponent(pathname || `/marketplace/product/${id}`)}`}
                    onUpdated={handleCartUpdated}
                  />
                </div>
              </div>
              {productImages.length > 1 && (
                <div className="flex gap-2 p-3 overflow-x-auto border-t border-slate-200/80 bg-white/60">
                  {productImages.map((img, i) => (
                    <button
                      key={`${img}-${i}`}
                      type="button"
                      onClick={() => setSelectedImageIndex(i)}
                      className={`h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 transition ${
                        i === selectedImageIndex
                          ? 'border-sky-500 ring-2 ring-sky-200'
                          : 'border-slate-200 hover:border-sky-300'
                      }`}
                      aria-label={`View image ${i + 1} of ${productImages.length}`}
                      aria-pressed={i === selectedImageIndex}
                    >
                      <img src={getImageUrl(img)} alt="" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
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
                    {formatPriceLocal(displayPrice, product.currency, rates)}
                    {cartQty > 0 && unitCatalogPrice !== listUnitPrice && (
                      <span className="ml-2 text-sm font-normal text-slate-600">({cartQty} in cart)</span>
                    )}
                  </p>
                ) : isValidCatalogDiscountPrice(product.discountPrice, product.price) && unitCatalogPrice === product.discountPrice ? (
                  <>
                    <span className="text-2xl font-bold text-sky-600">{formatPriceLocal(unitCatalogPrice, product.currency, rates)}</span>
                    <span className="ml-2 text-base text-slate-400 line-through">{formatPriceLocal(product.price, product.currency, rates)}</span>
                  </>
                ) : (
                  <p className="text-2xl font-bold text-sky-600">
                    {formatPriceLocal(unitCatalogPrice, product.currency, rates)}
                    {cartQty > 0 && unitCatalogPrice !== listUnitPrice && (
                      <span className="ml-2 text-sm font-normal text-slate-600">({cartQty} in cart)</span>
                    )}
                  </p>
                )}
              </div>
              {(product as any).estimatedShipping != null ? (
                <p className="text-sm text-slate-600 mt-2">
                  Shipping estimate: {formatPriceLocal((product as any).estimatedShipping, 'ZAR', rates)}
                </p>
              ) : (
                <p className="text-sm text-slate-600 mt-2">
                  Shipping is calculated at checkout.
                </p>
              )}
              {(product as any).shippingNote && (
                <p className="text-xs text-slate-500 mt-1">{String((product as any).shippingNote)}</p>
              )}
              {bulkTiers && bulkTiers.length > 0 && (
                <div className="mt-2 rounded-lg bg-sky-50 border border-sky-100 px-3 py-2">
                  <p className="text-xs font-medium text-sky-800 mb-1">Bulk pricing (per unit)</p>
                  <ul className="text-sm text-sky-700 space-y-0.5">
                    {bulkTiers.map((t, i) => {
                      const tierMax = normalizeBulkTierMaxQty(t.maxQty, t.minQty);
                      const tierActive = cartQty >= t.minQty && cartQty <= tierMax;
                      return (
                      <li key={i} className={tierActive ? 'font-semibold text-sky-900' : undefined}>
                        {formatBulkTierRange(t.minQty, t.maxQty)}:{' '}
                        {formatPriceLocal(t.price, product.currency, rates)} each
                        {tierActive ? ' ← your quantity' : ''}
                      </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              {resellerIdFromUrl ? (
                <p className="text-sm text-slate-600 mt-1">
                  Sold by{' '}
                  {resellerSellerHref ? (
                    <Link href={resellerSellerHref} className="font-medium text-slate-800 hover:text-sky-600">
                      {resellerSellerLabel}
                    </Link>
                  ) : (
                    <span className="font-medium text-slate-800">{resellerSellerLabel}</span>
                  )}
                  {supplierStoreName && supplierStoreName !== resellerSellerLabel ? (
                    <span className="text-slate-500"> · Fulfilled by {supplierStoreName}</span>
                  ) : null}
                </p>
              ) : (
                supplierStoreName && (
                  <p className="text-sm text-slate-500 mt-1">Sold by {supplierStoreName}</p>
                )
              )}
              {(product as any).availableCountries?.length > 0 && (
                <p className="text-sm text-slate-600 mt-2 flex items-center gap-1.5">
                  <MapPin className="h-4 w-4 text-slate-500 shrink-0" />
                  Available in {(product as any).availableCountries.length === 1
                    ? (product as any).availableCountries[0]
                    : (product as any).availableCountries.join(', ')}
                </p>
              )}
              {productSizes.length > 0 && (
                <div ref={optionsSectionRef}>
                  <ProductSizeSelector
                    sizes={productSizes}
                    selectedSize={selectedSize}
                    onSelect={setSelectedSize}
                  />
                </div>
              )}
              {productColors.length > 0 && (
                <div ref={productSizes.length === 0 ? optionsSectionRef : undefined}>
                  <ProductColorSelector
                    colors={productColors}
                    selectedName={selectedColor?.name}
                    onSelect={(color) => {
                      setSelectedColor(color);
                      setMainImageFailed(false);
                      if (typeof color.imageIndex === 'number' && productImages[color.imageIndex]) {
                        setSelectedImageIndex(color.imageIndex);
                      }
                    }}
                  />
                </div>
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
              <div className="flex flex-wrap items-center gap-3 mt-6">
                {cartQty > 0 && user ? (
                  <Link
                    href="/cart"
                    className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-sky-600 text-white font-medium hover:bg-sky-700"
                  >
                    <ShoppingCart className="h-4 w-4" />
                    Checkout ({cartQty} in cart)
                  </Link>
                ) : (
                  <p className="text-sm text-slate-600">Use + above to add to cart, then checkout.</p>
                )}
              </div>
              {productShowsFreeDeliveryPromo(product) ? (
                <p className="text-sm font-semibold text-sky-600 mt-2">{FREE_DELIVERY_PROMO_LABEL}</p>
              ) : null}
              <p className="text-sm text-slate-500 mt-4">
                <Link href={user ? '/cart' : `/register?returnTo=${encodeURIComponent('/cart')}`} className="text-sky-600 hover:text-sky-700">View cart</Link>
                {' · '}
                {resellerIdFromUrl ? (
                  <Link href={`/morongwa-tv/user/${resellerIdFromUrl}`} className="text-sky-600 hover:text-sky-700">Seller</Link>
                ) : (
                  <Link href="/marketplace" className="text-sky-600 hover:text-sky-700">Back to marketplace</Link>
                )}
                {' · '}
                <Link
                  href={buildProductSupportHref(product.title || '', product._id || id)}
                  className="text-sky-600 hover:text-sky-700"
                >
                  Need help?
                </Link>
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
              <p className="text-sm text-slate-600 mb-4">
                Set your markup ({markupBounds.minPct}–{markupBounds.maxPct}% for this category). This is added on top of the catalog price in your store.
              </p>
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-2">Your markup %</label>
                <input
                  type="range"
                  min={markupBounds.minPct}
                  max={markupBounds.maxPct}
                  value={Math.min(markupBounds.maxPct, Math.max(markupBounds.minPct, resellerCommissionPct))}
                  onChange={(e) => setResellerCommissionPct(Number(e.target.value))}
                  className="w-full"
                />
                <p className="text-sm font-semibold text-sky-600 mt-1">{resellerCommissionPct}% — Selling price: {formatPriceLocal(Math.round(getEffectivePrice(product) * (1 + resellerCommissionPct / 100) * 100) / 100, product.currency, rates)}</p>
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
