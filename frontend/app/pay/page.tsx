'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Wallet, CreditCard, Loader2, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { walletAPI } from '@/lib/api';
import AuthBackground from '@/components/AuthBackground';

function PayPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const [details, setDetails] = useState<{ merchantId: string; amount: number; reference: string; merchantName: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState<'wallet' | string | null>(null);
  const [cards, setCards] = useState<Array<{ _id: string; last4: string; brand: string; isDefault: boolean }>>([]);
  const [balance, setBalance] = useState<number | null>(null);

  const merchantId = searchParams.get('merchant') || searchParams.get('m');
  const amountParam = searchParams.get('amount') || searchParams.get('a');
  const reference = searchParams.get('reference') || searchParams.get('r');
  const returnUrl = searchParams.get('return_url') || searchParams.get('return');
  const cancelUrl = searchParams.get('cancel_url') || searchParams.get('cancel');
  const name = searchParams.get('name') || searchParams.get('n');

  useEffect(() => {
    if (!merchantId || !amountParam || !reference || !returnUrl) {
      setLoading(false);
      setDetails(null);
      return;
    }
    walletAPI
      .getCheckoutDetails({ merchantId, amount: parseFloat(amountParam), reference, name: name || undefined })
      .then((res) => setDetails(res.data))
      .catch(() => setDetails(null))
      .finally(() => setLoading(false));
  }, [merchantId, amountParam, reference, name]);

  useEffect(() => {
    if (user) {
      Promise.all([
        walletAPI.getCards().then((r) => setCards(r.data ?? [])),
        walletAPI.getBalance().then((r) => setBalance(Number(r.data?.balance ?? 0))),
      ]).catch(() => {});
    }
  }, [user]);

  const handlePay = async (method: 'wallet' | 'card', cardId?: string) => {
    if (!details || !returnUrl) return;
    setPaying(method === 'wallet' ? 'wallet' : cardId || 'card');
    try {
      const res = await walletAPI.checkoutPay({
        merchantId: details.merchantId,
        amount: details.amount,
        reference: details.reference,
        returnUrl: decodeURIComponent(returnUrl),
        cancelUrl: cancelUrl ? decodeURIComponent(cancelUrl) : undefined,
        method,
        cardId,
      });
      const data = res.data;
      if (data?.paymentUrl) {
        window.location.href = data.paymentUrl;
        return;
      }
      if (data?.redirectUrl) {
        window.location.href = data.redirectUrl;
        return;
      }
      toast.error('Payment could not be completed');
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Payment failed');
    } finally {
      setPaying(null);
    }
  };

  const loginUrl = `/login?returnTo=${encodeURIComponent(`/pay?${searchParams.toString()}`)}`;

  if (loading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-sky-600" />
      </div>
    );
  }

  if (!merchantId || !amountParam || !reference || !returnUrl) {
    return (
      <div className="relative min-h-screen flex flex-col">
        <AuthBackground />
        <div className="relative z-10 flex-1 flex items-center justify-center p-4">
          <div className="max-w-md w-full rounded-2xl bg-white/95 backdrop-blur p-8 shadow-xl text-center">
            <h1 className="text-xl font-bold text-slate-900 mb-2">Invalid payment link</h1>
            <p className="text-slate-600 mb-6">This payment link is missing required parameters. Please check the link from the merchant.</p>
            <p className="text-sm text-slate-500">Required: merchant, amount, reference, return_url</p>
          </div>
        </div>
      </div>
    );
  }

  if (!details) {
    return (
      <div className="relative min-h-screen flex flex-col">
        <AuthBackground />
        <div className="relative z-10 flex-1 flex items-center justify-center p-4">
          <div className="max-w-md w-full rounded-2xl bg-white/95 backdrop-blur p-8 shadow-xl text-center">
            <h1 className="text-xl font-bold text-slate-900 mb-2">Merchant not found</h1>
            <p className="text-slate-600">The payment could not be processed.</p>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="relative min-h-screen flex flex-col">
        <AuthBackground />
        <div className="relative z-10 flex-1 flex items-center justify-center p-4">
          <div className="max-w-md w-full rounded-2xl bg-white/95 backdrop-blur p-8 shadow-xl">
            <h1 className="text-2xl font-bold text-slate-900 mb-2">ACBPayWallet</h1>
            <p className="text-slate-600 mb-6">Pay R{details.amount.toFixed(2)} to {details.merchantName}</p>
            <p className="text-sm text-slate-500 mb-6">Log in to your ACBPayWallet account to complete this payment.</p>
            <Link
              href={loginUrl}
              className="block w-full rounded-xl bg-sky-600 py-3 text-center font-semibold text-white hover:bg-sky-700"
            >
              Log in to pay
            </Link>
            {cancelUrl && (
              <Link
                href={decodeURIComponent(cancelUrl)}
                className="block w-full mt-3 text-center text-sm text-slate-600 hover:text-slate-900"
              >
                Cancel
              </Link>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen flex flex-col">
      <AuthBackground />
      <div className="relative z-10 flex-1 flex items-center justify-center p-4">
        <div className="max-w-md w-full rounded-2xl bg-white/95 backdrop-blur p-8 shadow-xl">
          <h1 className="text-2xl font-bold text-slate-900 mb-1">ACBPayWallet</h1>
          <p className="text-slate-500 text-sm mb-6">Secure payment</p>

          <div className="rounded-xl bg-slate-50 p-4 mb-6">
            <p className="text-sm text-slate-500">Pay to</p>
            <p className="font-semibold text-slate-900">{details.merchantName}</p>
            <p className="text-2xl font-bold text-sky-600 mt-2">R{details.amount.toFixed(2)}</p>
            {reference && <p className="text-xs text-slate-400 mt-1">Ref: {reference}</p>}
          </div>

          <div className="space-y-3">
            {balance !== null && balance >= details.amount && (
              <button
                onClick={() => handlePay('wallet')}
                disabled={!!paying}
                className="w-full flex items-center justify-center gap-3 rounded-xl border-2 border-sky-500 bg-sky-50 py-3 font-semibold text-sky-700 hover:bg-sky-100 disabled:opacity-50"
              >
                {paying === 'wallet' ? <Loader2 className="h-5 w-5 animate-spin" /> : <Wallet className="h-5 w-5" />}
                Pay with wallet (R{balance.toFixed(2)})
              </button>
            )}
            {cards.map((c) => (
              <button
                key={c._id}
                onClick={() => handlePay('card', c._id)}
                disabled={!!paying}
                className="w-full flex items-center justify-center gap-3 rounded-xl border-2 border-slate-200 bg-white py-3 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {paying === c._id ? <Loader2 className="h-5 w-5 animate-spin" /> : <CreditCard className="h-5 w-5" />}
                {c.brand} •••• {c.last4}
              </button>
            ))}
            {(!balance || balance < details.amount) && cards.length === 0 && (
              <p className="text-center text-sm text-slate-500 py-4">
                Add funds or a card in <Link href="/wallet" className="text-sky-600 hover:underline">ACBPayWallet</Link> to pay.
              </p>
            )}
          </div>

          <div className="mt-6 flex gap-3">
            <Link
              href="/wallet"
              className="flex-1 flex items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" />
              Wallet
            </Link>
            {cancelUrl && (
              <Link
                href={decodeURIComponent(cancelUrl)}
                className="flex-1 rounded-xl border py-2.5 text-center text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PayPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-sky-600" />
      </div>
    }>
      <PayPageContent />
    </Suspense>
  );
}
