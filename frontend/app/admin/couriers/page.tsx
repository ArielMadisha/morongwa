'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Package, Truck, AlertTriangle, Plus, Pencil } from 'lucide-react';
import toast from 'react-hot-toast';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { adminAPI } from '@/lib/api';
import { formatCurrencyAmount } from '@/lib/formatCurrency';

type Tab = 'tariffs' | 'parcels' | 'disputes';

type Provider = {
  _id: string;
  slug: string;
  name: string;
  coverage: string;
  countries: string[];
  integrationType: string;
  pricingNote?: string;
  active: boolean;
};

type Tariff = {
  _id: string;
  providerId: { _id: string; name: string; slug: string; coverage?: string } | string;
  countryCode: string;
  zone?: string;
  serviceLabel: string;
  minWeightKg: number;
  maxWeightKg: number;
  price: number;
  currency: string;
  minDeliveryDays: number;
  maxDeliveryDays: number;
  active: boolean;
};

type Shipment = {
  _id: string;
  orderId: { _id: string; status?: string; amounts?: { total?: number } } | string;
  buyerId?: { name?: string; email?: string };
  providerName: string;
  serviceLabel?: string;
  destinationCountry: string;
  status: string;
  trackingNumber?: string;
  trackingUrl?: string;
  disputeStatus: string;
  disputeReason?: string;
  priceCharged: number;
  currency: string;
  deliveryPrepaid?: boolean;
  updatedAt?: string;
};

const COUNTRIES = ['ZA', 'BW', 'NA', 'LS', 'SZ', 'ZW', 'ZM', 'MZ'] as const;
const STATUSES = ['pending', 'booked', 'in_transit', 'out_for_delivery', 'delivered', 'failed', 'returned', 'cancelled'];

