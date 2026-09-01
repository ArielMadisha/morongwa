'use client';

import { Suspense, useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { CreditCard, Wallet, MapPin, ArrowLeft, Loader2, ShoppingBag, Landmark, Smartphone } from 'lucide-react';
import { checkoutAPI, walletAPI } from '@/lib/api';
import ProtectedRoute from '@/components/ProtectedRoute';
import { CourierDeliveryPicker } from '@/components/CourierDeliveryPicker';
import { SadcDeliveryPicker } from '@/components/SadcDeliveryPicker';
import { useAuth } from '@/contexts/AuthContext';
import { useCartAndStores } from '@/lib/useCartAndStores';
import { AppSidebar, AppSidebarMenuButton } from '@/components/AppSidebar';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { SearchButton } from '@/components/SearchButton';
import toast from 'react-hot-toast';
import { formatCurrencyAmount } from '@/lib/formatCurrency';
import { openPayGatePayment } from '@/lib/payGateRedirect';
import {
  buildDeliveryAddressText,
  isFullDeliveryAddressComplete,
  readCartDeliveryAddress,
} from '@/lib/cartDeliveryAddress';

function formatCheckoutAmount(price: number, currency: string) {
  return formatCurrencyAmount(price, currency || 'ZAR');
}

function formatCreditAmount(value: number) {
  const safe = Math.max(0, value || 0);
  return `R${safe.toFixed(0)}`;
}

function isZaOnlyCourier(slug?: string) {
  const s = String(slug || '').toLowerCase();
  return s === 'paxi' || s === 'courier-guy' || s === 'pudo';
}

function CheckoutPageContent() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialCountry = (searchParams.get('deliveryCountry') || 'ZA').toUpperCase();
  const initialScope = searchParams.get('deliveryScope') === 'local' ? 'local' : 'crossborder';
  const initialTariff = searchParams.get('courierTariffId') || undefined;
  const deliveryReadyFromCart = searchParams.get('deliveryReady') === '1';
  const [menuOpen, setMenuOpen] = useState(false);
  const { cartCount, hasStore } = useCartAndStores(!!user);
  const [quote, setQuote] = useState<{
    subtotal: number;
    shipping: number;
    shippingBreakdown?: Array<{ supplierId: string; storeName?: string; shippingCost: number }>;
    shippingQuoteType?: 'live_quote' | 'configured_tariff' | 'configured_courier';
    shippingNote?: string;
    total: number;
    currency: string;
    itemCount: number;
    paymentBreakdown?: Array<{ productId: string; title: string; price: number; qty: number }>;
    courierOptions?: Array<{
      tariffId: string;
      providerName: string;
      providerSlug?: string;
      serviceLabel: string;
      zone?: string;
      priceZar: number;
      minDeliveryDays: number;
      maxDeliveryDays: number;
    }>;
    selectedCourier?: {
      tariffId: string;
      providerName: string;
      serviceLabel: string;
      priceZar?: number;
      minDeliveryDays?: number;
      maxDeliveryDays?: number;
    } | null;
    requiresCourierSelection?: boolean;
    hasMixedStoreOrigins?: boolean;
    requiresCrossborderCourierSelection?: boolean;
    crossborderCourierOptions?: Array<{
      tariffId: string;
      providerName: string;
      serviceLabel: string;
      zone?: string;
      priceZar: number;
      minDeliveryDays: number;
      maxDeliveryDays: number;
    }>;
    courierDeliveryZar?: number;
    otherShippingZar?: number;
    readyForPayment?: boolean;
    warehouseFreeLocalApplied?: boolean;
    payOnceTotal?: number;
    totalZarForPayment?: number;
    quoteInNativeCurrency?: boolean;
    foodPickup?: boolean;
    deliveryMethodHint?: string;
  } | null>(null);
  const [courierTariffId, setCourierTariffId] = useState<string | undefined>(initialTariff);
  const [crossborderCourierTariffId, setCrossborderCourierTariffId] = useState<string | undefined>(
    searchParams.get('crossborderCourierTariffId') || undefined
  );
  const [deliveryScope, setDeliveryScope] = useState<'local' | 'crossborder'>(initialScope);
  const [courierSort, setCourierSort] = useState<'price' | 'speed'>('price');
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [addressCity, setAddressCity] = useState('');
  const [addressState, setAddressState] = useState('');
  const [addressPostal, setAddressPostal] = useState('');
  const [deliveryCountry, setDeliveryCountry] = useState(
    ['ZA', 'BW', 'NA', 'LS', 'SZ', 'ZW', 'ZM', 'MZ'].includes(initialCountry) ? initialCountry : 'ZA'
  );
  const deliveryAddress = useMemo(
    () =>
      buildDeliveryAddressText({
        line1: addressLine1,
        line2: addressLine2,
        city: addressCity,
        state: addressState,
        postal: addressPostal,
        country: deliveryCountry,
      }),
    [addressLine1, addressLine2, addressCity, addressState, addressPostal, deliveryCountry]
  );
  const [paymentMethod, setPaymentMethod] = useState<'wallet' | 'card' | 'eft' | 'orange_money'>('card');
  const [paymentDefaultApplied, setPaymentDefaultApplied] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const [quoteRefreshing, setQuoteRefreshing] = useState(false);
  const [paying, setPaying] = useState(false);
  const [quoteLoadError, setQuoteLoadError] = useState<string | null>(null);
  const hasLoadedQuoteRef = useRef(false);

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  useEffect(() => {
    let cancelled = false;
    const isRefresh = hasLoadedQuoteRef.current;
    if (isRefresh) setQuoteRefreshing(true);

    checkoutAPI
      .quote({
        deliveryCountry,
        deliveryAddress,
        deliveryCity: addressCity,
        courierTariffId,
        crossborderCourierTariffId,
        deliveryScope,
      })
      .then((res) => {
        if (cancelled) return;
        const d = res.data?.data ?? res.data;
        setQuote(d ?? null);
        setQuoteLoadError(null);
        if (d?.quoteInNativeCurrency && d?.currency === 'BWP') {
          setDeliveryCountry('BW');
          setDeliveryScope('local');
        } else if (d?.suggestedDeliveryScope === 'local' && deliveryCountry === 'BW') {
          setDeliveryScope('local');
        }
        if (d?.selectedCourier?.tariffId) {
          setCourierTariffId(d.selectedCourier.tariffId);
        } else if (
          courierTariffId &&
          d?.courierOptions?.some((o: { tariffId: string }) => o.tariffId === courierTariffId)
        ) {
          /* keep cart selection */
        } else if (courierTariffId && deliveryCountry !== 'ZA') {
          /* BW/SADC tariff from cart — keep until quote confirms */
        } else if (!courierTariffId && d?.selectedCourier?.tariffId) {
          setCourierTariffId(d.selectedCourier.tariffId);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const e = err as { response?: { data?: { error?: string; message?: string } } };
        setQuote(null);
        setQuoteLoadError(
          e?.response?.data?.error ||
            e?.response?.data?.message ||
            'Could not load checkout. Open your cart and try again.'
        );
      })
      .finally(() => {
        if (cancelled) return;
        hasLoadedQuoteRef.current = true;
        setInitialLoad(false);
        setQuoteRefreshing(false);
      });

    walletAPI
      .getBalance()
      .then((res) => {
        if (cancelled) return;
        const b = res.data?.balance ?? res.data ?? 0;
        setWalletBalance(typeof b === 'number' ? b : 0);
      })
      .catch(() => {
        if (!cancelled) setWalletBalance(0);
      });

    return () => {
      cancelled = true;
    };
  }, [
    deliveryCountry,
    courierTariffId,
    crossborderCourierTariffId,
    deliveryScope,
    deliveryAddress,
    addressCity,
  ]);

  useEffect(() => {
    if (!quote?.foodPickup) return;
    if (paymentMethod === 'eft' || paymentMethod === 'orange_money') {
      setPaymentMethod(walletBalance != null && walletBalance > 0 ? 'wallet' : 'card');
    }
  }, [quote?.foodPickup, paymentMethod, walletBalance]);

  useEffect(() => {
    if (paymentDefaultApplied) return;
    if (walletBalance == null || !quote) return;
    const pm = searchParams.get('pm');
    if (pm === 'card' || pm === 'eft' || pm === 'orange_money' || pm === 'wallet') {
      setPaymentDefaultApplied(true);
      return;
    }
    const total =
      quote.totalZarForPayment != null && Number.isFinite(quote.totalZarForPayment)
        ? quote.totalZarForPayment
        : quote.total;
    if (walletBalance <= 0 || walletBalance < total) {
      setPaymentMethod('card');
    } else {
      setPaymentMethod('wallet');
    }
    setPaymentDefaultApplied(true);
  }, [walletBalance, quote, paymentDefaultApplied, searchParams]);

  useEffect(() => {
    const pm = searchParams.get('pm');
    if (pm === 'card') setPaymentMethod('card');
    if (pm === 'eft') setPaymentMethod('eft');
    if (pm === 'orange_money') setPaymentMethod('orange_money');
    if (pm === 'wallet') setPaymentMethod('wallet');
    const cc = searchParams.get('deliveryCountry');
    if (cc) {
      const up = cc.toUpperCase();
      if (['ZA', 'BW', 'NA', 'LS', 'SZ', 'ZW', 'ZM', 'MZ'].includes(up)) setDeliveryCountry(up);
    }
    const ct = searchParams.get('courierTariffId');
    if (ct) setCourierTariffId(ct);
    const ds = searchParams.get('deliveryScope');
    if (ds === 'local' || ds === 'crossborder') setDeliveryScope(ds);
    const cityFromCart = searchParams.get('deliveryCity');
    if (cityFromCart) setAddressCity(cityFromCart);
    const l1 = searchParams.get('addressLine1');
    if (l1) setAddressLine1(l1);
    const l2 = searchParams.get('addressLine2');
    if (l2) setAddressLine2(l2);
    const st = searchParams.get('addressState');
    if (st) setAddressState(st);
    const pc = searchParams.get('addressPostal');
    if (pc) setAddressPostal(pc);
  }, [searchParams]);

  useEffect(() => {
    try {
      const saved = readCartDeliveryAddress();
      if (!saved) return;
      if (!addressLine1.trim() && saved.line1) setAddressLine1(saved.line1);
      if (!addressLine2.trim() && saved.line2) setAddressLine2(saved.line2);
      if (!addressCity.trim() && saved.city) setAddressCity(saved.city);
      if (!addressState.trim() && saved.state) setAddressState(saved.state);
      if (!addressPostal.trim() && saved.postal) setAddressPostal(saved.postal);
      if (saved.country && ['ZA', 'BW', 'NA', 'LS', 'SZ', 'ZW', 'ZM', 'MZ'].includes(saved.country)) {
        setDeliveryCountry(saved.country);
      }
    } catch {
      /* ignore */
    }
  }, [addressLine1, addressLine2, addressCity, addressState, addressPostal]);

  const checkoutCurrency = quote?.currency || 'ZAR';
  const isNonZaDelivery = deliveryCountry !== 'ZA';
  const sadcDisplayCurrency =
    deliveryCountry === 'BW' && deliveryScope === 'local' && quote?.quoteInNativeCurrency
      ? 'BWP'
      : 'ZAR';
  const visibleCourierOptions = useMemo(() => {
    const opts = quote?.courierOptions ?? [];
    if (deliveryCountry === 'ZA') {
      return opts.filter((o) => isZaOnlyCourier(o.providerSlug) || !o.providerSlug);
    }
    return opts.filter((o) => !isZaOnlyCourier(o.providerSlug));
  }, [quote?.courierOptions, deliveryCountry]);
  const deliveryPreselectedFromCart = Boolean(initialTariff && courierTariffId === initialTariff);
  const addressLockedFromCart =
    !quote?.foodPickup &&
    deliveryReadyFromCart &&
    isFullDeliveryAddressComplete({
      line1: addressLine1,
      line2: addressLine2,
      city: addressCity,
      state: addressState,
      postal: addressPostal,
      country: deliveryCountry,
    }) &&
    (deliveryPreselectedFromCart || !!quote?.warehouseFreeLocalApplied || !!courierTariffId);
  const showCourierPicker =
    !quote?.foodPickup &&
    !addressLockedFromCart &&
    visibleCourierOptions.length > 0 &&
    !(deliveryPreselectedFromCart && quote?.selectedCourier);
  const walletCompareTotal =
    quote?.totalZarForPayment != null && Number.isFinite(quote.totalZarForPayment)
      ? quote.totalZarForPayment
      : quote?.total ?? 0;

  const needsCourierChoice =
    !quote?.foodPickup &&
    !addressLockedFromCart &&
    !!quote?.requiresCourierSelection &&
    visibleCourierOptions.length > 0;
  const needsCrossborderChoice =
    !quote?.foodPickup &&
    !addressLockedFromCart &&
    !!quote?.hasMixedStoreOrigins &&
    !!quote?.requiresCrossborderCourierSelection &&
    (quote?.crossborderCourierOptions?.length ?? 0) > 0 &&
    !crossborderCourierTariffId;
  const courierChoiceComplete =
    (!needsCourierChoice || !!courierTariffId) && !needsCrossborderChoice;
  const perStoreShippingLines =
    quote?.shippingBreakdown?.filter(
      (b) => b.supplierId.startsWith('store:') || b.supplierId.startsWith('supplier:')
    ) ?? [];
  const showPerStoreShipping = perStoreShippingLines.length > 1;

  const selectedCourierLabel = useMemo(() => {
    if (quote?.selectedCourier) {
      const c = quote.selectedCourier;
      return `${c.providerName} — ${c.serviceLabel}`;
    }
    const found = quote?.courierOptions?.find((o) => o.tariffId === courierTariffId);
    if (found) return `${found.providerName} — ${found.serviceLabel}`;
    return null;
  }, [quote, courierTariffId]);

  const handlePay = () => {
    if (!quote) return;
    const foodPickup = !!quote.foodPickup;
    if (!foodPickup && (!addressLine1.trim() || !addressCity.trim())) {
      toast.error('Street address and city are required');
      return;
    }
    if (!foodPickup && needsCourierChoice && !courierTariffId && !quote?.warehouseFreeLocalApplied) {
      toast.error('Please choose a delivery method that suits you');
      return;
    }
    if (!foodPickup && needsCrossborderChoice) {
      toast.error('Please choose international delivery for the Botswana shop');
      return;
    }
    setPaying(true);
    const payAddress = foodPickup
      ? 'Customer collection (food pickup)'
      : deliveryAddress;
    checkoutAPI
      .pay(
        paymentMethod,
        payAddress,
        foodPickup ? 'ZA' : deliveryCountry,
        foodPickup ? undefined : courierTariffId,
        foodPickup ? 'local' : deliveryScope,
        foodPickup ? undefined : crossborderCourierTariffId,
        foodPickup ? 'Collection' : addressCity
      )
      .then((res) => {
      const d = res.data?.data ?? res.data;
      if (d?.paymentUrl || d?.payGateRedirect) {
        openPayGatePayment({ paymentUrl: d.paymentUrl, payGateRedirect: d.payGateRedirect });
        return;
      }
      if (d?.status === 'pending_payment' && d?.paymentMethod === 'eft' && d?.orderId) {
        toast.success(d?.message || 'EFT instructions sent to Messenger');
        window.location.href = `/checkout/order/${d.orderId}`;
        return;
      }
      if (d?.status === 'pending_payment' && d?.paymentMethod === 'orange_money' && d?.orderId) {
        toast.success(d?.message || 'Orange Money instructions sent to Messenger');
        window.location.href = `/checkout/order/${d.orderId}`;
        return;
      }
      if (d?.status === 'paid') {
        toast.success(d?.message || 'Payment complete');
        if (d?.orderId) window.location.href = `/checkout/order/${d.orderId}`;
        else window.location.href = '/cart';
      }
    }).catch((err) => {
      const status = Number(err?.response?.status || 0);
      const backendMessage = err?.response?.data?.error || err?.response?.data?.message;
      if (status === 502) {
        toast.error(backendMessage || 'Card gateway is unavailable right now. Please try again shortly or use wallet.');
      } else {
        toast.error(backendMessage || err.message || 'Payment failed');
      }
      setPaying(false);
    });
  };

  if (initialLoad && !quote) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gradient-to-br from-sky-50 to-white flex items-center justify-center">
          <Loader2 className="h-12 w-12 text-sky-600 animate-spin" />
        </div>
      </ProtectedRoute>
    );
  }

  if (!quote) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gradient-to-br from-sky-50 to-white flex items-center justify-center">
          <div className="text-center max-w-md px-4">
            <p className="text-slate-600 mb-4">
              {quoteLoadError || 'Cart empty or invalid.'}
            </p>
            <Link href="/cart" className="text-sky-600 hover:text-sky-700 font-medium">
              Back to cart
            </Link>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  const canPayWallet = walletBalance != null && walletCompareTotal <= walletBalance;
  const showZaEftOption =
    !quote?.foodPickup &&
    deliveryCountry === 'ZA' &&
    !quote?.quoteInNativeCurrency &&
    checkoutCurrency === 'ZAR';
  const showBwEftOption = !quote?.foodPickup && deliveryCountry === 'BW';
  const showEftOption = showZaEftOption || showBwEftOption;
  const showOrangeMoneyOption = !quote?.foodPickup && deliveryCountry === 'BW';
  const canSubmitPay = courierChoiceComplete && !paying;
  const walletStatusText =
    walletBalance == null || walletBalance <= 0
      ? 'Load Wallet - R0'
      : walletBalance < 50
      ? `Balance Low - ${formatCreditAmount(walletBalance)}`
      : formatCreditAmount(walletBalance);

  return (
    <ProtectedRoute>
      <div className="min-h-screen flex flex-col bg-gradient-to-br from-sky-50 via-blue-50 to-white text-slate-900">
        <header className="sticky top-0 z-40 w-full bg-white/95 backdrop-blur-md border-b border-slate-100 shadow-sm flex-shrink-0">
          <div className="px-4 sm:px-6 lg:px-8 py-3 sm:py-4">
            <div className="flex items-center justify-between gap-3 sm:gap-4 min-w-0">
              <Link href="/wall" className="shrink-0 flex items-center" aria-label="Home">
                <img src="/qwertymates-logo-icon.png" alt="Qwertymates" className="h-16 w-16 sm:h-[4.25rem] sm:w-[4.25rem] object-contain lg:hidden shrink-0" />
                <img src="/qwertymates-logo.png" alt="Qwertymates" className="h-9 w-auto object-contain hidden lg:block" />
              </Link>
              <AppSidebarMenuButton onClick={() => setMenuOpen((v) => !v)} />
              <div className="flex items-center gap-2 min-w-0 shrink-0">
                <div className="h-8 w-8 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
                  <ShoppingBag className="h-4 w-4 text-brand-600" />
                </div>
                <h1 className="text-base sm:text-lg font-semibold text-slate-900 truncate">Checkout</h1>
              </div>
              <div className="flex-1 min-w-0" />
              <SearchButton />
            </div>
          </div>
        </header>
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
          <div className="flex-1 flex flex-col lg:flex-row gap-0 min-h-0 overflow-y-auto overflow-x-hidden">
            <main className="flex-1 min-w-0 max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 md:pb-6 order-2 lg:order-none w-full">
          <Link href="/cart" className="inline-flex items-center gap-2 text-sky-600 hover:text-sky-700 mb-6 text-sm font-medium"><ArrowLeft className="h-4 w-4" /> Back to cart</Link>
          <h1 className="text-2xl font-bold text-slate-900 mb-6">Checkout</h1>
          {quoteRefreshing && (
            <p className="mb-4 inline-flex items-center gap-2 text-sm text-sky-700">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Updating delivery quote…
            </p>
          )}
          <div className="space-y-6 mb-8">
            {quote?.foodPickup ? (
              <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-950">
                <p className="font-semibold">Customer collection</p>
                <p className="mt-1 text-orange-900/90">
                  Food and grocery orders are collected from the store. Pay with Wallet or Card — no courier
                  delivery.
                </p>
              </div>
            ) : addressLockedFromCart ? (
              <div className="rounded-xl border border-sky-200 bg-sky-50/80 px-4 py-3 text-sm text-sky-950">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-sky-600 shrink-0" />
                      Delivery from your cart
                    </p>
                    <p className="mt-2 whitespace-pre-line text-sky-900/90">{deliveryAddress}</p>
                    {(selectedCourierLabel || quote?.warehouseFreeLocalApplied) && (
                      <p className="mt-2 text-sky-800">
                        {quote?.warehouseFreeLocalApplied
                          ? 'Free delivery'
                          : selectedCourierLabel}
                      </p>
                    )}
                  </div>
                  <Link href="/cart" className="shrink-0 text-sky-700 font-medium hover:underline">
                    Change
                  </Link>
                </div>
              </div>
            ) : (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-2"><MapPin className="h-4 w-4" /> Delivery address</label>
              <div className="mb-3">
                <label className="block text-xs text-slate-500 mb-1">Country</label>
                <select
                  value={deliveryCountry}
                  onChange={(e) => {
                    const cc = e.target.value;
                    setDeliveryCountry(cc);
                    setCourierTariffId(undefined);
                    if (cc === 'BW' && quote?.quoteInNativeCurrency) {
                      setDeliveryScope('local');
                    } else if (cc !== 'ZA') {
                      setDeliveryScope('crossborder');
                    }
                  }}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
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
              {quote?.quoteInNativeCurrency && deliveryCountry === 'BW' && (
                <p className="mb-3 text-sm text-sky-800 rounded-xl border border-sky-100 bg-sky-50 px-3 py-2">
                  Local Botswana delivery (Pula). South African couriers such as PAXI are not used for this order.
                </p>
              )}
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Street address (Line 1) *</label>
                  <input
                    type="text"
                    value={addressLine1}
                    onChange={(e) => setAddressLine1(e.target.value)}
                    placeholder="Street number and name"
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Apartment / unit (Line 2)</label>
                  <input
                    type="text"
                    value={addressLine2}
                    onChange={(e) => setAddressLine2(e.target.value)}
                    placeholder="Apartment, suite, unit (optional)"
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">City *</label>
                    <input
                      type="text"
                      value={addressCity}
                      onChange={(e) => setAddressCity(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">State / Province</label>
                    <input
                      type="text"
                      value={addressState}
                      onChange={(e) => setAddressState(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                    />
                  </div>
            </div>
            <div>
                  <label className="block text-xs text-slate-500 mb-1">Postal / ZIP code</label>
                  <input
                    type="text"
                    value={addressPostal}
                    onChange={(e) => setAddressPostal(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                  />
                </div>
              </div>
            </div>
            )}

            {quote?.warehouseFreeLocalApplied && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-4 text-sm">
                <p className="font-semibold text-emerald-900">Free delivery</p>
                <p className="text-emerald-800 mt-1">
                  Your delivery area
                  {addressCity.trim() ? (
                    <>
                      {' '}
                      (<strong>{addressCity.trim()}</strong>)
                    </>
                  ) : null}{' '}
                  qualifies for free shipping on this order. No courier fee is charged.
                </p>
              </div>
            )}

            {deliveryPreselectedFromCart && quote?.selectedCourier && !quote?.warehouseFreeLocalApplied && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-4 text-sm">
                <p className="font-semibold text-emerald-900">Delivery method from cart</p>
                <p className="text-emerald-800 mt-1">
                  {quote.selectedCourier.providerName} — {quote.selectedCourier.serviceLabel}
                  {' · '}
                  {formatCheckoutAmount(quote.courierDeliveryZar ?? quote.shipping, checkoutCurrency)}
                </p>
                <Link href="/cart" className="text-sky-700 text-xs font-medium hover:underline mt-2 inline-block">
                  Change on cart
                </Link>
              </div>
            )}

            {showCourierPicker && deliveryCountry === 'ZA' && (
              <CourierDeliveryPicker
                options={visibleCourierOptions}
                selectedTariffId={courierTariffId}
                onSelect={setCourierTariffId}
                sort={courierSort}
                onSortChange={setCourierSort}
                courierDeliveryZar={quote.courierDeliveryZar}
                currency={checkoutCurrency}
              />
            )}

            {deliveryCountry === 'ZA' &&
              quote?.hasMixedStoreOrigins &&
              (quote?.crossborderCourierOptions?.length ?? 0) > 0 && (
                <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-4 space-y-3">
                  <div>
                    <p className="font-semibold text-slate-900">International delivery (Botswana shop)</p>
                    <p className="text-sm text-slate-600 mt-1">
                      South African items use Paxi. Your Botswana shop items ship via cross-border
                      freight — select a provider below.
                    </p>
                    </div>
                  <SadcDeliveryPicker
                    options={(quote.crossborderCourierOptions || []).map((o) => ({
                      key: o.tariffId,
                      tariffId: o.tariffId,
                      providerName: o.providerName,
                      serviceLabel: o.serviceLabel,
                      zone: o.zone,
                      priceZar: o.priceZar,
                      minDeliveryDays: o.minDeliveryDays,
                      maxDeliveryDays: o.maxDeliveryDays,
                    }))}
                    selectedId={
                      crossborderCourierTariffId
                        ? quote.crossborderCourierOptions?.find(
                            (o) => o.tariffId === crossborderCourierTariffId
                          )?.tariffId
                        : undefined
                    }
                    onSelect={(_id, tariffId) => setCrossborderCourierTariffId(tariffId || _id)}
                    scope="crossborder"
                    displayCurrency="ZAR"
                  />
                </div>
              )}

            {showCourierPicker && isNonZaDelivery && (
              <SadcDeliveryPicker
                options={visibleCourierOptions.map((o) => ({
                  key: o.tariffId,
                  tariffId: o.tariffId,
                  providerName: o.providerName,
                  serviceLabel: o.serviceLabel,
                  zone: o.zone,
                  priceZar: o.priceZar,
                  minDeliveryDays: o.minDeliveryDays,
                  maxDeliveryDays: o.maxDeliveryDays,
                }))}
                selectedId={
                  courierTariffId
                    ? visibleCourierOptions.find((o) => o.tariffId === courierTariffId)?.tariffId
                    : undefined
                }
                onSelect={(_id, tariffId) => setCourierTariffId(tariffId || _id)}
                scope={deliveryScope}
                displayCurrency={sadcDisplayCurrency}
              />
            )}

            {showPerStoreShipping && (courierTariffId || crossborderCourierTariffId) && (
              <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
                <p className="font-semibold text-slate-900 mb-2">Delivery charge per store</p>
                <ul className="space-y-1.5">
                  {perStoreShippingLines.map((line) => (
                    <li key={line.supplierId} className="flex justify-between gap-3 text-slate-700">
                      <span className="min-w-0 truncate">{line.storeName || 'Store'}</span>
                      <span className="shrink-0 font-medium tabular-nums">
                        {formatCheckoutAmount(line.shippingCost, checkoutCurrency)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {courierChoiceComplete ? (
              <>
                <div className="rounded-2xl border-2 border-emerald-200 bg-gradient-to-br from-emerald-50/80 to-white p-5 shadow-sm">
                  <h2 className="text-lg font-semibold text-slate-900 mb-1">
                    {quote.foodPickup ? 'Pay for collection' : 'Pay once at checkout'}
                  </h2>
                  <p className="text-sm text-slate-600 mb-4">
                    {quote.foodPickup
                      ? 'Pay with Wallet or Card, then collect your order from the store. No courier delivery.'
                      : 'One payment covers your products and delivery. Qwertymates does not ask you to pay courier fees later — you will not be contacted to pay delivery separately.'}
                  </p>

                  {quote.paymentBreakdown && quote.paymentBreakdown.length > 0 && (
                    <div className="mb-3 space-y-1.5 text-sm border-b border-slate-200/80 pb-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Products</p>
                      {quote.paymentBreakdown.map((b, i) => (
                        <div key={b.productId || i} className="flex justify-between text-slate-800">
                          <span className="pr-2">
                            {b.title}
                            {b.qty > 1 ? ` ×${b.qty}` : ''}
                          </span>
                          <span className="shrink-0 font-medium">
                            {formatCheckoutAmount(b.price * b.qty, checkoutCurrency)}
                          </span>
                        </div>
                      ))}
                      <div className="flex justify-between text-base font-bold text-slate-900 pt-1">
                        <span>Products subtotal</span>
                        <span>{formatCheckoutAmount(quote.subtotal, checkoutCurrency)}</span>
                      </div>
                    </div>
                  )}

                  <div className="space-y-1.5 text-sm mb-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Delivery & shipping</p>
                    {courierTariffId && (quote.courierDeliveryZar ?? 0) > 0 && (
                      <div className="flex justify-between text-slate-800">
                        <span className="pr-2 max-w-[70%]">
                          Courier ({selectedCourierLabel})
                        </span>
                        <span className="shrink-0 font-medium">
                          {formatCheckoutAmount(quote.courierDeliveryZar ?? 0, checkoutCurrency)}
                        </span>
                      </div>
                    )}
                    {(quote.otherShippingZar ?? 0) > 0 && (
                      <div className="flex justify-between text-slate-800">
                        <span>Import / other shipping</span>
                        <span className="font-medium">
                          {formatCheckoutAmount(quote.otherShippingZar ?? 0, checkoutCurrency)}
                        </span>
                      </div>
                    )}
                    {!courierTariffId && quote.shipping > 0 && (
                      <div className="flex justify-between text-slate-800">
                        <span>Shipping</span>
                        <span className="font-medium">{formatCheckoutAmount(quote.shipping, checkoutCurrency)}</span>
                      </div>
                    )}
                    {quote.shipping > 0 && (
                      <div className="flex justify-between text-base font-bold text-slate-900 pt-1 border-t border-slate-200/80">
                        <span>Delivery & shipping total</span>
                        <span>{formatCheckoutAmount(quote.shipping, checkoutCurrency)}</span>
                      </div>
                    )}
                  </div>

                  <div className="rounded-xl bg-slate-900 text-white px-4 py-4 flex justify-between items-center">
                    <div>
                      <p className="text-xs text-slate-300 uppercase tracking-wide">Amount due now</p>
                      <p className="text-sm text-slate-200 mt-0.5">
                        {quote.foodPickup ? 'Collection order · Wallet or Card' : 'Products + delivery together'}
                      </p>
                    </div>
                    <p className="text-2xl font-bold tabular-nums">
                      {formatCheckoutAmount(quote.total, checkoutCurrency)}
                    </p>
                  </div>
                  <p className="text-xs text-slate-500 mt-3">
                    {quote.quoteInNativeCurrency
                      ? `Totals are in Botswana Pula (BWP). When you pay by card, the amount is converted to South African Rand (ZAR) for PayGate only.`
                      : `Totals are in South African Rand (ZAR). Crossborder delivery from South African stores is quoted in ZAR.`}
                  </p>
                </div>

                <div>
                  <p className="text-sm font-medium text-slate-700 mb-3">How do you want to pay?</p>
                  <label
                    className="flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer mb-3"
                    style={{ borderColor: paymentMethod === 'wallet' ? 'rgb(2 132 199)' : 'rgb(226 232 240)' }}
                  >
                    <input
                      type="radio"
                      name="pm"
                      checked={paymentMethod === 'wallet'}
                      onChange={() => setPaymentMethod('wallet')}
                      className="text-sky-600"
                    />
                    <Wallet className="h-5 w-5 text-sky-600" />
                    <span className="font-medium">Wallet</span>
                    {walletBalance != null && (
                      <span className="text-slate-500 text-sm ml-auto">Balance: {formatCheckoutAmount(walletBalance)}</span>
                    )}
                  </label>
                  <label
                    className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer ${showOrangeMoneyOption ? 'mb-3' : ''}`}
                    style={{ borderColor: paymentMethod === 'card' ? 'rgb(2 132 199)' : 'rgb(226 232 240)' }}
                  >
                    <input
                      type="radio"
                      name="pm"
                      checked={paymentMethod === 'card'}
                      onChange={() => setPaymentMethod('card')}
                      className="text-sky-600"
                    />
                    <CreditCard className="h-5 w-5 text-sky-600" />
                    <span className="font-medium">Card (PayGate)</span>
                  </label>
                  {showOrangeMoneyOption && (
                    <label
                      className="flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer mb-3"
                      style={{ borderColor: paymentMethod === 'orange_money' ? 'rgb(2 132 199)' : 'rgb(226 232 240)' }}
                    >
                      <input
                        type="radio"
                        name="pm"
                        checked={paymentMethod === 'orange_money'}
                        onChange={() => setPaymentMethod('orange_money')}
                        className="text-sky-600"
                      />
                      <Smartphone className="h-5 w-5 text-orange-500" />
                      <span className="font-medium">Orange Money</span>
                      <span className="text-slate-500 text-sm ml-auto">Botswana</span>
                    </label>
                  )}
                  {showEftOption && (
                    <label
                      className="flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer mb-3"
                      style={{ borderColor: paymentMethod === 'eft' ? 'rgb(2 132 199)' : 'rgb(226 232 240)' }}
                    >
                      <input
                        type="radio"
                        name="pm"
                        checked={paymentMethod === 'eft'}
                        onChange={() => setPaymentMethod('eft')}
                        className="text-sky-600"
                      />
                      <Landmark className="h-5 w-5 text-sky-600" />
                      <span className="font-medium">EFT (bank transfer)</span>
                      <span className="text-slate-500 text-sm ml-auto">
                        {showBwEftOption ? 'Botswana · FNB' : 'South Africa'}
                      </span>
                    </label>
                  )}
                  {showBwEftOption && paymentMethod === 'eft' && (
                    <div className="rounded-xl border border-sky-100 bg-sky-50/80 px-4 py-3 text-sm text-sky-950 mb-3">
                      <p className="font-semibold text-sky-900">FNB Botswana Business</p>
                      <ul className="mt-2 space-y-1 text-sky-900/90">
                        <li>
                          <span className="text-sky-700">Account name:</span> Qwertymates(Pty)LTD
                        </li>
                        <li>
                          <span className="text-sky-700">Branch:</span> Kgale View
                        </li>
                        <li>
                          <span className="text-sky-700">Account number:</span> 62506829342
                        </li>
                        <li>
                          <span className="text-sky-700">Reference:</span> your email or cellphone number
                        </li>
                      </ul>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="rounded-2xl border border-dashed border-amber-200 bg-amber-50/50 p-5 text-center text-sm text-amber-900">
                <p className="font-medium">Choose a delivery method above to see your full amount</p>
                <p className="mt-1 text-amber-800/90">
                  Product total so far: {formatCheckoutAmount(quote.subtotal, checkoutCurrency)} — courier cost will be added before you pay.
                </p>
              </div>
            )}
          </div>
          {courierChoiceComplete &&
            (paymentMethod === 'wallet' && !canPayWallet ? (
            <div className="w-full rounded-2xl bg-sky-400 py-6 flex items-center justify-center">
              <div className="px-8 py-1.5 text-2xl font-semibold text-white tracking-tight">
                {walletStatusText}
              </div>
            </div>
          ) : (
              <button
                type="button"
                onClick={handlePay}
                disabled={!canSubmitPay}
                className="w-full flex flex-col items-center justify-center gap-1 bg-sky-600 text-white py-4 rounded-xl hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-lg"
              >
                {paying ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-5 w-5 animate-spin" /> Processing…
                  </span>
                ) : (
                  <>
                    <span>
                      {paymentMethod === 'eft'
                        ? `Get EFT details for ${formatCheckoutAmount(quote.total, checkoutCurrency)}`
                        : paymentMethod === 'orange_money'
                          ? `Get Orange Money details for ${formatCheckoutAmount(quote.total, checkoutCurrency)}`
                          : `Pay ${formatCheckoutAmount(quote.total, checkoutCurrency)} once`}
                    </span>
                    <span className="text-xs font-normal text-sky-100">
                      {paymentMethod === 'eft'
                        ? 'Bank details sent to Messenger · includes products & delivery'
                        : paymentMethod === 'orange_money'
                          ? 'Orange Money number sent to Messenger · includes products & delivery'
                          : quote.foodPickup
                            ? `${paymentMethod === 'card' ? 'Card' : 'Wallet'} · in-store collection`
                            : `${paymentMethod === 'card' ? 'Card' : 'Wallet'} · includes products & delivery`}
                    </span>
                  </>
                )}
            </button>
            ))}
          {paymentMethod === 'wallet' && walletBalance != null && quote.total > walletBalance && (
            <div className="mt-3 flex flex-col items-center gap-2">
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('card')}
                  className="inline-flex items-center rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-100"
                >
                  Pay with card
                </button>
              </div>
            </div>
          )}
        </main>
          </div>
        </div>
        <MobileBottomNav cartCount={cartCount} hasStore={hasStore} />
      </div>
    </ProtectedRoute>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense
      fallback={
        <ProtectedRoute>
          <div className="min-h-screen bg-gradient-to-br from-sky-50 to-white flex items-center justify-center">
            <Loader2 className="h-12 w-12 text-sky-600 animate-spin" />
          </div>
        </ProtectedRoute>
      }
    >
      <CheckoutPageContent />
    </Suspense>
  );
}
