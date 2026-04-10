'use client';

import { useState, useMemo } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { adminAPI } from '@/lib/api';
import { formatCurrencyAmount } from '@/lib/formatCurrency';
import Link from 'next/link';
import { ArrowLeft, Loader2, BarChart2 } from 'lucide-react';
import toast from 'react-hot-toast';

function fmtZar(n: number) {
  return formatCurrencyAmount(n, 'ZAR');
}

export default function AdminDropshippingProfitPage() {
  const today = useMemo(() => new Date(), []);
  const defaultTo = today.toISOString().slice(0, 10);
  const defaultFrom = new Date(today.getTime() - 30 * 86400000).toISOString().slice(0, 10);

  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [groupBy, setGroupBy] = useState<'day' | 'month'>('day');
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<any>(null);

  const [orderId, setOrderId] = useState('');
  const [loadingOrder, setLoadingOrder] = useState(false);
  const [orderProfit, setOrderProfit] = useState<any>(null);

  const loadReport = async () => {
    setLoading(true);
    try {
      const res = await adminAPI.getDropshippingProfitReport({
        from: new Date(from + 'T00:00:00.000Z').toISOString(),
        to: new Date(to + 'T23:59:59.999Z').toISOString(),
        groupBy,
      });
      setReport(res.data?.data ?? res.data);
      toast.success('Report loaded');
    } catch (e: any) {
      toast.error(e.response?.data?.message || e.message || 'Failed to load report');
      setReport(null);
    } finally {
      setLoading(false);
    }
  };

  const loadOrder = async () => {
    const id = orderId.trim();
    if (!id) {
      toast.error('Enter an order ID');
      return;
    }
    setLoadingOrder(true);
    try {
      const res = await adminAPI.getDropshippingOrderProfit(id);
      setOrderProfit(res.data?.data ?? res.data);
      toast.success('Order breakdown loaded');
    } catch (e: any) {
      toast.error(e.response?.data?.message || e.message || 'Failed to load order');
      setOrderProfit(null);
    } finally {
      setLoadingOrder(false);
    }
  };

  const totals = report?.totals;
  const buckets = report?.buckets || [];

  return (
    <ProtectedRoute allowedRoles={['admin', 'superadmin']}>
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-sky-100 text-slate-800">
        <div className="mx-auto max-w-6xl px-4 py-8">
          <Link
            href="/admin"
            className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-sky-700 hover:text-sky-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Admin home
          </Link>

          <div className="mb-8 flex items-start gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
              <BarChart2 className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">Dropshipping & checkout profit</h1>
              <p className="mt-1 text-sm text-slate-600">
                Estimated supplier COGS from stored <code className="text-xs">supplierCost</code>, reseller commission, music
                artist share (70%), PayGate card fee, and net platform commission. Uses paid orders in the selected range.
              </p>
            </div>
          </div>

          <div className="mb-8 rounded-2xl border border-white/60 bg-white/90 p-6 shadow-lg">
            <h2 className="text-lg font-semibold text-slate-900">Single order breakdown</h2>
            <p className="mt-1 text-xs text-slate-500">Paste a MongoDB order <code className="text-xs">_id</code> from Marketplace orders.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <input
                type="text"
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
                placeholder="Order ID"
                className="min-w-[240px] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => void loadOrder()}
                disabled={loadingOrder}
                className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
              >
                {loadingOrder ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Load'}
              </button>
            </div>
            {orderProfit && (
              <div className="mt-6 overflow-x-auto text-sm">
                <table className="w-full border-collapse text-left">
                  <tbody className="divide-y divide-slate-100">
                    <tr>
                      <th className="py-2 pr-4 font-medium text-slate-600">Customer paid</th>
                      <td className="py-2 font-semibold">{fmtZar(orderProfit.customerPaidZar)}</td>
                    </tr>
                    <tr>
                      <th className="py-2 pr-4 font-medium text-slate-600">Product subtotal</th>
                      <td className="py-2">{fmtZar(orderProfit.productSubtotalZar)}</td>
                    </tr>
                    <tr>
                      <th className="py-2 pr-4 font-medium text-slate-600">Music subtotal</th>
                      <td className="py-2">{fmtZar(orderProfit.musicSubtotalZar)}</td>
                    </tr>
                    <tr>
                      <th className="py-2 pr-4 font-medium text-slate-600">Shipping (charged)</th>
                      <td className="py-2">{fmtZar(orderProfit.shippingChargedZar)}</td>
                    </tr>
                    <tr>
                      <th className="py-2 pr-4 font-medium text-slate-600">Reseller commission</th>
                      <td className="py-2">{fmtZar(orderProfit.resellerCommissionZar)}</td>
                    </tr>
                    <tr>
                      <th className="py-2 pr-4 font-medium text-slate-600">PayGate fee (card)</th>
                      <td className="py-2">{fmtZar(orderProfit.paygateFeeZar)}</td>
                    </tr>
                    <tr>
                      <th className="py-2 pr-4 font-medium text-slate-600">Supplier COGS (est.)</th>
                      <td className="py-2">{fmtZar(orderProfit.supplierCogsZar)}</td>
                    </tr>
                    <tr>
                      <th className="py-2 pr-4 font-medium text-slate-600">Music → artist (70%)</th>
                      <td className="py-2">{fmtZar(orderProfit.musicArtistShareZar)}</td>
                    </tr>
                    <tr>
                      <th className="py-2 pr-4 font-medium text-slate-600">Music → platform (30%)</th>
                      <td className="py-2">{fmtZar(orderProfit.musicPlatformShareZar)}</td>
                    </tr>
                    <tr className="bg-emerald-50/80">
                      <th className="py-2 pr-4 font-semibold text-emerald-900">Net platform commission (est.)</th>
                      <td className="py-2 font-bold text-emerald-900">{fmtZar(orderProfit.netPlatformCommissionZar)}</td>
                    </tr>
                  </tbody>
                </table>
                {orderProfit.lines?.length > 0 && (
                  <div className="mt-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Line items</p>
                    <table className="w-full border-collapse text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-200">
                          <th className="py-2">Product</th>
                          <th className="py-2">Source</th>
                          <th className="py-2">Qty</th>
                          <th className="py-2">Revenue</th>
                          <th className="py-2">COGS est.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orderProfit.lines.map((ln: any, i: number) => (
                          <tr key={i} className="border-b border-slate-50">
                            <td className="py-2">{ln.title}</td>
                            <td className="py-2">{ln.supplierSource}</td>
                            <td className="py-2">{ln.qty}</td>
                            <td className="py-2">{fmtZar(ln.lineRevenueZar)}</td>
                            <td className="py-2">
                              {fmtZar(ln.supplierCogsZar)}
                              {ln.supplierCogsMissing ? ' *' : ''}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="mt-2 text-xs text-amber-700">* Missing supplierCost on product — COGS shown as R0.</p>
                  </div>
                )}
                {orderProfit.notes?.length > 0 && (
                  <ul className="mt-4 list-inside list-disc text-xs text-amber-800">
                    {orderProfit.notes.map((n: string, i: number) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-white/60 bg-white/90 p-6 shadow-lg">
            <h2 className="text-lg font-semibold text-slate-900">Aggregate report</h2>
            <div className="mt-4 flex flex-wrap items-end gap-4">
              <label className="text-xs font-medium text-slate-600">
                From
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="text-xs font-medium text-slate-600">
                To
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="text-xs font-medium text-slate-600">
                Group by
                <select
                  value={groupBy}
                  onChange={(e) => setGroupBy(e.target.value as 'day' | 'month')}
                  className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="day">Day</option>
                  <option value="month">Month</option>
                </select>
              </label>
              <button
                type="button"
                onClick={() => void loadReport()}
                disabled={loading}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Run report'}
              </button>
            </div>

            {totals && (
              <div className="mt-6 overflow-x-auto">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Totals (period)</p>
                <table className="w-full min-w-[640px] border-collapse text-sm">
                  <tbody>
                    <tr>
                      <th className="py-1.5 pr-4 text-left font-medium text-slate-600">Orders</th>
                      <td className="py-1.5">{totals.orderCount}</td>
                    </tr>
                    <tr>
                      <th className="py-1.5 pr-4 text-left font-medium text-slate-600">Customer paid</th>
                      <td className="py-1.5">{fmtZar(totals.customerPaidZar)}</td>
                    </tr>
                    <tr>
                      <th className="py-1.5 pr-4 text-left font-medium text-slate-600">Supplier COGS (est.)</th>
                      <td className="py-1.5">{fmtZar(totals.supplierCogsZar)}</td>
                    </tr>
                    <tr>
                      <th className="py-1.5 pr-4 text-left font-medium text-slate-600">Shipping charged</th>
                      <td className="py-1.5">{fmtZar(totals.shippingChargedZar)}</td>
                    </tr>
                    <tr>
                      <th className="py-1.5 pr-4 text-left font-medium text-slate-600">Reseller commission</th>
                      <td className="py-1.5">{fmtZar(totals.resellerCommissionZar)}</td>
                    </tr>
                    <tr>
                      <th className="py-1.5 pr-4 text-left font-medium text-slate-600">PayGate fees</th>
                      <td className="py-1.5">{fmtZar(totals.paygateFeesZar)}</td>
                    </tr>
                    <tr>
                      <th className="py-1.5 pr-4 text-left font-medium text-slate-600">Music → artists</th>
                      <td className="py-1.5">{fmtZar(totals.musicArtistShareZar)}</td>
                    </tr>
                    <tr>
                      <th className="py-1.5 pr-4 text-left font-medium text-slate-600">Music → platform (30%)</th>
                      <td className="py-1.5">{fmtZar(totals.musicPlatformShareZar)}</td>
                    </tr>
                    <tr className="bg-emerald-50/80">
                      <th className="py-2 pr-4 text-left font-semibold text-emerald-900">Net platform commission (est.)</th>
                      <td className="py-2 font-bold text-emerald-900">{fmtZar(totals.netPlatformCommissionZar)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {buckets.length > 0 && (
              <div className="mt-8 overflow-x-auto">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">By {groupBy}</p>
                <table className="w-full min-w-[720px] border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-left">
                      <th className="py-2 pr-2">Period</th>
                      <th className="py-2 pr-2">Orders</th>
                      <th className="py-2 pr-2">Paid</th>
                      <th className="py-2 pr-2">COGS</th>
                      <th className="py-2 pr-2">Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {buckets.map((b: any) => (
                      <tr key={b.key} className="border-b border-slate-50">
                        <td className="py-2 pr-2 font-medium">{b.key}</td>
                        <td className="py-2 pr-2">{b.orderCount}</td>
                        <td className="py-2 pr-2">{fmtZar(b.customerPaidZar)}</td>
                        <td className="py-2 pr-2">{fmtZar(b.supplierCogsZar)}</td>
                        <td className="py-2 pr-2 font-semibold text-emerald-800">{fmtZar(b.netPlatformCommissionZar)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
