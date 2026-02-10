'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Package, ArrowLeft, CheckCircle } from 'lucide-react';
import { checkoutAPI } from '@/lib/api';
import SiteHeader from '@/components/SiteHeader';
import ProtectedRoute from '@/components/ProtectedRoute';

function formatPrice(price: number) {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);
}

export default function OrderPage() {
  const params = useParams();
  const orderId = params.orderId as string;
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orderId) return;
    checkoutAPI
      .getOrder(orderId)
      .then((res) => setOrder(res.data?.data ?? res.data ?? null))
      .catch(() => setOrder(null))
      .finally(() => setLoading(false));
  }, [orderId]);

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gradient-to-br from-sky-50 to-white flex items-center justify-center">
          <p className="text-slate-600">Loading order...</p>
        </div>
      </ProtectedRoute>
    );
  }

  if (!order) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gradient-to-br from-sky-50 to-white flex items-center justify-center">
          <div className="text-center">
            <p className="text-slate-600 mb-4">Order not found</p>
            <Link href="/marketplace" className="text-sky-600 hover:text-sky-700 font-medium">Back to marketplace</Link>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  const items = order.items ?? [];
  const amounts = order.amounts ?? {};

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-blue-50 to-white text-slate-900">
        <SiteHeader />
        <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <Link
            href="/marketplace"
            className="inline-flex items-center gap-2 text-sky-600 hover:text-sky-700 mb-6 text-sm font-medium"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to marketplace
          </Link>

          <div className="flex items-center gap-3 mb-6">
            {order.status === 'paid' && <CheckCircle className="h-10 w-10 text-emerald-500" />}
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Order #{orderId?.slice(-8)}</h1>
              <p className="text-slate-600 capitalize">{order.status?.replace('_', ' ')}</p>
            </div>
          </div>

          <div className="bg-white/90 rounded-2xl border border-slate-100 p-6 space-y-4 mb-6">
            {items.map((item: any, i: number) => (
              <div key={i} className="flex gap-4 items-center">
                <div className="w-14 h-14 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                  <Package className="h-6 w-6 text-slate-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-900 truncate">
                    {item.productId?.title ?? 'Product'}
                  </p>
                  <p className="text-sm text-slate-500">
                    {item.qty} × {formatPrice(item.price ?? 0)} = {formatPrice((item.qty ?? 0) * (item.price ?? 0))}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-white/90 rounded-2xl border border-slate-100 p-6 space-y-2">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal</span>
              <span>{formatPrice(amounts.subtotal ?? 0)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Shipping</span>
              <span>{formatPrice(amounts.shipping ?? 0)}</span>
            </div>
            <div className="flex justify-between font-bold text-slate-900 text-lg pt-2 border-t border-slate-200">
              <span>Total</span>
              <span>{formatPrice(amounts.total ?? 0)}</span>
            </div>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
