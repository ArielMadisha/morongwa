'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { CreditCard, Wallet, MapPin, ArrowLeft, Loader2 } from 'lucide-react';
import { checkoutAPI, walletAPI } from '@/lib/api';
import ProtectedRoute from '@/components/ProtectedRoute';
import SiteHeader from '@/components/SiteHeader';
import toast from 'react-hot-toast';

function formatPrice(price: number) {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(price);
}

export default function CheckoutPage() {
  const [quote, setQuote] = useState<{
    subtotal: number;
    shipping: number;
    shippingBreakdown?: Array<{ supplierId: string; storeName?: string; shippingCost: number }>;
    platformFee: number;
    commissionTotal?: number;
    adminCommissionTotal?: number;
    total: number;
    currency: string;
    itemCount: number;
    paymentBreakdown?: Array<{ productId: string; originalPrice: number; sellingPrice: number; adminCommission: number; resellerCommission?: number }>;
  } | null>(null);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'wallet' | 'card'>('wallet');
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    checkoutAPI.quote().then((res) => { const d = res.data?.data ?? res.data; setQuote(d ?? null); }).catch(() => setQuote(null)).finally(() => setLoading(false));
    walletAPI.getBalance().then((res) => { const b = res.data?.balance ?? res.data ?? 0; setWalletBalance(typeof b === 'number' ? b : 0); }).catch(() => setWalletBalance(0));
  }, []);

  const handlePay = () => {
    if (!quote) return;
    setPaying(true);
    checkoutAPI.pay(paymentMethod, deliveryAddress || undefined).then((res) => {
      const d = res.data?.data ?? res.data;
      if (d?.paymentUrl) { window.location.href = d.paymentUrl; return; }
      if (d?.status === 'paid') { toast.success('Order paid with wallet'); window.location.href = `/checkout/order/${d.orderId}`; }
    }).catch((err) => { toast.error(err.response?.data?.message ?? err.message ?? 'Payment failed'); setPaying(false); });
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

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-blue-50 to-white text-slate-900">
        <SiteHeader />
        <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <Link href="/cart" className="inline-flex items-center gap-2 text-sky-600 hover:text-sky-700 mb-6 text-sm font-medium"><ArrowLeft className="h-4 w-4" /> Back to cart</Link>
          <h1 className="text-2xl font-bold text-slate-900 mb-6">Checkout</h1>
          <div className="space-y-6 mb-8">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-2"><MapPin className="h-4 w-4" /> Delivery address</label>
              <textarea value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} placeholder="Street, suburb, city, postal code" rows={3} className="w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-sky-500 focus:border-sky-500" />
            </div>
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
                <div className="mb-4 p-3 rounded-lg bg-slate-50 space-y-2 text-sm">
                  {quote.paymentBreakdown.map((b, i) => (
                    <div key={b.productId || i} className="space-y-1 text-slate-600">
                      <div className="flex justify-between"><span>Original price</span><span>{formatPrice(b.originalPrice)}</span></div>
                      <div className="flex justify-between text-slate-500"><span>Commission for Morongwa (7.5%)</span><span>-{formatPrice(b.adminCommission)}</span></div>
                      {b.resellerCommission != null && (
                        <div className="flex justify-between text-slate-500"><span>Reseller commission</span><span>{formatPrice(b.resellerCommission)}</span></div>
                      )}
                      <div className="flex justify-between font-medium text-slate-700"><span>Selling price</span><span>{formatPrice(b.sellingPrice)}</span></div>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex justify-between text-slate-600"><span>Subtotal ({quote.itemCount} items)</span><span>{formatPrice(quote.subtotal)}</span></div>
              {quote.shippingBreakdown && quote.shippingBreakdown.length > 1 ? (
                <div className="space-y-1">
                  <div className="flex justify-between text-slate-600"><span>Shipping</span><span>{formatPrice(quote.shipping)}</span></div>
                  <div className="pl-4 text-sm text-slate-500 space-y-0.5">
                    {quote.shippingBreakdown.map((s) => (
                      <div key={s.supplierId} className="flex justify-between"><span>{s.storeName ?? 'Supplier'}</span><span>{formatPrice(s.shippingCost)}</span></div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex justify-between text-slate-600"><span>Shipping</span><span>{formatPrice(quote.shipping)}</span></div>
              )}
              <div className="flex justify-between text-slate-600"><span>Platform fee</span><span>{formatPrice(quote.platformFee)}</span></div>
              <div className="border-t border-slate-200 pt-3 flex justify-between font-bold text-slate-900 text-lg"><span>Total</span><span>{formatPrice(quote.total)}</span></div>
            </div>
          </div>
          <button type="button" onClick={handlePay} disabled={paying || (paymentMethod === 'wallet' && !canPayWallet)} className="w-full flex items-center justify-center gap-2 bg-sky-600 text-white py-4 rounded-xl hover:bg-sky-700 disabled:opacity-50 font-semibold text-lg">
            {paying ? <Loader2 className="h-5 w-5 animate-spin" /> : paymentMethod === 'wallet' && !canPayWallet ? 'Insufficient balance' : paymentMethod === 'card' ? 'Pay with card' : 'Pay with wallet'}
          </button>
          {paymentMethod === 'wallet' && walletBalance != null && quote.total > walletBalance && <p className="mt-3 text-sm text-amber-600 text-center">Top up or pay with card. Balance: {formatPrice(walletBalance)}.</p>}
        </main>
      </div>
    </ProtectedRoute>
  );
}
