'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ShoppingCart, Minus, Plus, Trash2, ArrowRight, Package, Music2, Truck } from 'lucide-react';
import { mergeProgrammedPaxiWithApi, PROGRAMMED_PAXI_ZA } from '@/lib/paxiCatalog';
import {
  type DeliveryProvider,
  type ProgrammedDeliveryOption,
  deliveryOptionSelectId,
  mergeProgrammedCourierGuyWithApi,
  PROGRAMMED_COURIER_GUY_ZA,
} from '@/lib/courierGuyCatalog';
import { PaxiDeliveryPicker } from '@/components/PaxiDeliveryPicker';
import { CourierGuyDeliveryPicker } from '@/components/CourierGuyDeliveryPicker';
import { SadcDeliveryPicker } from '@/components/SadcDeliveryPicker';
import { SearchButton } from '@/components/SearchButton';
import { cartAPI, checkoutAPI, getImageUrl, getProductPriceForQty } from '@/lib/api';
import { invalidateCartStoresCache, useCartAndStores } from '@/lib/useCartAndStores';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrency } from '@/contexts/CurrencyContext';
import { AppSidebar } from '@/components/AppSidebar';
import { AppShellHeader } from '@/components/AppShellHeader';
import { AdvertSlot } from '@/components/AdvertSlot';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { ProfileHeaderButton } from '@/components/ProfileHeaderButton';
import {
  getProgrammedSadcOptions,
  mergeProgrammedSadcWithApi,
  type SadcDeliveryScope,
} from '@/lib/sadcDeliveryCatalog';
import { formatCurrencyAmount } from '@/lib/formatCurrency';
import { cartIsInstorePickupOnly, productIsInstorePickup } from '@/lib/instorePickupCart';
import {
  isFullDeliveryAddressComplete,
  readCartDeliveryAddress,
  writeCartDeliveryAddress,
} from '@/lib/cartDeliveryAddress';
import toast from 'react-hot-toast';

interface CartItem {
  productId: string;
  qty: number;
  resellerId?: string;
  selectedColor?: string;
  selectedSize?: string;
  product: {
    _id: string;
    title: string;
    slug: string;
    images: string[];
    price: number;
    originalPrice?: number;
    discountPrice?: number;
    bulkTiers?: Array<{ minQty: number; maxQty: number; price: number }>;
    currency: string;
    stock: number;
    categories?: string[];
    tags?: string[];
    colors?: Array<{ name: string }>;
    sizes?: string[];
  };
  lineTotal: number;
}

interface CartMusicItem {
  songId: string;
  qty: number;
  song: {
    _id: string;
    title: string;
    artist?: string;
    artworkUrl?: string;
    price: number;
    type?: string;
  };
  lineTotal: number;
}

function formatPriceLocal(price: number, currency: string) {
  return formatCurrencyAmount(price, currency || 'ZAR');
}

function cartLineKey(item: CartItem): string {
  const color = (item.selectedColor || '').trim().toLowerCase();
  const size = (item.selectedSize || '').trim().toUpperCase();
  return `${item.productId}:${color}:${size}`;
}

