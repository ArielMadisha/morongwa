'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { walletAPI } from '@/lib/api';
import AuthBackground from '@/components/AuthBackground';

function PayReturnContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const sessionId = searchParams.get('session');
  const [status, setStatus] = useState<'loading' | 'success' | 'failed'>('loading');

  useEffect(() => {
    if (!sessionId || !user) return;
    const isPopup = typeof window !== 'undefined' && !!window.opener;
    const poll = async () => {
      try {
        const res = await walletAPI.getCheckoutSession(sessionId);
        const data = res.data;
        if (data?.status === 'completed') {
          setStatus('success');
          const returnUrl = data.returnUrl || '';
          const sep = returnUrl.includes('?') ? '&' : '?';
          const redirect = `${returnUrl}${sep}status=success&reference=${encodeURIComponent(data.reference || '')}&amount=${data.amount || 0}`;
          if (isPopup && window.opener) {
            window.opener.postMessage(
              {
                source: 'ACBPAYWALLET_EMBED',
                type: 'ACBPAYWALLET_PAYMENT_RESULT',
                status: 'success',
                reference: data.reference,
                amount: data.amount,
                returnUrl: redirect,
              },
              '*'
            );
            window.close();
          } else {
            window.location.href = redirect;
          }
          return;
        }
        if (data?.status === 'failed') {
          setStatus('failed');
          if (isPopup && window.opener) {
            window.opener.postMessage(
              { source: 'ACBPAYWALLET_EMBED', type: 'ACBPAYWALLET_PAYMENT_RESULT', status: 'failed', error: 'Payment failed' },
              '*'
            );
            window.close();
          }
          return;
        }
        setTimeout(poll, 1500);
      } catch {
        setStatus('failed');
        if (isPopup && window.opener) {
          window.opener.postMessage(
            { source: 'ACBPAYWALLET_EMBED', type: 'ACBPAYWALLET_PAYMENT_RESULT', status: 'failed', error: 'Payment could not be completed' },
            '*'
          );
          window.close();
        }
      }
    };
    poll();
  }, [sessionId, user]);

  if (!user) {
    router.replace('/login?returnTo=' + encodeURIComponent('/pay/return?session=' + (sessionId || '')));
    return null;
  }

  return (
    <div className="relative min-h-screen flex flex-col">
      <AuthBackground />
      <div className="relative z-10 flex-1 flex items-center justify-center p-4">
        <div className="max-w-md w-full rounded-2xl bg-white/95 backdrop-blur p-8 shadow-xl text-center">
          {status === 'loading' && (
            <>
              <Loader2 className="h-12 w-12 animate-spin text-sky-600 mx-auto mb-4" />
              <p className="text-slate-600">Completing your payment...</p>
            </>
          )}
          {status === 'success' && (
            <>
              <CheckCircle className="h-12 w-12 text-emerald-500 mx-auto mb-4" />
              <p className="text-slate-600">Payment successful! Redirecting...</p>
            </>
          )}
          {status === 'failed' && (
            <>
              <XCircle className="h-12 w-12 text-rose-500 mx-auto mb-4" />
              <p className="text-slate-600 mb-4">Payment could not be completed.</p>
              <a href="/wallet" className="text-sky-600 hover:underline">Back to wallet</a>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PayReturnPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-sky-600" />
      </div>
    }>
      <PayReturnContent />
    </Suspense>
  );
}
