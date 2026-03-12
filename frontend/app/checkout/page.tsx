'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { CreditCard, Wallet, MapPin, ArrowLeft, Loader2, ShoppingBag } from 'lucide-react';
import { checkoutAPI, walletAPI } from '@/lib/api';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import { useCartAndStores } from '@/lib/useCartAndStores';
import { AppSidebar, AppSidebarMenuButton } from '@/components/AppSidebar';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { SearchButton } from '@/components/SearchButton';
import toast from 'react-hot-toast';

function formatPrice(price: number) {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(price);
}

function formatCreditAmount(value: number) {
  const safe = Math.max(0, value || 0);
  return `R${safe.toFixed(0)}`;
}

export default function CheckoutPage() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [menuOpen, setMenuOpen] = useState(false);
  const { cartCount, hasStore } = useCartAndStores(!!user);
  const [quote, setQuote] = useState<{
    subtotal: number;
    shipping: number;
    shippingBreakdown?: Array<{ supplierId: string; storeName?: string; shippingCost: number }>;
    total: number;
    currency: string;
    itemCount: number;
    paymentBreakdown?: Array<{ productId: string; title: string; price: number; qty: number }>;
  } | null>(null);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [fulfillmentMethod, setFulfillmentMethod] = useState<'delivery' | 'collection'>('delivery');
  const [paymentMethod, setPaymentMethod] = useState<'wallet' | 'card'>('wallet');
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  useEffect(() => {
    setLoading(true);
    checkoutAPI.quote(fulfillmentMethod).then((res) => { const d = res.data?.data ?? res.data; setQuote(d ?? null); }).catch(() => setQuote(null)).finally(() => setLoading(false));
    walletAPI.getBalance().then((res) => { const b = res.data?.balance ?? res.data ?? 0; setWalletBalance(typeof b === 'number' ? b : 0); }).catch(() => setWalletBalance(0));
  }, [fulfillmentMethod]);

  useEffect(() => {
    const pm = searchParams.get('pm');
    if (pm === 'card') setPaymentMethod('card');
  }, [searchParams]);

  const handlePay = () => {
    if (!quote) return;
    if (fulfillmentMethod === 'delivery' && !deliveryAddress.trim()) {
      toast.error('Delivery address is required');
      return;
    }
    setPaying(true);
    checkoutAPI.pay(paymentMethod, deliveryAddress || undefined, fulfillmentMethod).then((res) => {
      const d = res.data?.data ?? res.data;
      if (d?.paymentUrl) { window.location.href = d.paymentUrl; return; }
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

  if (loading || !quote) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gradient-to-br from-sky-50 to-white flex items-center justify-center">
          {loading ? <Loader2 className="h-12 w-12 text-sky-600 animate-spin" /> : <div className="text-center"><p className="text-slate-600 mb-4">Cart empty or invalid.</p><Link href="/cart" className="text-sky-600 hover:text-sky-700 font-medium">Back to cart</Link></div>}
        </div>
      </ProtectedRoute>
    );
  }

  const canPayWallet = walletBalance != null && quote.total <= walletBalance;
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
                <img src="/qwertymates-logo-icon.png" alt="Qwertymates" className="h-9 w-9 object-contain lg:hidden" />
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
        <div className="flex flex-1 min-h-0">
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
          <div className="flex-1 flex gap-0 min-h-0 overflow-y-auto overflow-x-hidden">
            <main className="flex-1 min-w-0 max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 lg:pb-6">
          <Link href="/cart" className="inline-flex items-center gap-2 text-sky-600 hover:text-sky-700 mb-6 text-sm font-medium"><ArrowLeft className="h-4 w-4" /> Back to cart</Link>
          <h1 className="text-2xl font-bold text-slate-900 mb-6">Checkout</h1>
          <div className="space-y-6 mb-8">
            <div>
              <p className="text-sm font-medium text-slate-700 mb-3">Receive order</p>
              <label className="flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer mb-3" style={{ borderColor: fulfillmentMethod === 'delivery' ? 'rgb(2 132 199)' : 'rgb(226 232 240)' }}>
                <input type="radio" name="fulfillment" checked={fulfillmentMethod === 'delivery'} onChange={() => setFulfillmentMethod('delivery')} className="text-sky-600" />
                <MapPin className="h-5 w-5 text-sky-600" /><span className="font-medium">Delivery</span>
              </label>
              <label className="flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer" style={{ borderColor: fulfillmentMethod === 'collection' ? 'rgb(2 132 199)' : 'rgb(226 232 240)' }}>
                <input type="radio" name="fulfillment" checked={fulfillmentMethod === 'collection'} onChange={() => setFulfillmentMethod('collection')} className="text-sky-600" />
                <ShoppingBag className="h-5 w-5 text-sky-600" /><span className="font-medium">Collect at store (shipping R0)</span>
              </label>
            </div>
            {fulfillmentMethod === 'delivery' ? (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-2"><MapPin className="h-4 w-4" /> Delivery address</label>
                <textarea value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} placeholder="Street, suburb, city, postal code" rows={3} className="w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-sky-500 focus:border-sky-500" />
              </div>
            ) : (
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                You selected collection at store. Shipping fee is zero and sellers will be notified via Morongwa messenger.
              </div>
            )}
            <div>
              <p className="text-sm font-medium text-slate-700 mb-3">Payment method</p>
              <label className="flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer mb-3" style={{ borderColor: paymentMethod === 'wallet' ? 'rgb(2 132 199)' : 'rgb(226 232 240)' }}>
                <input type="radio" name="pm" checked={paymentMethod === 'wallet'} onChange={() => setPaymentMethod('wallet')} className="text-sky-600" />
                <Wallet className="h-5 w-5 text-sky-600" /><span className="font-medium">Wallet</span>
                {walletBalance != null && <span className="text-slate-500 text-sm">Balance: {formatPrice(walletBalance)}</span>}
              </label>
              <label className="flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer" style={{ borderColor: paymentMethod === 'card' ? 'rgb(2 132 199)' : 'rgb(226 232 240)' }}>
                <input type="radio" name="pm" checked={paymentMethod === 'card'} onChange={() => setPaymentMethod('card')} className="text-sky-600" />
                <CreditCard className="h-5 w-5 text-sky-600" /><span className="font-medium">Card (PayGate)</span>
              </label>
            </div>
            <div className="bg-white/90 rounded-2xl border border-slate-100 p-6 space-y-2">
              <h3 className="font-semibold text-slate-900 mb-3">Payment breakdown</h3>
              {quote.paymentBreakdown && quote.paymentBreakdown.length > 0 && (
                <div className="mb-4 space-y-1 text-sm">
                  {quote.paymentBreakdown.map((b, i) => (
                    <div key={b.productId || i} className="flex justify-between text-slate-700">
                      <span>{b.title}{b.qty > 1 ? ` ×${b.qty}` : ''}</span>
                      <span>{formatPrice(b.price * b.qty)}</span>
                    </div>
                  ))}
                </div>
              )}
              {quote.shippingBreakdown && quote.shippingBreakdown.length > 1 ? (
                <div className="space-y-1">
                  {quote.shippingBreakdown.map((s) => (
                    <div key={s.supplierId} className="flex justify-between text-slate-600">
                      <span>Shipping ({s.storeName ?? 'Supplier'})</span>
                      <span>{formatPrice(s.shippingCost)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex justify-between text-slate-600">
                  <span>{fulfillmentMethod === 'collection' ? 'Collection (store pickup)' : 'Shipping Fee'}</span>
                  <span>{formatPrice(quote.shipping)}</span>
                </div>
              )}
              <div className="border-t border-slate-200 pt-3 flex justify-between font-bold text-slate-900 text-lg">
                <span>Total</span>
                <span>{formatPrice(quote.total)}</span>
              </div>
            </div>
          </div>
          {paymentMethod === 'wallet' && !canPayWallet ? (
            <div className="w-full rounded-2xl bg-sky-400 py-6 flex items-center justify-center">
              <div className="px-8 py-1.5 text-2xl font-semibold text-white tracking-tight">
                {walletStatusText}
              </div>
            </div>
          ) : (
            <button type="button" onClick={handlePay} disabled={paying} className="w-full flex items-center justify-center gap-2 bg-sky-600 text-white py-4 rounded-xl hover:bg-sky-700 disabled:opacity-50 font-semibold text-lg">
              {paying ? <Loader2 className="h-5 w-5 animate-spin" /> : paymentMethod === 'card' ? 'Pay with card' : 'Pay with wallet'}
            </button>
          )}
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