function CartPageContent() {
  const { user, logout } = useAuth();
  const { formatPrice: formatInLocal } = useCurrency();
  const router = useRouter();
  const [items, setItems] = useState<CartItem[]>([]);
  const [musicItems, setMusicItems] = useState<CartMusicItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deliveryCountry, setDeliveryCountry] = useState('ZA');
  const [deliveryScope, setDeliveryScope] = useState<SadcDeliveryScope>('crossborder');
  const [deliveryProvider, setDeliveryProvider] = useState<DeliveryProvider>('paxi');
  const [courierTariffId, setCourierTariffId] = useState<string | undefined>(undefined);
  const [crossborderCourierTariffId, setCrossborderCourierTariffId] = useState<string | undefined>(
    undefined
  );
  const [selectedDeliveryId, setSelectedDeliveryId] = useState<string | undefined>(undefined);
  const [selectedCrossborderId, setSelectedCrossborderId] = useState<string | undefined>(undefined);
  const cartIsBwNative = useMemo(
    () =>
      items.length > 0 &&
      items.every((i) => String(i.product?.currency || '').toUpperCase() === 'BWP'),
    [items]
  );

  const sadcDisplayCurrency =
    deliveryCountry === 'BW' && deliveryScope === 'local' && cartIsBwNative ? 'BWP' : 'ZAR';

  const [quote, setQuote] = useState<{
    subtotal: number;
    shipping: number;
    total: number;
    currency?: string;
    shippingEstimateMinZar?: number;
    shippingNote?: string;
    shippingBreakdown?: Array<{ storeName?: string; shippingCost: number }>;
    courierOptions?: Array<{
      tariffId: string;
      providerName: string;
      serviceLabel: string;
      zone?: string;
      priceZar: number;
      minDeliveryDays: number;
      maxDeliveryDays: number;
    }>;
    requiresCourierSelection?: boolean;
    courierDeliveryZar?: number;
    readyForPayment?: boolean;
    hasMixedStoreOrigins?: boolean;
    requiresCrossborderCourierSelection?: boolean;
    crossborderCourierOptions?: ProgrammedDeliveryOption[];
    warehouseFreeLocalApplied?: boolean;
    freeDeliveryLabel?: string;
    foodPickup?: boolean;
  } | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [deliveryCity, setDeliveryCity] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [addressState, setAddressState] = useState('');
  const [addressPostal, setAddressPostal] = useState('');
  const [debouncedDeliveryCity, setDebouncedDeliveryCity] = useState('');
  const [deliveryOptions, setDeliveryOptions] = useState<ProgrammedDeliveryOption[]>([]);
  const [deliveryHydrating, setDeliveryHydrating] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const { cartCount, hasStore } = useCartAndStores(!!user);

  const cartSignature = useMemo(
    () =>
      items.map((i) => `${cartLineKey(i)}:${i.qty}`).join('|') +
      (musicItems.length ? `|m:${musicItems.map((m) => `${m.songId}:${m.qty}`).join(',')}` : ''),
    [items, musicItems]
  );

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  const loadCart = () => {
    cartAPI
      .get()
      .then((res) => {
        const data = res.data?.data ?? res.data;
        setItems(Array.isArray(data?.items) ? data.items : []);
        setMusicItems(Array.isArray(data?.musicItems) ? data.musicItems : []);
      })
      .catch(() => {
        setItems([]);
        setMusicItems([]);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    invalidateCartStoresCache();
    loadCart();
    try {
      const saved = readCartDeliveryAddress();
      if (saved) {
        setAddressLine1(saved.line1);
        setAddressLine2(saved.line2);
        setDeliveryCity(saved.city);
        setAddressState(saved.state);
        setAddressPostal(saved.postal);
        if (saved.country) setDeliveryCountry(saved.country);
      } else {
        const cityOnly = sessionStorage.getItem('qwertymates.cart.deliveryCity');
        if (cityOnly) setDeliveryCity(cityOnly);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSelectedDeliveryId(undefined);
      setCourierTariffId(undefined);
      setSelectedCrossborderId(undefined);
      setCrossborderCourierTariffId(undefined);
      setDebouncedDeliveryCity(deliveryCity.trim());
    }, 400);
    return () => clearTimeout(timer);
  }, [deliveryCity]);

  useEffect(() => {
    writeCartDeliveryAddress({
      line1: addressLine1,
      line2: addressLine2,
      city: deliveryCity,
      state: addressState,
      postal: addressPostal,
      country: deliveryCountry,
    });
  }, [addressLine1, addressLine2, deliveryCity, addressState, addressPostal, deliveryCountry]);

  useEffect(() => {
    if (!loading && cartIsBwNative) {
      setDeliveryCountry('BW');
      setDeliveryScope('local');
    }
  }, [loading, cartIsBwNative]);

  const cartDisplayCurrency = useMemo(() => {
    if (cartIsBwNative) return 'BWP';
    if (items.some((i) => i.product?.currency === 'USD')) return 'ZAR';
    return items[0]?.product?.currency || 'ZAR';
  }, [cartIsBwNative, items]);

  useEffect(() => {
    if (cartIsBwNative && deliveryCountry === 'BW') {
      setDeliveryScope('local');
    }
  }, [cartIsBwNative, deliveryCountry]);

  const lineItemCount =
    items.reduce((n, i) => n + Math.max(1, i.qty || 1), 0) + musicItems.length;

  const resolvedTariffId = useMemo(() => {
    if (courierTariffId) return courierTariffId;
    if (!selectedDeliveryId) return undefined;
    const row = deliveryOptions.find(
      (o) => deliveryOptionSelectId(o) === selectedDeliveryId || o.tariffId === selectedDeliveryId
    );
    return row?.tariffId || undefined;
  }, [courierTariffId, selectedDeliveryId, deliveryOptions]);

  useEffect(() => {
    if (loading || items.length === 0 || cartIsInstorePickupOnly(items)) {
      setDeliveryOptions([]);
      return;
    }
    if (deliveryCountry === 'ZA') {
      setDeliveryOptions(
        deliveryProvider === 'paxi' ? PROGRAMMED_PAXI_ZA : PROGRAMMED_COURIER_GUY_ZA
      );
      return;
    }
    setDeliveryOptions(getProgrammedSadcOptions(deliveryCountry, deliveryScope));
  }, [loading, cartSignature, deliveryCountry, deliveryProvider, deliveryScope, items]);

  const hydrateDeliveryTariffIds = useCallback(async () => {
    if (items.length === 0 || cartIsInstorePickupOnly(items)) {
      setDeliveryOptions([]);
      return;
    }
    setDeliveryHydrating(true);
    try {
      if (deliveryCountry === 'ZA') {
        const res =
          deliveryProvider === 'paxi'
            ? await checkoutAPI.getPaxiCatalog({ country: deliveryCountry })
            : await checkoutAPI.getCourierGuyCatalog({ country: deliveryCountry });
        const raw = res.data?.data ?? res.data;
        if (Array.isArray(raw) && raw.length > 0) {
          setDeliveryOptions(
            deliveryProvider === 'paxi'
              ? mergeProgrammedPaxiWithApi(PROGRAMMED_PAXI_ZA, raw)
              : mergeProgrammedCourierGuyWithApi(PROGRAMMED_COURIER_GUY_ZA, raw)
          );
          setQuoteError(null);
        }
        return;
      }
      const programmed = getProgrammedSadcOptions(deliveryCountry, deliveryScope);
      const res = await checkoutAPI.getSadcCatalog({
        country: deliveryCountry,
        scope: deliveryScope,
        quoteInNativeCurrency: deliveryCountry === 'BW' && deliveryScope === 'local' && cartIsBwNative,
      });
      const raw = res.data?.data ?? res.data;
      if (Array.isArray(raw) && raw.length > 0) {
        setDeliveryOptions(mergeProgrammedSadcWithApi(programmed, raw));
        setQuoteError(null);
      } else {
        setDeliveryOptions(programmed);
      }
    } catch {
      /* programmed list stays visible */
    } finally {
      setDeliveryHydrating(false);
    }
  }, [deliveryCountry, deliveryScope, items, deliveryProvider, cartIsBwNative]);

  useEffect(() => {
    hydrateDeliveryTariffIds();
  }, [hydrateDeliveryTariffIds]);

  const loadCheckoutTotals = useCallback(async () => {
    if (loading) return;
    if (!cartSignature && musicItems.length === 0) {
      setQuote(null);
      return;
    }
    const localSubtotal =
      items.reduce((sum, i) => sum + i.lineTotal, 0) +
      musicItems.reduce((sum, i) => sum + i.lineTotal, 0);
    const pickupCart = cartIsInstorePickupOnly(items);

    if (!pickupCart && items.length > 0 && !resolvedTariffId && debouncedDeliveryCity.length < 2) {
      const minShip = deliveryOptions.length
        ? Math.min(...deliveryOptions.map((o) => o.priceZar))
        : undefined;
      setQuote({
        subtotal: localSubtotal,
        shipping: 0,
        total: localSubtotal,
        shippingEstimateMinZar: minShip,
        courierOptions: deliveryOptions,
        requiresCourierSelection: deliveryOptions.length > 0,
        foodPickup: false,
      });
      return;
    }

    setQuoteLoading(true);
    setQuoteError(null);
    const quoteCourierTariffId = pickupCart
      ? undefined
      : debouncedDeliveryCity.length >= 2 && !resolvedTariffId
        ? undefined
        : resolvedTariffId;
    try {
      const res = await checkoutAPI.quote({
        deliveryCountry: pickupCart ? 'ZA' : deliveryCountry,
        deliveryCity: pickupCart ? undefined : debouncedDeliveryCity || undefined,
        deliveryAddress: pickupCart ? undefined : debouncedDeliveryCity || undefined,
        courierTariffId: quoteCourierTariffId,
        crossborderCourierTariffId: pickupCart ? undefined : crossborderCourierTariffId,
        deliveryScope: pickupCart ? undefined : deliveryCountry !== 'ZA' ? deliveryScope : undefined,
      });
      const d = (res.data?.data ?? res.data) as Record<string, unknown> | null;
      if (!d) {
        setQuote(null);
        return;
      }
      const breakdown = d.shippingBreakdown as Array<{
        storeName?: string;
        shippingCost: number;
        serviceLabel?: string;
      }> | undefined;
      const freeLine = breakdown?.find((b) => Number(b.shippingCost) === 0);
      setQuote({
        subtotal: Number(d.subtotal) || localSubtotal,
        shipping: Number(d.shipping) || 0,
        total: Number(d.total) || localSubtotal,
        currency: typeof d.currency === 'string' ? d.currency : 'ZAR',
        shippingEstimateMinZar: d.shippingEstimateMinZar as number | undefined,
        shippingBreakdown: breakdown,
        courierOptions: deliveryOptions.length ? deliveryOptions : (d.courierOptions as ProgrammedDeliveryOption[]) || [],
        requiresCourierSelection: d.requiresCourierSelection as boolean | undefined,
        courierDeliveryZar: d.courierDeliveryZar as number | undefined,
        readyForPayment: d.readyForPayment as boolean | undefined,
        hasMixedStoreOrigins: d.hasMixedStoreOrigins as boolean | undefined,
        requiresCrossborderCourierSelection: d.requiresCrossborderCourierSelection as boolean | undefined,
        crossborderCourierOptions: (d.crossborderCourierOptions as ProgrammedDeliveryOption[]) || [],
        warehouseFreeLocalApplied: !!d.warehouseFreeLocalApplied,
        freeDeliveryLabel: freeLine?.serviceLabel,
        foodPickup: !!d.foodPickup || pickupCart,
      });
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string; error?: string } }; message?: string };
      setQuoteError(
        e?.response?.data?.message ||
          e?.response?.data?.error ||
          e?.message ||
          'Could not update order total'
      );
      setQuote({
        subtotal: localSubtotal,
        shipping: 0,
        total: localSubtotal,
        courierOptions: deliveryOptions,
        requiresCourierSelection: !pickupCart && deliveryOptions.length > 0,
        foodPickup: pickupCart,
      });
    } finally {
      setQuoteLoading(false);
    }
  }, [
    loading,
    cartSignature,
    items,
    musicItems.length,
    resolvedTariffId,
    debouncedDeliveryCity,
    deliveryOptions,
    deliveryCountry,
    crossborderCourierTariffId,
    deliveryScope,
  ]);

  useEffect(() => {
    loadCheckoutTotals();
  }, [loadCheckoutTotals]);

  const handleDeliverySelect = (id: string, tariffId?: string) => {
    setSelectedDeliveryId(id);
    setCourierTariffId(tariffId);
    setQuoteError(null);
  };

  const handleCrossborderSelect = (id: string, tariffId?: string) => {
    setSelectedCrossborderId(id);
    setCrossborderCourierTariffId(tariffId || id);
    setQuoteError(null);
  };

  const handleProviderChange = (provider: DeliveryProvider) => {
    setDeliveryProvider(provider);
    setSelectedDeliveryId(undefined);
    setCourierTariffId(undefined);
    setQuoteError(null);
  };

  const handleScopeChange = (scope: SadcDeliveryScope) => {
    setDeliveryScope(scope);
    setSelectedDeliveryId(undefined);
    setCourierTariffId(undefined);
    setQuoteError(null);
  };

  const handleCountryChange = (country: string) => {
    setDeliveryCountry(country);
    const cc = String(country || '').toUpperCase();
    setDeliveryScope(cc === 'BW' && cartIsBwNative ? 'local' : 'crossborder');
    setCourierTariffId(undefined);
    setCrossborderCourierTariffId(undefined);
    setSelectedDeliveryId(undefined);
    setSelectedCrossborderId(undefined);
  };

  const updateQty = (item: CartItem, newQty: number) => {
    if (newQty < 1) return;
    const lineKey = cartLineKey(item);
    setUpdating(lineKey);
    cartAPI
      .updateItem(item.productId, newQty, item.selectedColor, item.selectedSize)
      .then(() => { invalidateCartStoresCache(); loadCart(); })
      .finally(() => setUpdating(null));
  };

  const updateVariant = (
    item: CartItem,
    opts: { updateColor?: string; updateSize?: string }
  ) => {
    const lineKey = cartLineKey(item);
    setUpdating(lineKey);
    cartAPI
      .updateItem(item.productId, item.qty, item.selectedColor, item.selectedSize, opts)
      .then(() => {
        invalidateCartStoresCache();
        loadCart();
      })
      .catch((e: unknown) => {
        const msg =
          (e as { response?: { data?: { error?: string; message?: string } } })?.response?.data
            ?.error ||
          (e as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          'Could not update colour/size';
        toast.error(msg);
      })
      .finally(() => setUpdating(null));
  };

  const remove = (item: CartItem) => {
    const lineKey = cartLineKey(item);
    setUpdating(lineKey);
    cartAPI
      .removeItem(item.productId, item.selectedColor, item.selectedSize)
      .then(() => { invalidateCartStoresCache(); loadCart(); })
      .finally(() => setUpdating(null));
  };

  const removeMusic = (songId: string) => {
    setUpdating(songId);
    cartAPI
      .removeMusicItem(songId)
      .then(() => { invalidateCartStoresCache(); loadCart(); })
      .finally(() => setUpdating(null));
  };

  const subtotal = items.reduce((sum, i) => sum + i.lineTotal, 0) + musicItems.reduce((sum, i) => sum + i.lineTotal, 0);
  const isEmpty = items.length === 0 && musicItems.length === 0;
  const hasPhysicalProducts = items.length > 0;
  const isInstorePickupCart = !!quote?.foodPickup || cartIsInstorePickupOnly(items);
  const variantsComplete = items.every((item) => {
    if (productIsInstorePickup(item.product || {})) return true;
    const colors = item.product?.colors || [];
    const sizes = item.product?.sizes || [];
    if (colors.length > 0 && !String(item.selectedColor || '').trim()) return false;
    if (sizes.length > 0 && !String(item.selectedSize || '').trim()) return false;
    return true;
  });
  const fullAddressComplete = isFullDeliveryAddressComplete({
    line1: addressLine1,
    line2: addressLine2,
    city: deliveryCity,
    state: addressState,
    postal: addressPostal,
    country: deliveryCountry,
  });
  const isNonZaDelivery = deliveryCountry !== 'ZA';
  const sadcScopeEmpty =
    isNonZaDelivery && !deliveryHydrating && deliveryOptions.length === 0;
  const hasCourierOptions = deliveryOptions.length > 0;
  const hasDeliveryLocality = debouncedDeliveryCity.length >= 2;
  const freeLocalDelivery = !!quote?.warehouseFreeLocalApplied;
  const checkingFreeDelivery = quoteLoading && hasDeliveryLocality && !freeLocalDelivery;
  const showPaidCourierUi =
    !isInstorePickupCart && hasCourierOptions && !freeLocalDelivery && !checkingFreeDelivery;
  const needsCourierChoice =
    hasPhysicalProducts &&
    !isInstorePickupCart &&
    showPaidCourierUi &&
    !selectedDeliveryId;
  const awaitingTariffId = !!selectedDeliveryId && !resolvedTariffId;
  const deliveryUiLoading = !isInstorePickupCart && deliveryHydrating && !hasCourierOptions;
  const needsCrossborderChoice =
    !isInstorePickupCart &&
    !!quote?.hasMixedStoreOrigins &&
    !!quote?.requiresCrossborderCourierSelection &&
    (quote?.crossborderCourierOptions?.length ?? 0) > 0 &&
    !crossborderCourierTariffId;
  const canProceedToCheckout =
    !variantsComplete
      ? false
      : isInstorePickupCart
        ? !!quote && (quote.readyForPayment !== false)
        : !hasPhysicalProducts ||
          (fullAddressComplete &&
            hasDeliveryLocality &&
            !needsCrossborderChoice &&
            (freeLocalDelivery || (!!resolvedTariffId && (quote?.shipping ?? 0) > 0)));

  const checkoutHref = (() => {
    if (isInstorePickupCart) return '/checkout';
    const q = new URLSearchParams();
    q.set('deliveryReady', '1');
    if (deliveryCountry) q.set('deliveryCountry', deliveryCountry);
    if (debouncedDeliveryCity) q.set('deliveryCity', debouncedDeliveryCity);
    if (addressLine1.trim()) q.set('addressLine1', addressLine1.trim());
    if (addressLine2.trim()) q.set('addressLine2', addressLine2.trim());
    if (addressState.trim()) q.set('addressState', addressState.trim());
    if (addressPostal.trim()) q.set('addressPostal', addressPostal.trim());
    if (deliveryCountry !== 'ZA') q.set('deliveryScope', deliveryScope);
    if (!freeLocalDelivery && courierTariffId) q.set('courierTariffId', courierTariffId);
    else if (!freeLocalDelivery && resolvedTariffId) q.set('courierTariffId', resolvedTariffId);
    if (crossborderCourierTariffId) q.set('crossborderCourierTariffId', crossborderCourierTariffId);
    const s = q.toString();
    return s ? `/checkout?${s}` : '/checkout';
  })();

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-sky-50 via-blue-50 to-white text-slate-900">
      <AppShellHeader
        onMenuClick={() => setMenuOpen((v) => !v)}
        center={
          <>
            <div className="h-8 w-8 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
              <ShoppingCart className="h-4 w-4 text-brand-600" />
            </div>
            <h1 className="text-base sm:text-lg font-semibold text-slate-900 min-w-0 break-words">Cart</h1>
          </>
        }
        actions={
          <>
            <SearchButton />
            <ProfileHeaderButton />
          </>
        }
      />
      <div className="flex min-h-0 min-w-0 w-full flex-1">
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
        <div className="flex min-h-0 flex-1 flex-col gap-0 overflow-y-auto overflow-x-hidden lg:flex-row">
          <main className="relative z-0 order-2 box-border w-full min-w-0 max-w-4xl flex-1 mx-auto px-3 sm:px-6 lg:px-8 py-5 sm:py-6 pb-24 md:pb-6 lg:order-none">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-8 min-w-0">
            <div className="h-12 w-12 rounded-2xl bg-blue-100 border border-blue-200 flex items-center justify-center shrink-0">
              <ShoppingCart className="h-6 w-6 text-blue-600" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 break-words">Your cart</h1>
              <p className="text-slate-600 text-sm sm:text-base leading-relaxed break-words">
                Review items and proceed to checkout
              </p>
            </div>
          </div>

          {loading ? (
            <div className="bg-white/90 rounded-2xl border border-slate-100 p-8 animate-pulse">
              <div className="h-24 bg-slate-100 rounded-xl mb-4" />
              <div className="h-24 bg-slate-100 rounded-xl mb-4" />
            </div>
          ) : isEmpty ? (
            <div className="bg-white/90 backdrop-blur rounded-2xl border border-slate-100 p-12 text-center">
              <Package className="h-16 w-16 text-slate-300 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-slate-700 mb-2">Cart is empty</h2>
              <p className="text-slate-600 mb-6">Add products from QwertyHub or music from QwertyMusic to get started.</p>
              <Link
                href="/marketplace"
                className="inline-flex items-center gap-2 bg-sky-600 text-white px-6 py-3 rounded-xl hover:bg-sky-700 font-medium"
              >
                Browse QwertyHub
                <ArrowRight className="h-4 w-4" />
              </Link>
              <p className="mt-6 text-sm text-slate-500">
                Need help? <Link href="/support?category=products:cart" className="text-sky-600 hover:underline">Contact support</Link>
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-4 mb-8">
                {items.map((item) => {
                  const lineKey = cartLineKey(item);
                  return (
                  <div
                    key={lineKey}
                    className="bg-white/90 backdrop-blur rounded-2xl border border-slate-100 p-4 flex gap-4 items-center"
                  >
                    <div className="w-20 h-20 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 overflow-hidden">
                      {item.product?.images?.[0] ? (
                        <img src={getImageUrl(item.product.images[0])} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <Package className="h-8 w-8 text-slate-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <Link
                        href={`/marketplace/product/${item.productId}`}
                        className="font-semibold text-slate-900 hover:text-sky-600 truncate block"
                      >
                        {item.product?.title ?? 'Product'}
                      </Link>
                      {(item.selectedSize || item.selectedColor) &&
                        !productIsInstorePickup(item.product || {}) &&
                        !(item.product?.colors?.length || item.product?.sizes?.length) && (
                        <p className="text-xs text-slate-500 mt-0.5">
                          {[item.selectedSize ? `Size ${item.selectedSize}` : null, item.selectedColor ? `Color ${item.selectedColor}` : null]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      )}
                      {!productIsInstorePickup(item.product || {}) &&
                        ((item.product?.colors?.length || 0) > 0 || (item.product?.sizes?.length || 0) > 0) && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {(item.product?.colors?.length || 0) > 0 && (
                            <label className="text-xs text-slate-600">
                              Colour
                              <select
                                value={item.selectedColor || ''}
                                disabled={updating === lineKey}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  if (!v) return;
                                  updateVariant(item, { updateColor: v });
                                }}
                                className={`mt-0.5 block rounded-lg border px-2 py-1.5 text-sm ${
                                  !item.selectedColor ? 'border-amber-400 bg-amber-50' : 'border-slate-200 bg-white'
                                }`}
                              >
                                <option value="">Select colour</option>
                                {(item.product?.colors || []).map((c) => (
                                  <option key={c.name} value={c.name}>
                                    {c.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                          )}
                          {(item.product?.sizes?.length || 0) > 0 && (
                            <label className="text-xs text-slate-600">
                              Size
                              <select
                                value={item.selectedSize || ''}
                                disabled={updating === lineKey}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  if (!v) return;
                                  updateVariant(item, { updateSize: v });
                                }}
                                className={`mt-0.5 block rounded-lg border px-2 py-1.5 text-sm ${
                                  !item.selectedSize ? 'border-amber-400 bg-amber-50' : 'border-slate-200 bg-white'
                                }`}
                              >
                                <option value="">Select size</option>
                                {(item.product?.sizes || []).map((s) => (
                                  <option key={s} value={s}>
                                    {s}
                                  </option>
                                ))}
                              </select>
                            </label>
                          )}
                        </div>
                      )}
                      {(() => {
                        const unit =
                          item.qty > 0 ? item.lineTotal / item.qty : item.product?.price ?? 0;
                        const listUnit = getProductPriceForQty(
                          {
                            price: item.product?.originalPrice ?? item.product?.price ?? 0,
                            discountPrice: item.product?.discountPrice,
                            bulkTiers: item.product?.bulkTiers,
                          },
                          1
                        );
                        const bulkActive = unit < listUnit - 0.001;
                        const fmt =
                          item.product?.currency === 'USD'
                            ? formatInLocal(unit)
                            : formatPriceLocal(unit, item.product?.currency ?? 'ZAR');
                        return (
                          <p className="text-sky-600 font-medium">
                            {fmt} each
                            {bulkActive && (
                              <span className="ml-1 text-xs font-normal text-emerald-700">(bulk price)</span>
                            )}
                          </p>
                        );
                      })()}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => updateQty(item, Math.max(1, item.qty - 1))}
                        disabled={updating === lineKey || item.qty <= 1}
                        className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-50"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="w-8 text-center font-medium">{item.qty}</span>
                      <button
                        type="button"
                        onClick={() => updateQty(item, item.qty + 1)}
                        disabled={updating === lineKey || (item.product?.stock != null && item.qty >= item.product.stock)}
                        className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-50"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                    <p className="font-semibold text-slate-900 w-24 text-right">
                      {item.product?.currency === 'USD' ? formatInLocal(item.lineTotal) : formatPriceLocal(item.lineTotal, item.product?.currency ?? 'ZAR')}
                    </p>
                    <button
                      type="button"
                      onClick={() => remove(item)}
                      disabled={updating === lineKey}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                      aria-label="Remove"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  );
                })}
                {musicItems.map((item) => (
                  <div
                    key={item.songId}
                    className="bg-white/90 backdrop-blur rounded-2xl border border-slate-100 p-4 flex gap-4 items-center"
                  >
                    <div className="w-20 h-20 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 overflow-hidden">
                      {item.song?.artworkUrl ? (
                        <img src={getImageUrl(item.song.artworkUrl)} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <Music2 className="h-8 w-8 text-slate-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-900 truncate">{item.song?.title ?? 'Song'}</p>
                      {item.song?.artist && <p className="text-sm text-slate-600 truncate">{item.song.artist}</p>}
                      <p className="text-sky-600 font-medium">{formatPriceLocal(item.song?.price ?? 0, 'ZAR')} each</p>
                    </div>
                    <p className="font-semibold text-slate-900 w-24 text-right">
                      {formatPriceLocal(item.lineTotal, 'ZAR')}
                    </p>
                    <button
                      type="button"
                      onClick={() => removeMusic(item.songId)}
                      disabled={updating === item.songId}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                      aria-label="Remove"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
              {hasPhysicalProducts && isInstorePickupCart && (
                <div className="bg-orange-50/90 backdrop-blur rounded-2xl border border-orange-200 p-4 sm:p-6 mb-6">
                  <p className="font-semibold text-orange-950">In-store collection</p>
                  <p className="mt-1 text-sm text-orange-900/90">
                    Food and grocery orders are collected from the store. No delivery country or courier is
                    needed — pay with Card or Wallet at checkout.
                  </p>
                </div>
              )}
              {hasPhysicalProducts && !isInstorePickupCart && (
                <div className="bg-white/90 backdrop-blur rounded-2xl border border-slate-100 p-4 sm:p-6 mb-6 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
                      <Truck className="h-4 w-4 text-sky-600" />
                      Delivery country
                    </label>
                    <select
                      value={deliveryCountry}
                      onChange={(e) => handleCountryChange(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-slate-900 focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                    >
                      <option value="ZA">South Africa</option>
                      <option value="BW">Botswana</option>
                      <option value="NA">Namibia</option>
                      <option value="LS">Lesotho</option>
                      <option value="SZ">Eswatini</option>
                      <option value="ZW">Zimbabwe</option>
                      <option value="ZM">Zambia</option>
                      <option value="MZ">Mozambique</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Street address (Line 1) *
                    </label>
                    <input
                      type="text"
                      value={addressLine1}
                      onChange={(e) => setAddressLine1(e.target.value)}
                      placeholder="Street number and name"
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-slate-900 focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                      autoComplete="address-line1"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Apartment / unit (Line 2)
                    </label>
                    <input
                      type="text"
                      value={addressLine2}
                      onChange={(e) => setAddressLine2(e.target.value)}
                      placeholder="Apartment, suite, unit (optional)"
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-slate-900 focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                      autoComplete="address-line2"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        City / town *
                      </label>
                      <input
                        type="text"
                        value={deliveryCity}
                        onChange={(e) => setDeliveryCity(e.target.value)}
                        placeholder="e.g. Hammanskraal, Pretoria"
                        className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-slate-900 focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                        autoComplete="address-level2"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Province / state
                      </label>
                      <input
                        type="text"
                        value={addressState}
                        onChange={(e) => setAddressState(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-slate-900 focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                        autoComplete="address-level1"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Postal code
                    </label>
                    <input
                      type="text"
                      value={addressPostal}
                      onChange={(e) => setAddressPostal(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-slate-900 focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                      autoComplete="postal-code"
                    />
                    <p className="text-xs text-slate-500 mt-1.5">
                      Enter your full delivery address once here. If your area qualifies for seller free shipping,
                      delivery becomes <strong>R 0</strong> — otherwise choose a courier below. Checkout is
                      payment only.
                    </p>
                  </div>
                  {freeLocalDelivery && (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                      <p className="font-semibold">
                        {quote?.freeDeliveryLabel || 'Free delivery'} — R 0
                      </p>
                      <p className="text-emerald-800 mt-0.5">
                        Your address in <strong>{debouncedDeliveryCity}</strong> qualifies for free shipping on
                        this order.
                      </p>
                    </div>
                  )}
                  {checkingFreeDelivery && (
                    <p className="text-sm text-sky-700">Checking free delivery for {debouncedDeliveryCity}…</p>
                  )}
                  {deliveryCountry === 'ZA' && showPaidCourierUi && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Delivery courier
                      </label>
                      <select
                        value={deliveryProvider}
                        onChange={(e) => handleProviderChange(e.target.value as DeliveryProvider)}
                        className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-slate-900 focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                      >
                        <option value="paxi">Paxi</option>
                        <option value="courier-guy">The Courier Guy</option>
                      </select>
                    </div>
                  )}
                  {isNonZaDelivery && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Delivery type
                      </label>
                      {cartIsBwNative && deliveryCountry === 'BW' ? (
                        <p className="text-sm text-slate-600 rounded-xl border border-sky-100 bg-sky-50 px-3 py-2">
                          Local Botswana delivery (Pula). Crossborder applies when ordering from a South
                          African store.
                        </p>
                      ) : (
                        <div className="flex rounded-xl border border-slate-200 p-1 text-sm font-semibold">
                          <button
                            type="button"
                            onClick={() => handleScopeChange('local')}
                            className={`flex-1 rounded-lg px-4 py-2.5 transition-colors ${
                              deliveryScope === 'local'
                                ? 'bg-sky-600 text-white shadow-sm'
                                : 'text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            Local
                          </button>
                          <button
                            type="button"
                            onClick={() => handleScopeChange('crossborder')}
                            className={`flex-1 rounded-lg px-4 py-2.5 transition-colors ${
                              deliveryScope === 'crossborder'
                                ? 'bg-sky-600 text-white shadow-sm'
                                : 'text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            Crossborder
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  {deliveryUiLoading && (
                    <p className="text-sm text-slate-500">Loading delivery options…</p>
                  )}
                  {!deliveryUiLoading && showPaidCourierUi && deliveryCountry === 'ZA' && deliveryProvider === 'paxi' && (
                    <PaxiDeliveryPicker
                      options={deliveryOptions}
                      selectedId={selectedDeliveryId}
                      onSelect={handleDeliverySelect}
                      compact
                    />
                  )}
                  {!deliveryUiLoading && showPaidCourierUi && deliveryCountry === 'ZA' && deliveryProvider === 'courier-guy' && (
                    <CourierGuyDeliveryPicker
                      options={deliveryOptions}
                      selectedId={selectedDeliveryId}
                      onSelect={handleDeliverySelect}
                      compact
                    />
                  )}
                  {!deliveryUiLoading &&
                    deliveryCountry === 'ZA' &&
                    quote?.hasMixedStoreOrigins &&
                    (quote?.crossborderCourierOptions?.length ?? 0) > 0 && (
                      <div className="space-y-2 pt-2 border-t border-slate-200">
                        <p className="text-sm font-medium text-slate-800">
                          International delivery (Botswana shop)
                        </p>
                        <p className="text-xs text-slate-600">
                          South African shops use Paxi above. Shops in Botswana need a cross-border
                          courier — Paxi does not collect there.
                        </p>
                        <SadcDeliveryPicker
                          options={(quote.crossborderCourierOptions || []).map((o) => ({
                            key: o.tariffId || o.key,
                            tariffId: o.tariffId,
                            providerName: o.providerName,
                            serviceLabel: o.serviceLabel,
                            zone: o.zone,
                            priceZar: o.priceZar,
                            minDeliveryDays: o.minDeliveryDays,
                            maxDeliveryDays: o.maxDeliveryDays,
                          }))}
                          selectedId={selectedCrossborderId}
                          onSelect={handleCrossborderSelect}
                          scope="crossborder"
                          displayCurrency="ZAR"
                          compact
                        />
                      </div>
                    )}
                  {!deliveryUiLoading && showPaidCourierUi && isNonZaDelivery && (
                    <SadcDeliveryPicker
                      options={deliveryOptions}
                      selectedId={selectedDeliveryId}
                      onSelect={handleDeliverySelect}
                      scope={deliveryScope}
                      displayCurrency={sadcDisplayCurrency}
                      compact
                    />
                  )}
                  {sadcScopeEmpty && (
                    <p className="text-sm text-amber-800">
                      {deliveryScope === 'local'
                        ? 'No local couriers are configured for this country yet — try Crossborder.'
                        : 'Crossborder delivery options could not be loaded.'}
                    </p>
                  )}
                  {awaitingTariffId && (
                    <p className="text-sm text-slate-500">Confirming delivery rate…</p>
                  )}
                  {quoteError && (
                    <p className="text-sm text-red-700">{quoteError}</p>
                  )}
                  {!deliveryUiLoading && !quoteError && hasPhysicalProducts && !hasCourierOptions && !sadcScopeEmpty && (
                    <div className="text-sm text-amber-800 space-y-2">
                      <p>Delivery options could not be loaded.</p>
                      <button
                        type="button"
                        onClick={() => hydrateDeliveryTariffIds()}
                        className="text-sky-700 font-medium hover:underline"
                      >
                        Try again
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className="bg-white/90 backdrop-blur rounded-2xl border border-slate-100 p-6">
                <div className="flex flex-col gap-2 mb-4">
                  <div className="flex justify-between text-slate-600">
                    <span>Subtotal ({lineItemCount} item{lineItemCount !== 1 ? 's' : ''})</span>
                    <span className="font-medium text-slate-900">
                      {items.some((i) => i.product?.currency === 'USD')
                        ? formatInLocal(subtotal)
                        : formatPriceLocal(subtotal, cartDisplayCurrency)}
                    </span>
                  </div>
                  {hasPhysicalProducts && !isInstorePickupCart && (
                    deliveryUiLoading && !hasCourierOptions ? (
                      <div className="flex justify-between text-slate-500 text-sm">Calculating delivery...</div>
                    ) : needsCourierChoice && !selectedDeliveryId && hasDeliveryLocality ? (
                      <div className="flex justify-between text-amber-800 text-sm">
                        <span>Delivery</span>
                        <span className="font-medium text-right">
                          {quote?.shippingEstimateMinZar != null && quote.shippingEstimateMinZar > 0
                            ? `From ${formatPriceLocal(quote.shippingEstimateMinZar, quote.currency || sadcDisplayCurrency)} — select method`
                            : 'Select delivery method above'}
                        </span>
                      </div>
                    ) : !hasDeliveryLocality && hasPhysicalProducts ? (
                      <div className="flex justify-between text-amber-800 text-sm">
                        <span>Delivery</span>
                        <span className="font-medium text-right">Enter town above</span>
                      </div>
                    ) : quote?.warehouseFreeLocalApplied ? (
                      <div className="flex justify-between text-emerald-800">
                        <span>Delivery</span>
                        <span className="font-medium">Free</span>
                      </div>
                    ) : quote && quote.shipping > 0 ? (
                      <div className="flex justify-between text-slate-600">
                        <span>Delivery</span>
                        <span className="font-medium text-slate-900">
                          {formatPriceLocal(quote.shipping, quote.currency || sadcDisplayCurrency)}
                        </span>
                      </div>
                    ) : quote && !needsCourierChoice ? (
                      <div className="flex justify-between text-slate-600">
                        <span>Delivery</span>
                        <span className="font-medium text-amber-800 text-sm">Calculating…</span>
                      </div>
                    ) : null
                  )}
                  {isInstorePickupCart && (
                    <div className="flex justify-between text-slate-600">
                      <span>Collection</span>
                      <span className="font-medium text-emerald-700">In-store · R 0</span>
                    </div>
                  )}
                  {quote && (canProceedToCheckout || !hasPhysicalProducts || isInstorePickupCart) && (
                    <div className="flex justify-between text-base font-bold text-slate-900 pt-2 border-t border-slate-200">
                      <span>Total</span>
                      <span>
                        {formatPriceLocal(
                          isInstorePickupCart || (hasPhysicalProducts && canProceedToCheckout)
                            ? quote.total
                            : subtotal,
                          quote?.currency || cartDisplayCurrency
                        )}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex flex-col sm:flex-row gap-2 items-center">
                  {canProceedToCheckout ? (
                    <Link
                      href={checkoutHref}
                      className="inline-flex items-center gap-2 bg-sky-600 text-white px-6 py-3 rounded-xl hover:bg-sky-700 font-medium"
                    >
                      Proceed to checkout
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  ) : (
                    <button
                      type="button"
                      disabled
                      className="inline-flex items-center gap-2 bg-slate-300 text-slate-600 px-6 py-3 rounded-xl font-medium cursor-not-allowed"
                      title={needsCourierChoice ? 'Select a delivery method first' : 'Delivery is required'}
                    >
                      Proceed to checkout
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  )}
                  {needsCourierChoice && !selectedDeliveryId && hasDeliveryLocality && (
                    <p className="text-sm text-amber-800">Choose delivery above to continue.</p>
                  )}
                  {!variantsComplete && (
                    <p className="text-sm text-amber-800">Choose colour and size for each product above.</p>
                  )}
                  {!isInstorePickupCart && !fullAddressComplete && hasPhysicalProducts && variantsComplete && (
                    <p className="text-sm text-amber-800">Enter your full delivery address above.</p>
                  )}
                  {!isInstorePickupCart && fullAddressComplete && !hasDeliveryLocality && hasPhysicalProducts && (
                    <p className="text-sm text-amber-800">Enter your delivery city/town to check rates.</p>
                  )}
                  {needsCrossborderChoice && (
                    <p className="text-sm text-amber-800">
                      Choose international delivery for the Botswana shop to continue.
                    </p>
                  )}
                </div>
              </div>
              <p className="mt-4 text-center text-sm text-slate-500">
                Need help? <Link href="/support?category=products:cart" className="text-sky-600 hover:underline">Contact support</Link>
              </p>
            </>
          )}
          </main>
          <AdvertSlot belowHeader />
        </div>
      </div>
      <MobileBottomNav cartCount={cartCount} hasStore={hasStore} />
    </div>
  );
}

export default function CartPage() {
  return (
    <ProtectedRoute>
      <CartPageContent />
    </ProtectedRoute>
  );
}
