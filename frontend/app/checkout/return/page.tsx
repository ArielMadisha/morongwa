'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle, XCircle, Loader2, ShoppingCart } from 'lucide-react';
import { checkoutAPI } from '@/lib/api';
import SiteHeader from '@/components/SiteHeader';

type ReturnStatus = 'loading' | 'paid' | 'pending' | 'cancelled' | 'not_found';

function CheckoutReturnContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get('orderId');
  const [status, setStatus] = useState<ReturnStatus>('loading');
  const [restoring, setRestoring] = useState(false);

  const restoreCartForOrder = useCallback(async (id: string) => {
    setRestoring(true);
    try {
      await checkoutAPI.cancelPayment(id);
    } catch {
      /* order may already be cancelled by webhook */
    } finally {
      setRestoring(false);
    }
  }, []);

  useEffect(() => {
    if (!orderId) {
      setStatus('not_found');
      return;
    }
    if (orderId.startsWith('MUSIC-')) {
      setStatus('paid');
      return;
    }

    let active = true;
    let attempts = 0;
    const maxAttempts = 24; // ~60s — allow slow 3-D Secure / bank redirects before giving up

    const poll = async () => {
      if (!active) return;
      try {
        const res = await checkoutAPI.getPaymentStatus(orderId);
        const order = (res.data?.data ?? res.data) as {
          status?: string;
          paymentStatus?: string | null;
        } | null;
        if (!order || order.status === 'not_found') {
          setStatus('not_found');
          return;
        }

        const orderStatus = String(order.status || '');
        const paymentStatus = String(order.paymentStatus || '');

        if (orderStatus === 'paid') {
          setStatus('paid');
          return;
        }
        if (orderStatus === 'cancelled' || paymentStatus === 'failed') {
          setStatus('cancelled');
          return;
        }

        attempts += 1;
        if (attempts >= maxAttempts) {
          // Only restore cart when authenticated buyer cancels — guests skip API cancel.
          try {
            await restoreCartForOrder(orderId);
          } catch {
            /* ignore */
          }
          setStatus('cancelled');
          return;
        }

        setStatus('pending');
        window.setTimeout(poll, 2500);
      } catch {
        setStatus('not_found');
      }
    };

    poll();
    return () => {
      active = false;
    };
  }, [orderId, restoreCartForOrder]);

  return (
    <main className="max-w-lg mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
      {status === 'loading' && (
        <>
          <Loader2 className="h-16 w-16 text-sky-600 animate-spin mx-auto mb-6" />
          <p className="text-slate-600">Confirming your payment...</p>
        </>
      )}
      {status === 'paid' && (
        <>
          <CheckCircle className="h-16 w-16 text-emerald-500 mx-auto mb-6" />
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Payment successful</h1>
          <p className="text-slate-600 mb-6">
            {orderId?.startsWith('MUSIC-')
              ? 'Your music purchase is complete. Downloads are available in your library.'
              : 'Your order has been paid. We will process it shortly.'}
          </p>
          <Link
            href={orderId && !orderId.startsWith('MUSIC-') ? `/checkout/order/${orderId}` : '/qwerty-music'}
            className="inline-flex items-center gap-2 bg-sky-600 text-white px-6 py-3 rounded-xl hover:bg-sky-700 font-medium"
          >
            {orderId?.startsWith('MUSIC-') ? 'Browse QwertyMusic' : 'View order'}
          </Link>
        </>
      )}
      {status === 'pending' && (
        <>
          <Loader2 className="h-16 w-16 text-amber-500 mx-auto mb-6 animate-spin" />
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Payment processing</h1>
          <p className="text-slate-600 mb-6">
            We are confirming your payment with the bank. This usually takes a few seconds.
          </p>
          <Link href="/cart" className="text-sky-600 hover:text-sky-700 font-medium">
            Back to cart
          </Link>
        </>
      )}
      {status === 'cancelled' && (
        <>
          <XCircle className="h-16 w-16 text-amber-500 mx-auto mb-6" />
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Payment not completed</h1>
          <p className="text-slate-600 mb-6">
            {restoring
              ? 'Restoring your cart…'
              : 'Your card was not charged. The bank or payment page did not approve this attempt (declined, cancelled, or incomplete 3-D Secure). Items should be back in your cart — try again or use another card / Wallet.'}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/cart"
              className="inline-flex items-center justify-center gap-2 bg-sky-600 text-white px-6 py-3 rounded-xl hover:bg-sky-700 font-medium"
            >
              <ShoppingCart className="h-4 w-4" />
              View cart
            </Link>
            <Link href="/marketplace" className="inline-flex items-center justify-center text-sky-600 hover:text-sky-700 font-medium px-4 py-3">
              Continue shopping
            </Link>
          </div>
        </>
      )}
      {status === 'not_found' && (
        <>
          <XCircle className="h-16 w-16 text-slate-400 mx-auto mb-6" />
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Order not found</h1>
          <p className="text-slate-600 mb-6">The order may still be processing or the link is invalid.</p>
          <Link href="/cart" className="text-sky-600 hover:text-sky-700 font-medium">
            Back to cart
          </Link>
        </>
      )}
    </main>
  );
}

export default function CheckoutReturnPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-blue-50 to-white text-slate-900">
      <SiteHeader />
      <Suspense
        fallback={
          <main className="max-w-lg mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
            <Loader2 className="h-16 w-16 text-sky-600 animate-spin mx-auto mb-6" />
            <p className="text-slate-600">Confirming your payment...</p>
          </main>
        }
      >
        <CheckoutReturnContent />
      </Suspense>
    </div>
  );
}
