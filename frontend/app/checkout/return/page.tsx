'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { checkoutAPI } from '@/lib/api';
import SiteHeader from '@/components/SiteHeader';

function CheckoutReturnContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get('orderId');
  const [status, setStatus] = useState<'loading' | 'paid' | 'pending' | 'not_found'>('loading');

  useEffect(() => {
    if (!orderId) {
      setStatus('not_found');
      return;
    }
    checkoutAPI.getOrder(orderId).then((res) => {
      const order = res.data?.data ?? res.data;
      if (!order) {
        setStatus('not_found');
        return;
      }
      setStatus((order as { status: string }).status === 'paid' ? 'paid' : 'pending');
    }).catch(() => setStatus('not_found'));
  }, [orderId]);

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
          <p className="text-slate-600 mb-6">Your order has been paid. We will process it shortly.</p>
          <Link href={orderId ? `/checkout/order/${orderId}` : '/dashboard'} className="inline-flex items-center gap-2 bg-sky-600 text-white px-6 py-3 rounded-xl hover:bg-sky-700 font-medium">View order</Link>
        </>
      )}
      {status === 'pending' && (
        <>
          <Loader2 className="h-16 w-16 text-amber-500 mx-auto mb-6 animate-spin" />
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Payment processing</h1>
          <p className="text-slate-600 mb-6">We are confirming your payment. Refresh in a moment or check your orders.</p>
          <Link href="/dashboard" className="text-sky-600 hover:text-sky-700 font-medium">Go to dashboard</Link>
        </>
      )}
      {status === 'not_found' && (
        <>
          <XCircle className="h-16 w-16 text-slate-400 mx-auto mb-6" />
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Order not found</h1>
          <p className="text-slate-600 mb-6">The order may still be processing or the link is invalid.</p>
          <Link href="/marketplace" className="text-sky-600 hover:text-sky-700 font-medium">Back to marketplace</Link>
        </>
      )}
    </main>
  );
}

export default function CheckoutReturnPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-blue-50 to-white text-slate-900">
      <SiteHeader />
      <Suspense fallback={
        <main className="max-w-lg mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
          <Loader2 className="h-16 w-16 text-sky-600 animate-spin mx-auto mb-6" />
          <p className="text-slate-600">Confirming your payment...</p>
        </main>
      }>
        <CheckoutReturnContent />
      </Suspense>
    </div>
  );
}
