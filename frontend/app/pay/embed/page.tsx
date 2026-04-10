'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Wallet, CreditCard, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { walletAPI } from '@/lib/api';
import { openPayGatePayment } from '@/lib/payGateRedirect';

function PayEmbedContent() {
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

  const isEmbedded = typeof window !== 'undefined' && window.self !== window.top;

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

  const postToParent = (payload: { type: string; status?: string; reference?: string; amount?: number; returnUrl?: string; error?: string }) => {
    if (typeof window === 'undefined' || !window.parent) return;
    window.parent.postMessage(
      { ...payload, source: 'ACBPAYWALLET_EMBED' },
      '*'
    );
  };

  const handlePay = async (method: 'wallet' | 'card', cardId?: string) => {
    if (!details || !returnUrl) return;
    setPaying(method === 'wallet' ? 'wallet' : cardId || 'card');
    let usedPopup = false;
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

      if (data?.paymentUrl || data?.payGateRedirect) {
        if (isEmbedded && data.paymentUrl) {
          const popup = window.open(data.paymentUrl, 'acbpaywallet_3ds', 'width=500,height=600,scrollbars=yes');
          if (!popup) {
            toast.error('Popup blocked. Please allow popups for this site and try again.');
            setPaying(null);
            return;
          }
          usedPopup = true;
          const handleMessage = (e: MessageEvent) => {
            if (e.data?.source !== 'ACBPAYWALLET_EMBED' || e.data?.type !== 'ACBPAYWALLET_PAYMENT_RESULT') return;
            window.removeEventListener('message', handleMessage);
            if (e.data.status === 'success') {
              postToParent({ type: 'ACBPAYWALLET_PAYMENT_RESULT', status: 'success', reference: e.data.reference, amount: e.data.amount, returnUrl: e.data.returnUrl });
            } else {
              postToParent({ type: 'ACBPAYWALLET_PAYMENT_RESULT', status: 'failed', error: e.data.error });
            }
            setPaying(null);
          };
          window.addEventListener('message', handleMessage);
          const checkClosed = setInterval(() => {
            if (popup?.closed) {
              clearInterval(checkClosed);
              window.removeEventListener('message', handleMessage);
              setPaying(null);
            }
          }, 500);
        } else if (data.paymentUrl) {
          window.location.href = data.paymentUrl;
        } else {
          openPayGatePayment({ payGateRedirect: data.payGateRedirect });
        }
        return;
      }

      if (data?.redirectUrl) {
        if (isEmbedded) {
          postToParent({
            type: 'ACBPAYWALLET_PAYMENT_RESULT',
            status: 'success',
            reference: details.reference,
            amount: details.amount,
            returnUrl: data.redirectUrl,
          });
          setPaying(null);
        } else {
          window.location.href = data.redirectUrl;
        }
        return;
      }
      toast.error('Payment could not be completed');
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Payment failed');
      if (isEmbedded) {
        postToParent({ type: 'ACBPAYWALLET_PAYMENT_RESULT', status: 'failed', error: e?.response?.data?.message || 'Payment failed' });
      }
    } finally {
      if (!usedPopup) setPaying(null);
    }
  };

  const loginUrl = `/login?returnTo=${encodeURIComponent(`/pay/embed?${searchParams.toString()}`)}`;

  if (loading || authLoading) {
    return (
      <div className="min-h-[320px] flex items-center justify-center rounded-xl bg-white">
        <Loader2 className="h-10 w-10 animate-spin text-sky-600" />
      </div>
    );
  }

  if (!merchantId || !amountParam || !reference || !returnUrl) {
    return (
      <div className="min-h-[200px] flex items-center justify-center rounded-xl bg-white p-6">
        <div className="text-center">
          <p className="text-slate-600 font-medium">Invalid payment link</p>
          <p className="text-sm text-slate-500 mt-1">Required: merchant, amount, reference, return_url</p>
        </div>
      </div>
    );
  }

  if (!details) {
    return (
      <div className="min-h-[200px] flex items-center justify-center rounded-xl bg-white p-6">
        <p className="text-slate-600">Merchant not found</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="rounded-xl bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900 mb-1">ACBPayWallet</h2>
        <p className="text-slate-600 text-sm mb-4">Pay R{details.amount.toFixed(2)} to {details.merchantName}</p>
        <p className="text-sm text-slate-500 mb-4">Log in to complete this payment.</p>
        <Link
          href={loginUrl}
          target="_self"
          className="block w-full rounded-xl bg-sky-600 py-3 text-center font-semibold text-white hover:bg-sky-700"
        >
          Log in to pay
        </Link>
        {cancelUrl && (
          <Link
            href={decodeURIComponent(cancelUrl)}
            target="_parent"
            className="block w-full mt-3 text-center text-sm text-slate-600 hover:text-slate-900"
          >
            Cancel
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-white p-6 shadow-sm">
      <h2 className="text-lg font-bold text-slate-900 mb-1">ACBPayWallet</h2>
      <p className="text-slate-500 text-sm mb-4">Secure payment</p>

      <div className="rounded-lg bg-slate-50 p-3 mb-4">
        <p className="text-xs text-slate-500">Pay to</p>
        <p className="font-semibold text-slate-900">{details.merchantName}</p>
        <p className="text-xl font-bold text-sky-600 mt-1">R{details.amount.toFixed(2)}</p>
        {reference && <p className="text-xs text-slate-400 mt-1">Ref: {reference}</p>}
      </div>

      <div className="space-y-2">
        {balance !== null && balance >= details.amount && (
          <button
            onClick={() => handlePay('wallet')}
            disabled={!!paying}
            className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-sky-500 bg-sky-50 py-2.5 font-semibold text-sky-700 hover:bg-sky-100 disabled:opacity-50 text-sm"
          >
            {paying === 'wallet' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
            Pay with wallet (R{balance.toFixed(2)})
          </button>
        )}
        {cards.map((c) => (
          <button
            key={c._id}
            onClick={() => handlePay('card', c._id)}
            disabled={!!paying}
            className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-slate-200 bg-white py-2.5 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 text-sm"
          >
            {paying === c._id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
            {c.brand} •••• {c.last4}
          </button>
        ))}
        {(!balance || balance < details.amount) && cards.length === 0 && (
          <p className="text-center text-sm text-slate-500 py-3">
            Add funds or a card in <Link href="/wallet" target="_blank" className="text-sky-600 hover:underline">ACBPayWallet</Link> to pay.
          </p>
        )}
      </div>

      {cancelUrl && (
        <Link
          href={decodeURIComponent(cancelUrl)}
          target="_parent"
          className="block w-full mt-4 text-center text-sm text-slate-600 hover:text-slate-900"
        >
          Cancel
        </Link>
      )}
    </div>
  );
}

export default function PayEmbedPage() {
  return (
    <Suspense fallback={
      <div className="min-h-[320px] flex items-center justify-center rounded-xl bg-white">
        <Loader2 className="h-10 w-10 animate-spin text-sky-600" />
      </div>
    }>
      <div className="min-h-screen flex items-center justify-center p-4 bg-slate-100">
        <PayEmbedContent />
      </div>
    </Suspense>
  );
}