export default function AdminCouriersPage() {
  const [tab, setTab] = useState<Tab>('tariffs');
  const [providers, setProviders] = useState<Provider[]>([]);
  const [tariffs, setTariffs] = useState<Tariff[]>([]);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [countryFilter, setCountryFilter] = useState('');
  const [editTariff, setEditTariff] = useState<Partial<Tariff> & { providerId?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [trackEdit, setTrackEdit] = useState<{ id: string; trackingNumber: string; trackingUrl: string; status: string; note: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, tRes, sRes] = await Promise.all([
        adminAPI.getCourierProviders(),
        adminAPI.getCourierTariffs(countryFilter ? { countryCode: countryFilter } : undefined),
        adminAPI.getCourierShipments({
          limit: 80,
          disputeStatus: tab === 'disputes' ? 'open' : undefined,
        }),
      ]);
      setProviders((pRes.data as { data?: Provider[] })?.data ?? []);
      setTariffs((tRes.data as { data?: Tariff[] })?.data ?? []);
      setShipments((sRes.data as { data?: Shipment[] })?.data ?? []);
    } catch (e: unknown) {
      const err = e as { response?: { status?: number; data?: { error?: string; message?: string } } };
      const status = err.response?.status;
      const msg = err.response?.data?.error || err.response?.data?.message;
      if (status === 403) {
        toast.error(msg || 'You do not have permission to manage couriers (needs orders or couriers section)');
      } else {
        toast.error(msg || 'Failed to load courier data');
      }
    } finally {
      setLoading(false);
    }
  }, [countryFilter, tab]);

  useEffect(() => {
    load();
  }, [load]);

  const saveTariff = async () => {
    if (!editTariff?.providerId || !editTariff.serviceLabel) {
      toast.error('Provider and service label required');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        providerId: editTariff.providerId,
        countryCode: editTariff.countryCode || 'ZA',
        zone: editTariff.zone,
        serviceLabel: editTariff.serviceLabel,
        minWeightKg: Number(editTariff.minWeightKg) || 0,
        maxWeightKg: Number(editTariff.maxWeightKg) || 5,
        price: Number(editTariff.price),
        currency: editTariff.currency || 'ZAR',
        minDeliveryDays: Number(editTariff.minDeliveryDays) || 3,
        maxDeliveryDays: Number(editTariff.maxDeliveryDays) || 7,
        active: editTariff.active !== false,
      };
      if (editTariff._id) {
        await adminAPI.patchCourierTariff(editTariff._id, payload);
        toast.success('Tariff updated');
      } else {
        await adminAPI.createCourierTariff(payload);
        toast.success('Tariff created');
      }
      setEditTariff(null);
      load();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

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
      toast.success('Parcel updated');
      setTrackEdit(null);
      load();
    } catch {
      toast.error('Update failed');
    } finally {
      setSaving(false);
    }
  };

  const resolveDispute = async (id: string, action: 'investigate' | 'resolve' | 'close', resolution?: string) => {
    try {
      await adminAPI.courierShipmentDispute(id, { action, resolution });
      toast.success('Dispute updated');
      load();
    } catch {
      toast.error('Dispute update failed');
    }
  };

  const providerName = (t: Tariff) =>
    typeof t.providerId === 'object' && t.providerId?.name ? t.providerId.name : '—';

  return (
    <ProtectedRoute allowedRoles={['admin', 'superadmin']}>
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-cyan-50 text-slate-800">
        <header className="border-b border-white/60 bg-white/70 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-widest text-sky-600">Qwertymates</p>
              <h1 className="mt-1 flex items-center gap-2 text-3xl font-semibold text-slate-900">
                <Truck className="h-8 w-8 text-sky-600" />
                Courier configuration
              </h1>
              <p className="mt-1 max-w-2xl text-sm text-slate-600">
                Configure DeliverAI, PAXI, ICExpress, BEX, Triton, BotswanaPost, and Dilwana tariffs. Shoppers see live
                prices at checkout. For parcel tracking, use{' '}
                <Link href="/admin/shipping/tracking" className="font-semibold text-sky-600 hover:underline">
                  Shipping → Tracking
                </Link>
                .
              </p>
            </div>
            <Link
              href="/admin/shipping"
              className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-white/80 px-4 py-2 text-sm font-semibold shadow-sm hover:shadow-md"
            >
              <ArrowLeft className="h-4 w-4" /> Back to Shipping
            </Link>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-6 py-8">
          <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50/90 p-4 text-sm text-emerald-950">
            <p className="font-semibold">Delivery is prepaid at checkout</p>
            <p className="mt-1 text-emerald-900/90">
              Buyers pay products and courier/delivery in one wallet or card payment. Parcels here are for booking and
              tracking only — do not contact buyers to collect courier fees. If delivery shows as not prepaid, escalate
              to engineering before requesting payment.
            </p>
          </div>

          <div className="mb-6 flex flex-wrap gap-2">
            {(['tariffs', 'parcels', 'disputes'] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`rounded-full px-4 py-2 text-sm font-semibold capitalize ${
                  tab === t ? 'bg-sky-600 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-sky-50'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-10 w-10 animate-spin text-sky-600" />
            </div>
          ) : tab === 'tariffs' ? (
            <div className="space-y-6">
              <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                <h2 className="text-sm font-semibold text-slate-900 mb-3">Providers (reference)</h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {providers.map((p) => (
                    <div key={p._id} className="rounded-xl border border-slate-100 p-3 text-sm">
                      <p className="font-semibold text-slate-900">{p.name}</p>
                      <p className="text-xs text-slate-500 capitalize">{p.coverage.replace(/_/g, ' ')} · {p.integrationType}</p>
                      <p className="text-xs text-slate-600 mt-1">{p.countries?.join(', ') || '—'}</p>
                      {p.pricingNote ? <p className="text-xs text-slate-500 mt-2 line-clamp-2">{p.pricingNote}</p> : null}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <label className="text-sm font-medium text-slate-700">
                  Country
                  <select
                    value={countryFilter}
                    onChange={(e) => setCountryFilter(e.target.value)}
                    className="ml-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
                  >
                    <option value="">All</option>
                    {COUNTRIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setEditTariff({
                      countryCode: countryFilter || 'ZA',
                      currency: countryFilter === 'BW' ? 'BWP' : 'ZAR',
                      minWeightKg: 0,
                      maxWeightKg: 5,
                      active: true,
                    })
                  }
                  className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700"
                >
                  <Plus className="h-4 w-4" /> Add tariff
                </button>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-sm">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Provider</th>
                      <th className="px-4 py-3">Country</th>
                      <th className="px-4 py-3">Service</th>
                      <th className="px-4 py-3">Weight (kg)</th>
                      <th className="px-4 py-3">Price</th>
                      <th className="px-4 py-3">ETA (days)</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {tariffs.map((t) => (
                      <tr key={t._id} className={!t.active ? 'opacity-50' : ''}>
                        <td className="px-4 py-3 font-medium">{providerName(t)}</td>
                        <td className="px-4 py-3">
                          {t.countryCode}
                          {t.zone ? <span className="text-xs text-slate-500 block">{t.zone}</span> : null}
                        </td>
                        <td className="px-4 py-3">{t.serviceLabel}</td>
                        <td className="px-4 py-3">
                          {t.minWeightKg}–{t.maxWeightKg}
                        </td>
                        <td className="px-4 py-3">
                          {t.price} {t.currency}
                        </td>
                        <td className="px-4 py-3">
                          {t.minDeliveryDays}–{t.maxDeliveryDays}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() =>
                              setEditTariff({
                                ...t,
                                providerId:
                                  typeof t.providerId === 'object' ? t.providerId._id : String(t.providerId),
                              })
                            }
                            className="text-sky-600 hover:underline inline-flex items-center gap-1"
                          >
                            <Pencil className="h-3.5 w-3.5" /> Edit
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {tariffs.length === 0 ? (
                  <p className="p-8 text-center text-slate-500 text-sm">No tariffs yet — seed runs on first load; add rows above.</p>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {(tab === 'disputes'
                ? shipments.filter((s) => s.disputeStatus === 'open' || s.disputeStatus === 'investigating')
                : shipments
              ).map((s) => {
                const orderId =
                  typeof s.orderId === 'object' && s.orderId?._id ? String(s.orderId._id) : String(s.orderId);
                return (
                  <div key={s._id} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900 flex items-center gap-2">
                          <Package className="h-4 w-4 text-sky-600" />
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
                          {s.deliveryPrepaid !== false ? (
                            <span className="ml-2 inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                              Prepaid at checkout
                            </span>
                          ) : (
                            <span className="ml-2 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
                              Verify payment
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-slate-600 mt-1">
                          {s.serviceLabel ? (
                            <span className="block text-slate-600">{s.serviceLabel}</span>
                          ) : null}
                          Status: <span className="font-medium capitalize">{s.status.replace(/_/g, ' ')}</span>
                          {s.trackingNumber ? ` · Track: ${s.trackingNumber}` : ''}
                        </p>
                        {(s.buyerId as { name?: string })?.name ? (
                          <p className="text-xs text-slate-500">Buyer: {(s.buyerId as { name?: string }).name}</p>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-2">
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
                        {s.disputeStatus === 'open' && (
                          <>
                            <button
                              type="button"
                              onClick={() => resolveDispute(s._id, 'investigate')}
                              className="rounded-lg bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-900"
                            >
                              Investigate
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const resolution = window.prompt('Resolution note for buyer:');
                                if (resolution) resolveDispute(s._id, 'resolve', resolution);
                              }}
                              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white"
                            >
                              Resolve
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    {s.disputeStatus !== 'none' && (
                      <div className="mt-3 rounded-lg bg-amber-50 border border-amber-100 p-3 text-sm">
                        <p className="font-semibold text-amber-900 flex items-center gap-1">
                          <AlertTriangle className="h-4 w-4" /> Dispute: {s.disputeStatus}
                        </p>
                        {s.disputeReason ? <p className="text-amber-800 mt-1">{s.disputeReason}</p> : null}
                      </div>
                    )}
                  </div>
                );
              })}
              {shipments.length === 0 ? (
                <p className="text-center text-slate-500 py-12 text-sm">
                  No parcels yet — they are created automatically as <strong>booked</strong> when orders are paid.
                </p>
              ) : null}
            </div>
          )}
        </main>

        {editTariff ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
              <h3 className="text-lg font-semibold mb-4">{editTariff._id ? 'Edit tariff' : 'New tariff'}</h3>
              <div className="space-y-3 text-sm">
                <label className="block">
                  Provider
                  <select
                    value={editTariff.providerId || ''}
                    onChange={(e) => setEditTariff({ ...editTariff, providerId: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                  >
                    <option value="">Select…</option>
                    {providers.map((p) => (
                      <option key={p._id} value={p._id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    Country
                    <select
                      value={editTariff.countryCode || 'ZA'}
                      onChange={(e) => setEditTariff({ ...editTariff, countryCode: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                    >
                      {COUNTRIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    Currency
                    <input
                      value={editTariff.currency || 'ZAR'}
                      onChange={(e) => setEditTariff({ ...editTariff, currency: e.target.value.toUpperCase() })}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                    />
                  </label>
                </div>
                <label className="block">
                  Zone (optional)
                  <input
                    value={editTariff.zone || ''}
                    onChange={(e) => setEditTariff({ ...editTariff, zone: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                  />
                </label>
                <label className="block">
                  Service label
                  <input
                    value={editTariff.serviceLabel || ''}
                    onChange={(e) => setEditTariff({ ...editTariff, serviceLabel: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                  />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    Min kg
                    <input
                      type="number"
                      step="0.1"
                      value={editTariff.minWeightKg ?? 0}
                      onChange={(e) => setEditTariff({ ...editTariff, minWeightKg: Number(e.target.value) })}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                    />
                  </label>
                  <label className="block">
                    Max kg
                    <input
                      type="number"
                      step="0.1"
                      value={editTariff.maxWeightKg ?? 5}
                      onChange={(e) => setEditTariff({ ...editTariff, maxWeightKg: Number(e.target.value) })}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                    />
                  </label>
                </div>
                <label className="block">
                  Price
                  <input
                    type="number"
                    value={editTariff.price ?? ''}
                    onChange={(e) => setEditTariff({ ...editTariff, price: Number(e.target.value) })}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                  />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    Min days
                    <input
                      type="number"
                      value={editTariff.minDeliveryDays ?? 3}
                      onChange={(e) => setEditTariff({ ...editTariff, minDeliveryDays: Number(e.target.value) })}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                    />
                  </label>
                  <label className="block">
                    Max days
                    <input
                      type="number"
                      value={editTariff.maxDeliveryDays ?? 7}
                      onChange={(e) => setEditTariff({ ...editTariff, maxDeliveryDays: Number(e.target.value) })}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                    />
                  </label>
                </div>
              </div>
              <div className="mt-6 flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditTariff(null)}
                  className="flex-1 rounded-xl border border-slate-200 py-2 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={saveTariff}
                  className="flex-1 rounded-xl bg-sky-600 py-2 font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {trackEdit ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
              <h3 className="text-lg font-semibold mb-4">Update parcel tracking</h3>
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
                        {st}
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
                  className="flex-1 rounded-xl bg-sky-600 py-2 font-semibold text-white disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </ProtectedRoute>
  );
}
