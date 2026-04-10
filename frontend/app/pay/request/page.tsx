'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { Loader2, Wallet, CreditCard } from 'lucide-react';
import { api } from '@/lib/api';
import AuthBackground from '@/components/AuthBackground';
import { openPayGatePayment } from '@/lib/payGateRedirect';

type PublicRequestDetails = {
  requestId: string;
  amount: number;
  message?: string;
  status: 'pending' | 'paid' | 'declined' | 'expired';
  requesterName: string;
  canPayWithWallet: boolean;
  expiresAt: string;
  expired: boolean;
};

function PublicMoneyRequestPayPageContent() {
  const searchParams = useSearchParams();
  const requestId = (searchParams.get('requestId') || '').trim();
  const token = (searchParams.get('token') || '').trim();
  const pgRef = (searchParams.get('ref') || '').trim();

  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [details, setDetails] = useState<PublicRequestDetails | null>(null);

  useEffect(() => {
    if (!requestId || !token) {
      setLoading(false);
      setDetails(null);
      return;
    }
    setLoading(true);
    api
      .get(`/wallet/request-public/${encodeURIComponent(requestId)}`, { params: { token } })
      .then((res) => setDetails((res.data || null) as PublicRequestDetails | null))
      .catch(() => setDetails(null))
      .finally(() => setLoading(false));
  }, [requestId, token]);

  useEffect(() => {
    if (!requestId || !token || !pgRef) return;
    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 16;
    const poll = async () => {
      attempts += 1;
      try {
        const next = await api.get(`/wallet/request-public/${encodeURIComponent(requestId)}`, { params: { token } });
        const latest = (next.data || null) as PublicRequestDetails | null;
        if (!cancelled) setDetails(latest);
        if (latest?.status === 'paid') {
          if (!cancelled) toast.success('Payment received successfully.');
          return;
        }
      } catch {
        // ignore transient network errors while waiting for webhook
      }
      if (!cancelled && attempts < maxAttempts) setTimeout(poll, 2500);
    };
    void poll();
    return () => {
      cancelled = true;
    };
  }, [requestId, token, pgRef]);

  const handlePay = async () => {
    if (!requestId || !token) return;
    setPaying(true);
    try {
      const res = await api.post(`/wallet/request-public/${encodeURIComponent(requestId)}/pay`, { token });
      const data = res.data as any;
      if (data?.paymentUrl || data?.payGateRedirect) {
        openPayGatePayment({ paymentUrl: data.paymentUrl, payGateRedirect: data.payGateRedirect });
        return;
      }
      if (data?.code === 'PAID_WALLET' || data?.code === 'ALREADY_PROCESSED') {
        toast.success(data?.message || 'Payment completed.');
      } else {
        toast(data?.message || 'Request processed.');
      }
      if (requestId && token) {
        const next = await api.get(`/wallet/request-public/${encodeURIComponent(requestId)}`, { params: { token } });
        setDetails((next.data || null) as PublicRequestDetails | null);
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Could not process payment link');
    } finally {
      setPaying(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-sky-50 via-blue-50 to-white">
        <Loader2 className="h-10 w-10 animate-spin text-sky-600" />
      </div>
    );
  }

  if (!details) {
    return (
      <div className="relative min-h-screen flex flex-col">
        <AuthBackground />
        <div className="relative z-10 flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white/95 p-8 shadow-xl text-center">
            <h1 className="text-xl font-bold text-slate-900 mb-2">Invalid payment request link</h1>
            <p className="text-slate-600">This link is invalid or no longer available.</p>
          </div>
        </div>
      </div>
    );
  }

  const closed = details.status !== 'pending' || details.expired;
  return (
    <div className="relative min-h-screen flex flex-col">
      <AuthBackground />
      <div className="relative z-10 flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl bg-white/95 p-8 shadow-xl">
          <h1 className="text-2xl font-bold text-slate-900">ACBPayWallet</h1>
          <p className="text-slate-500 text-sm mt-1">Payment request</p>

          <div className="mt-5 rounded-xl bg-slate-50 p-4">
            <p className="text-sm text-slate-500">Requested by</p>
            <p className="font-semibold text-slate-900">{details.requesterName}</p>
            <p className="text-2xl font-bold text-sky-600 mt-2">R{Number(details.amount || 0).toFixed(2)}</p>
            {details.message ? <p className="text-sm text-slate-600 mt-2">"{details.message}"</p> : null}
          </div>

          {closed ? (
            <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              {details.status === 'paid' ? 'This payment request is already paid.' : 'This payment request is no longer pending.'}
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              <button
                onClick={handlePay}
                disabled={paying}
                className="w-full rounded-xl bg-sky-600 py-3 font-semibold text-white hover:bg-sky-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {paying ? <Loader2 className="h-5 w-5 animate-spin" /> : details.canPayWithWallet ? <Wallet className="h-5 w-5" /> : <CreditCard className="h-5 w-5" />}
                {details.canPayWithWallet ? 'Pay now (wallet)' : 'Pay now (card / PayGate)'}
              </button>
              <p className="text-xs text-slate-500 text-center">
                One link handles both cases: wallet payment when funded, or PayGate top-up/payment when not.
              </p>
            </div>
          )}

          <div className="mt-5 text-center">
            <Link href="/login" className="text-sm text-sky-600 hover:underline">
              Log in to view wallet details
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PublicMoneyRequestPayPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-sky-50 via-blue-50 to-white">
          <Loader2 className="h-10 w-10 animate-spin text-sky-600" />
        </div>
      }
    >
      <PublicMoneyRequestPayPageContent />
    </Suspense>
  );
}

