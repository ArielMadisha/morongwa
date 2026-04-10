'use client';

import { useState, useEffect } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { adminAPI } from '@/lib/api';
import { formatCurrencyAmount } from '@/lib/formatCurrency';
import Link from 'next/link';
import { ArrowLeft, ShoppingBag, Loader2, Package } from 'lucide-react';
import toast from 'react-hot-toast';

function formatPrice(price: number) {
  return formatCurrencyAmount(price, 'ZAR');
}

interface OrderRow {
  _id: string;
  buyerId: { name?: string; email?: string };
  status: string;
  amounts?: { total?: number; subtotal?: number; shipping?: number };
  paymentMethod?: string;
  paidAt?: string;
  createdAt?: string;
  items?: Array<{ qty: number; price: number }>;
}

export default function AdminOrdersPage() {
  const PAGE_SIZE = 100;
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalOrders, setTotalOrders] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>('');

  useEffect(() => {
    fetchOrders(1);
  }, [statusFilter]);

  const fetchOrders = async (targetPage = 1, append = false) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    try {
      const res = await adminAPI.getOrders({ status: statusFilter || undefined, page: targetPage, limit: PAGE_SIZE });
      const list = res.data?.orders ?? res.data ?? [];
      const next = Array.isArray(list) ? list : [];
      setOrders((prev) => (append ? [...prev, ...next] : next));
      const pagination = res.data?.pagination;
      const pages = Number(pagination?.pages || 1);
      const currentPage = Number(pagination?.page || targetPage || 1);
      const total = Number(pagination?.total || next.length || 0);
      setTotalPages(Number.isFinite(pages) && pages > 0 ? pages : 1);
      setPage(Number.isFinite(currentPage) && currentPage > 0 ? currentPage : 1);
      setTotalOrders(Number.isFinite(total) && total >= 0 ? total : 0);
    } catch {
      toast.error('Failed to load orders');
      if (!append) setOrders([]);
    } finally {
      if (append) setLoadingMore(false);
      else setLoading(false);
    }
  };

  return (
    <ProtectedRoute allowedRoles={['admin', 'superadmin']}>
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-sky-100 text-slate-800">
        <header className="border-b border-white/60 bg-white/70 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
            <div>
              <p className="text-xs uppercase tracking-widest text-sky-600">Qwertymates</p>
              <h1 className="mt-1 text-3xl font-semibold text-slate-900">Marketplace orders</h1>
              <p className="mt-1 text-sm text-slate-600">Checkout / wallet orders from the marketplace.</p>
              <p className="mt-2 text-xs text-slate-500">
                Showing {orders.length} of {totalOrders} orders (page {page} of {totalPages}, {PAGE_SIZE} per page)
              </p>
            </div>
            <Link href="/admin" className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:shadow-md">
              <ArrowLeft className="h-4 w-4" /> Back to admin
            </Link>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-6 py-8">
          <div className="mb-6 flex gap-2">
            {['', 'pending_payment', 'paid', 'processing', 'delivered'].map((s) => (
              <button key={s || 'all'} type="button" onClick={() => { setStatusFilter(s); setPage(1); }} className={`rounded-lg px-4 py-2 text-sm font-medium ${statusFilter === s ? 'bg-sky-600 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
                {s === 'pending_payment' ? 'Pending payment' : s === 'paid' ? 'Paid' : s === 'processing' ? 'Processing' : s === 'delivered' ? 'Delivered' : 'All'}
              </button>
            ))}
          </div>

          <div className="rounded-2xl border border-white/60 bg-white/80 shadow-xl shadow-sky-50 backdrop-blur overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-10 w-10 animate-spin text-sky-600" />
              </div>
            ) : orders.length === 0 ? (
              <div className="py-16 text-center text-slate-500 flex flex-col items-center gap-2">
                <Package className="h-12 w-12 text-slate-300" />
                No orders found.
              </div>
            ) : (
              <div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Buyer</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Status</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Payment</th>
                      <th className="text-right py-3 px-4 text-sm font-semibold text-slate-700">Total</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((ord) => (
                      <tr key={ord._id} className="border-b border-slate-50 hover:bg-slate-50/50">
                        <td className="py-3 px-4">
                          <p className="font-medium text-slate-900">{ord.buyerId?.name ?? '—'}</p>
                          <p className="text-xs text-slate-500">{ord.buyerId?.email ?? '—'}</p>
                        </td>
                        <td className="py-3 px-4 text-sm capitalize">{ord.status?.replace('_', ' ')}</td>
                        <td className="py-3 px-4 text-sm capitalize">{ord.paymentMethod ?? '—'}</td>
                        <td className="py-3 px-4 text-right font-medium text-slate-900">{ord.amounts?.total != null ? formatPrice(ord.amounts.total) : '—'}</td>
                        <td className="py-3 px-4 text-sm text-slate-600">{ord.createdAt ? new Date(ord.createdAt).toLocaleString() : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                  </table>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-white/70 px-4 py-3">
                  <p className="text-xs text-slate-500">Page {page} of {totalPages}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => fetchOrders(page - 1)}
                      disabled={page <= 1 || loading || loadingMore}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      Previous page
                    </button>
                    <button
                      type="button"
                      onClick={() => fetchOrders(page + 1)}
                      disabled={page >= totalPages || loading || loadingMore}
                      className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-sm font-medium text-sky-700 hover:bg-sky-100 disabled:opacity-50"
                    >
                      Next page
                    </button>
                    <button
                      type="button"
                      onClick={() => fetchOrders(page + 1, true)}
                      disabled={page >= totalPages || loading || loadingMore}
                      className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
                    >
                      {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Load more
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
