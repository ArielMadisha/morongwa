'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ExternalLink, Loader2, MapPinned, Package } from 'lucide-react';
import toast from 'react-hot-toast';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { adminAPI } from '@/lib/api';
import { formatCurrencyAmount } from '@/lib/formatCurrency';

type Shipment = {
  _id: string;
  orderId: { _id: string; status?: string; amounts?: { total?: number } } | string;
  buyerId?: { name?: string; email?: string };
  providerName: string;
  serviceLabel?: string;
  destinationCountry: string;
  deliveryAddress?: string;
  status: string;
  trackingNumber?: string;
  trackingUrl?: string;
  priceCharged: number;
  currency: string;
  deliveryPrepaid?: boolean;
  updatedAt?: string;
};

const STATUSES = ['pending', 'booked', 'in_transit', 'out_for_delivery', 'delivered', 'failed', 'returned', 'cancelled'];

export default function AdminShippingTrackingPage() {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [trackEdit, setTrackEdit] = useState<{
    id: string;
    trackingNumber: string;
    trackingUrl: string;
    status: string;
    note: string;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminAPI.getCourierShipments({
        limit: 100,
        status: statusFilter || undefined,
      });
      setShipments((res.data as { data?: Shipment[] })?.data ?? []);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Failed to load parcels');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const saveTracking = async () => {
    if (!trackEdit) return;
    setSaving(true);
    try {
      await adminAPI.patchCourierShipment(trackEdit.id, {
        status: trackEdit.status,
        trackingNumber: trackEdit.trackingNumber,
        trackingUrl: trackEdit.trackingUrl,
        statusNote: trackEdit.note || undefined,
      });
      toast.success('Tracking updated');
      setTrackEdit(null);
      load();
    } catch {
      toast.error('Update failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ProtectedRoute allowedRoles={['admin', 'superadmin']}>
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-cyan-50 text-slate-800">
        <header className="border-b border-white/60 bg-white/70 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <Link href="/admin/shipping" className="inline-flex items-center gap-2 text-sm text-sky-600 hover:text-sky-700 mb-2">
                <ArrowLeft className="h-4 w-4" /> Back to Shipping
              </Link>
              <p className="text-xs uppercase tracking-[0.35em] text-cyan-700">Qwertymates · Shipping</p>
              <h1 className="mt-1 flex items-center gap-2 text-3xl font-semibold text-slate-900">
                <MapPinned className="h-8 w-8 text-cyan-700" />
                Tracking
              </h1>
              <p className="mt-1 max-w-2xl text-sm text-slate-600">
                Parcels are created when orders are paid. Update tracking numbers and delivery status here.
              </p>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-6 py-8">
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <label className="text-sm font-medium text-slate-700">
              Status
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="ml-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
              >
                <option value="">All</option>
                {STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {st.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </label>
            <Link href="/admin/orders" className="text-sm font-medium text-sky-600 hover:underline">
              View marketplace orders
            </Link>
          </div>

          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-10 w-10 animate-spin text-cyan-600" />
            </div>
          ) : shipments.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-200 bg-white/80 py-16 text-center text-sm text-slate-500">
              No parcels yet — they appear automatically when paid orders include delivery.
            </p>
          ) : (
            <div className="space-y-4">
              {shipments.map((s) => {
                const orderId =
                  typeof s.orderId === 'object' && s.orderId?._id ? String(s.orderId._id) : String(s.orderId);
                return (
                  <div key={s._id} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-900 flex items-center gap-2">
                          <Package className="h-4 w-4 text-cyan-600 shrink-0" />
                          {s.providerName}
                          {s.serviceLabel ? ` · ${s.serviceLabel}` : ''}
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                          Order{' '}
                          <Link href={`/checkout/order/${orderId}`} className="text-sky-600 hover:underline">
                            {orderId.slice(-8)}
                          </Link>
                          {' · '}
                          {s.destinationCountry} · {formatCurrencyAmount(s.priceCharged, s.currency || 'ZAR')}
                        </p>
                        {s.deliveryAddress ? (
                          <p className="text-xs text-slate-600 mt-1 break-words">Address: {s.deliveryAddress}</p>
                        ) : null}
                        <p className="text-xs text-slate-600 mt-1">
                          Status: <span className="font-medium capitalize">{s.status.replace(/_/g, ' ')}</span>
                          {s.trackingNumber ? ` · ${s.trackingNumber}` : ''}
                        </p>
                        {(s.buyerId as { name?: string })?.name ? (
                          <p className="text-xs text-slate-500">Buyer: {(s.buyerId as { name?: string }).name}</p>
                        ) : null}
                        {s.trackingUrl ? (
                          <a
                            href={s.trackingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-sky-600 hover:underline"
                          >
                            Open carrier tracking <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setTrackEdit({
                            id: s._id,
                            trackingNumber: s.trackingNumber || '',
                            trackingUrl: s.trackingUrl || '',
                            status: s.status,
                            note: '',
                          })
                        }
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50"
                      >
                        Update tracking
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>

        {trackEdit ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
              <h3 className="text-lg font-semibold mb-4">Update tracking</h3>
              <div className="space-y-3 text-sm">
                <label className="block">
                  Status
                  <select
                    value={trackEdit.status}
                    onChange={(e) => setTrackEdit({ ...trackEdit, status: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                  >
                    {STATUSES.map((st) => (
                      <option key={st} value={st}>
                        {st.replace(/_/g, ' ')}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  Tracking number
                  <input
                    value={trackEdit.trackingNumber}
                    onChange={(e) => setTrackEdit({ ...trackEdit, trackingNumber: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                  />
                </label>
                <label className="block">
                  Tracking URL
                  <input
                    value={trackEdit.trackingUrl}
                    onChange={(e) => setTrackEdit({ ...trackEdit, trackingUrl: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                    placeholder="https://..."
                  />
                </label>
                <label className="block">
                  Note (optional)
                  <input
                    value={trackEdit.note}
                    onChange={(e) => setTrackEdit({ ...trackEdit, note: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                  />
                </label>
              </div>
              <div className="mt-6 flex gap-2">
                <button type="button" onClick={() => setTrackEdit(null)} className="flex-1 rounded-xl border py-2">
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={saveTracking}
                  className="flex-1 rounded-xl bg-cyan-600 py-2 font-semibold text-white disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </ProtectedRoute>
  );
}
