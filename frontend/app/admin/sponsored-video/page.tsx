'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { adminAPI } from '@/lib/api';
import {
  ArrowLeft,
  BarChart3,
  Building2,
  Loader2,
  Plus,
  Trash2,
  Video,
  Pencil,
} from 'lucide-react';
import toast from 'react-hot-toast';

type Advertiser = {
  _id: string;
  name: string;
  contactEmail?: string;
  contactPhone?: string;
  notes?: string;
  active?: boolean;
};

type SponsoredAd = {
  _id: string;
  advertiserId: string;
  title: string;
  videoUrl: string;
  caption?: string;
  placements: string[];
  weight: number;
  approved: boolean;
  active: boolean;
  startDate?: string;
  endDate?: string;
  rateZarPerThousandImpressions?: number;
  adType?: 'CPM' | 'CPC' | 'CPA' | 'HYBRID';
  cpmRate?: number;
  cpcRate?: number;
  cpaRate?: number;
  targetAudience?: 'generic' | 'wallet' | 'runner' | 'merchant' | 'shopper';
  moduleCategory?: 'wallet' | 'marketplace' | 'errands' | 'jobs' | 'merchant' | 'general';
  priority?: number;
};

function isVideoCreativeUrl(url: string): boolean {
  const u = String(url || "").trim().toLowerCase().split('?')[0]?.split('#')[0] || '';
  return /^https:\/\//i.test(String(url || '').trim()) && /\.(mp4|mov|m4v)$/.test(u);
}

const PLACEMENTS = [
  { id: "wa_premenu_main", label: "WhatsApp: before main menu (welcome / legacy)" },
  { id: "wa_menu_about", label: "WhatsApp: before About Qwertymates (main menu 1)" },
  { id: "wa_menu_marketplace", label: "WhatsApp: after Marketplace (main menu 2)" },
  { id: "wa_menu_errands", label: "WhatsApp: after Errands (main menu 3)" },
  { id: "wa_menu_mystore", label: "WhatsApp: after My Store (main menu 4)" },
  {
    id: "wa_menu_wallet",
    label:
      "WhatsApp: before ACBPay Wallet menu (main menu 5) — video then Send / Request / Withdraw / QR / Merchant",
  },
  { id: "wa_menu_jobs", label: "WhatsApp: after Jobs (main menu 6)" },
  { id: "wa_menu_cart", label: "WhatsApp: after Cart summary (main menu 7)" },
  { id: "wa_wallet_merchant", label: "WhatsApp: after Merchant apply (wallet menu 5)" },
  { id: "wa_premenu_acbpay", label: "Legacy: wa_premenu_acbpay (wallet / jobs overlap)" },
  { id: "web_home", label: "Web: home / landing" },
  { id: "web_wall", label: "Web: community wall" },
  { id: "web_marketplace", label: "Web: marketplace" },
  { id: "web_checkout", label: "Web: checkout" },
  { id: "web_tv", label: "Web: QwertyTV" },
  { id: "web_jobs", label: "Web: jobs" },
  { id: "web_wallet", label: "Web: wallet" },
];

function SponsoredVideoAdmin() {
  const [tab, setTab] = useState<'revenue' | 'clients' | 'ads'>('revenue');
  const [loading, setLoading] = useState(true);
  const [advertisers, setAdvertisers] = useState<Advertiser[]>([]);
  const [ads, setAds] = useState<SponsoredAd[]>([]);
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [summary, setSummary] = useState<{
    from: string;
    to: string;
    rows: { advertiserId: string; advertiserName: string; impressions: number; earnedZar: number }[];
    totals: { impressions: number; earnedZar: number };
  } | null>(null);
  const [overview, setOverview] = useState<any>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const [advForm, setAdvForm] = useState({ name: '', contactEmail: '', contactPhone: '', notes: '', active: true });
  const [adForm, setAdForm] = useState({
    advertiserId: '',
    title: '',
    videoUrl: '',
    caption: '',
    placements: ['wa_menu_wallet'] as string[],
    weight: 1,
    approved: false,
    active: true,
    startDate: '',
    endDate: '',
    rateZarPerThousandImpressions: 0,
    adType: 'CPM' as 'CPM' | 'CPC' | 'CPA' | 'HYBRID',
    cpmRate: 40,
    cpcRate: 1,
    cpaRate: 20,
    targetAudience: 'generic' as 'generic' | 'wallet' | 'runner' | 'merchant' | 'shopper',
    moduleCategory: 'general' as 'wallet' | 'marketplace' | 'errands' | 'jobs' | 'merchant' | 'general',
    priority: 1,
  });
  const [editingAd, setEditingAd] = useState<SponsoredAd | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [a, b] = await Promise.all([
        adminAPI.getSponsoredAdvertisers(),
        adminAPI.getSponsoredVideoAds(),
      ]);
      setAdvertisers((a.data as any)?.data || []);
      setAds((b.data as any)?.data || []);
      const ov = await adminAPI.getSponsoredOverview();
      setOverview((ov.data as any)?.data || null);
    } catch {
      toast.error('Failed to load sponsored video data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const fetchSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const res = await adminAPI.getSponsoredVideoRevenueSummary({ from, to });
      setSummary((res.data as any)?.data || null);
    } catch {
      toast.error('Failed to load revenue summary');
    } finally {
      setSummaryLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    if (tab === 'revenue') void fetchSummary();
  }, [tab, fetchSummary]);

  const advOptions = useMemo(
    () =>
      advertisers.map((x) => (
        <option key={x._id} value={x._id}>
          {x.name}
        </option>
      )),
    [advertisers]
  );

  const createAdvertiser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!advForm.name.trim()) {
      toast.error('Client name required');
      return;
    }
    try {
      await adminAPI.createSponsoredAdvertiser(advForm);
      toast.success('Client created');
      setAdvForm({ name: '', contactEmail: '', contactPhone: '', notes: '', active: true });
      await loadAll();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Create failed');
    }
  };

  const deleteAdvertiser = async (id: string) => {
    if (!confirm('Delete this client? They must have no video ads.')) return;
    try {
      await adminAPI.deleteSponsoredAdvertiser(id);
      toast.success('Deleted');
      await loadAll();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Delete failed');
    }
  };

  const saveAd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adForm.advertiserId || !adForm.title.trim() || !adForm.videoUrl.trim()) {
      toast.error('Client, title, and video URL required');
      return;
    }
    const url = adForm.videoUrl.trim();
    if (!/^https:\/\//i.test(url)) {
      toast.error('Creative URL must start with https://');
      return;
    }
    if (!isVideoCreativeUrl(url)) {
      toast.error('Video URL must end with .mp4, .mov, or .m4v');
      return;
    }
    try {
      if (editingAd) {
        await adminAPI.updateSponsoredVideoAd(editingAd._id, {
          ...adForm,
          startDate: adForm.startDate || undefined,
          endDate: adForm.endDate || undefined,
        });
        toast.success('Video ad updated');
      } else {
        await adminAPI.createSponsoredVideoAd({
          ...adForm,
          startDate: adForm.startDate || undefined,
          endDate: adForm.endDate || undefined,
        });
        toast.success('Video ad created');
      }
      setEditingAd(null);
      setAdForm({
        advertiserId: adForm.advertiserId,
        title: '',
        videoUrl: '',
        caption: '',
        placements: ['wa_menu_wallet'],
        weight: 1,
        approved: false,
        active: true,
        startDate: '',
        endDate: '',
        rateZarPerThousandImpressions: 0,
        adType: 'CPM',
        cpmRate: 40,
        cpcRate: 1,
        cpaRate: 20,
        targetAudience: 'generic',
        moduleCategory: 'general',
        priority: 1,
      });
      await loadAll();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Save failed');
    }
  };

  const startEditAd = (ad: SponsoredAd) => {
    setEditingAd(ad);
    setAdForm({
      advertiserId: String(ad.advertiserId),
      title: ad.title,
      videoUrl: ad.videoUrl,
      caption: ad.caption || '',
      placements: Array.isArray(ad.placements) && ad.placements.length ? [...ad.placements] : ['wa_menu_wallet'],
      weight: Number(ad.weight) || 1,
      approved: Boolean(ad.approved),
      active: ad.active !== false,
      startDate: ad.startDate ? String(ad.startDate).slice(0, 10) : '',
      endDate: ad.endDate ? String(ad.endDate).slice(0, 10) : '',
      rateZarPerThousandImpressions: Number(ad.rateZarPerThousandImpressions) || 0,
      adType: (ad.adType as any) || 'CPM',
      cpmRate: Number(ad.cpmRate) || 0,
      cpcRate: Number(ad.cpcRate) || 0,
      cpaRate: Number(ad.cpaRate) || 0,
      targetAudience: (ad.targetAudience as any) || 'generic',
      moduleCategory: (ad.moduleCategory as any) || 'general',
      priority: Number(ad.priority) || 1,
    });
    setTab('ads');
  };

  const deleteAd = async (id: string) => {
    if (!confirm('Delete this video ad?')) return;
    try {
      await adminAPI.deleteSponsoredVideoAd(id);
      toast.success('Deleted');
      await loadAll();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Delete failed');
    }
  };

  const togglePlacement = (id: string) => {
    setAdForm((f) => {
      const has = f.placements.includes(id);
      const next = has ? f.placements.filter((p) => p !== id) : [...f.placements, id];
      return { ...f, placements: next.length ? next : ['wa_menu_wallet'] };
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50/40 text-slate-800">
      <header className="border-b border-white/60 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-emerald-700">Qwertymates</p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-900">Sponsored video ads</h1>
            <p className="mt-1 text-sm text-slate-600">
              <strong className="font-medium text-slate-800">Clients</strong> → create or pick an{' '}
              <strong className="font-medium text-slate-800">Advertiser</strong>.{' '}
              <strong className="font-medium text-slate-800">Ads</strong> → create a{' '}
              <strong className="font-medium text-slate-800">SponsoredVideoAd</strong> with a public{' '}
              <code className="rounded bg-slate-100 px-1 text-xs">https</code> video URL (
              <code className="rounded bg-slate-100 px-1 text-xs">.mp4</code> /{' '}
              <code className="rounded bg-slate-100 px-1 text-xs">.mov</code> /{' '}
              <code className="rounded bg-slate-100 px-1 text-xs">.m4v</code>
              ), placement keys (WhatsApp + web — listed under the form), and <strong className="font-medium text-slate-800">approved</strong> /{' '}
              <strong className="font-medium text-slate-800">active</strong> per your process.
            </p>
            <p className="mt-2 text-xs text-slate-500">
              <strong className="font-medium text-slate-700">WhatsApp timing</strong> is decided in{' '}
              <strong className="font-medium text-slate-700">Twilio Studio</strong> (which menu step calls your API). This page stores the creative metadata the live flow/backend reads — it does not replace Studio routing. Self-serve campaigns use{' '}
              <code className="rounded bg-slate-100 px-1">POST /api/ads/create</code> or{' '}
              <code className="rounded bg-slate-100 px-1">POST /api/adverts/create</code>
              {' '}
              and still appear here as SponsoredVideoAd rows (often pending approval). Slot sidebar images stay on{' '}
              <Link href="/admin/adverts" className="font-semibold text-emerald-800 underline-offset-2 hover:underline">
                /admin/adverts
              </Link>
              .
            </p>
          </div>
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Admin home
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8 space-y-6">
        <div className="flex flex-wrap gap-2">
          {(
            [
              { id: 'revenue' as const, label: 'Revenue', icon: BarChart3 },
              { id: 'clients' as const, label: 'Clients', icon: Building2 },
              { id: 'ads' as const, label: 'Ads', icon: Video },
            ] as const
          ).map((t) => {
            const Icon = t.icon;
            const on = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold border ${
                  on ? 'bg-emerald-700 text-white border-emerald-700' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
          </div>
        ) : tab === 'revenue' ? (
          <section className="rounded-2xl border border-slate-100 bg-white/90 p-6 shadow-sm">
            {overview ? (
              <div className="grid gap-3 md:grid-cols-4 mb-4">
                <div className="rounded-lg border p-3"><p className="text-xs text-slate-500">Total Revenue (Today)</p><p className="font-semibold">R{Number(overview.todayRevenue || 0).toFixed(2)}</p></div>
                <div className="rounded-lg border p-3"><p className="text-xs text-slate-500">Impressions</p><p className="font-semibold">{Number(overview.impressions || 0)}</p></div>
                <div className="rounded-lg border p-3"><p className="text-xs text-slate-500">Clicks</p><p className="font-semibold">{Number(overview.clicks || 0)}</p></div>
                <div className="rounded-lg border p-3"><p className="text-xs text-slate-500">Conversions</p><p className="font-semibold">{Number(overview.conversions || 0)}</p></div>
              </div>
            ) : null}
            <h2 className="text-lg font-semibold text-slate-900">Impressions &amp; earned (CPM)</h2>
            <p className="mt-1 text-xs text-slate-500">
              Earned = (rate ZAR / 1,000) × impressions when each ad has a rate set. Phone numbers are stored hashed only.
            </p>
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">From</label>
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">To</label>
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" />
              </div>
              <button
                type="button"
                onClick={() => void fetchSummary()}
                className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
              >
                Refresh
              </button>
            </div>
            {summaryLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
              </div>
            ) : summary ? (
              <div className="mt-6 overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="border-b text-xs text-slate-500">
                      <th className="py-2 pr-4">Client</th>
                      <th className="py-2 pr-4">Impressions</th>
                      <th className="py-2">Earned (ZAR)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.rows.map((r) => (
                      <tr key={r.advertiserId} className="border-b border-slate-100">
                        <td className="py-2 pr-4 font-medium text-slate-900">{r.advertiserName}</td>
                        <td className="py-2 pr-4">{r.impressions}</td>
                        <td className="py-2">R{r.earnedZar.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="font-semibold text-slate-900">
                      <td className="pt-3">Total</td>
                      <td className="pt-3">{summary.totals.impressions}</td>
                      <td className="pt-3">R{summary.totals.earnedZar.toFixed(2)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <p className="mt-6 text-sm text-slate-500">No data.</p>
            )}
          </section>
        ) : tab === 'clients' ? (
          <section className="rounded-2xl border border-slate-100 bg-white/90 p-6 shadow-sm space-y-6">
            <form onSubmit={createAdvertiser} className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              <div className="md:col-span-2 lg:col-span-3">
                <h2 className="text-lg font-semibold text-slate-900">Add client (advertiser)</h2>
              </div>
              <input
                placeholder="Company / client name *"
                value={advForm.name}
                onChange={(e) => setAdvForm((f) => ({ ...f, name: e.target.value }))}
                className="rounded-lg border px-3 py-2 text-sm"
              />
              <input
                placeholder="Contact email"
                value={advForm.contactEmail}
                onChange={(e) => setAdvForm((f) => ({ ...f, contactEmail: e.target.value }))}
                className="rounded-lg border px-3 py-2 text-sm"
              />
              <input
                placeholder="Contact phone"
                value={advForm.contactPhone}
                onChange={(e) => setAdvForm((f) => ({ ...f, contactPhone: e.target.value }))}
                className="rounded-lg border px-3 py-2 text-sm"
              />
              <div className="md:col-span-2 flex items-center gap-2">
                <input
                  id="advActive"
                  type="checkbox"
                  checked={advForm.active}
                  onChange={(e) => setAdvForm((f) => ({ ...f, active: e.target.checked }))}
                />
                <label htmlFor="advActive" className="text-sm">
                  Active
                </label>
              </div>
              <button type="submit" className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800">
                <Plus className="h-4 w-4" />
                Add client
              </button>
            </form>
            <div className="border-t pt-4">
              <h3 className="text-sm font-semibold text-slate-800 mb-2">Clients</h3>
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
                {advertisers.map((a) => (
                  <li key={a._id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                    <div>
                      <p className="font-medium text-slate-900">{a.name}</p>
                      <p className="text-xs text-slate-500">
                        {a.contactEmail || '—'} · {a.active === false ? 'Inactive' : 'Active'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void deleteAdvertiser(a._id)}
                      className="rounded-lg border border-red-200 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="inline h-3 w-3 mr-1" />
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ) : (
          <section className="rounded-2xl border border-slate-100 bg-white/90 p-6 shadow-sm space-y-6">
            <h2 className="text-lg font-semibold text-slate-900">{editingAd ? 'Edit ad' : 'New ad'}</h2>
            <form onSubmit={saveAd} className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Client *</label>
                <select
                  value={adForm.advertiserId}
                  onChange={(e) => setAdForm((f) => ({ ...f, advertiserId: e.target.value }))}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                >
                  <option value="">Select…</option>
                  {advOptions}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Title *</label>
                <input
                  value={adForm.title}
                  onChange={(e) => setAdForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">Video URL (https .mp4/.mov/.m4v) *</label>
                <input
                  value={adForm.videoUrl}
                  onChange={(e) => setAdForm((f) => ({ ...f, videoUrl: e.target.value }))}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                />
              </div>
              <div className="text-xs text-slate-500 flex items-end pb-2">
                WhatsApp sends this URL as a video card before the submenu text.
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">Caption (optional)</label>
                <input
                  value={adForm.caption}
                  onChange={(e) => setAdForm((f) => ({ ...f, caption: e.target.value }))}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Weight (rotation)</label>
                <input
                  type="number"
                  min={0}
                  value={adForm.weight}
                  onChange={(e) => setAdForm((f) => ({ ...f, weight: Number(e.target.value) }))}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Priority</label>
                <input type="number" min={0} value={adForm.priority} onChange={(e) => setAdForm((f) => ({ ...f, priority: Number(e.target.value) }))} className="w-full rounded-lg border px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Start date (optional)</label>
                <input
                  type="date"
                  value={adForm.startDate}
                  onChange={(e) => setAdForm((f) => ({ ...f, startDate: e.target.value }))}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">End date (optional)</label>
                <input
                  type="date"
                  value={adForm.endDate}
                  onChange={(e) => setAdForm((f) => ({ ...f, endDate: e.target.value }))}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Ad type</label>
                <select value={adForm.adType} onChange={(e) => setAdForm((f) => ({ ...f, adType: e.target.value as any }))} className="w-full rounded-lg border px-3 py-2 text-sm">
                  <option value="CPM">CPM</option><option value="CPC">CPC</option><option value="CPA">CPA</option><option value="HYBRID">HYBRID</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Target audience</label>
                <select value={adForm.targetAudience} onChange={(e) => setAdForm((f) => ({ ...f, targetAudience: e.target.value as any }))} className="w-full rounded-lg border px-3 py-2 text-sm">
                  <option value="generic">All users</option><option value="wallet">Wallet users</option><option value="runner">Runners</option><option value="merchant">Merchants</option><option value="shopper">Shoppers</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Module category (routing + WA bias)</label>
                <select value={adForm.moduleCategory} onChange={(e) => setAdForm((f) => ({ ...f, moduleCategory: e.target.value as any }))} className="w-full rounded-lg border px-3 py-2 text-sm">
                  <option value="wallet">Wallet</option><option value="errands">Errands</option><option value="marketplace">Marketplace</option><option value="jobs">Jobs</option><option value="merchant">Merchant</option><option value="general">Dashboard/General</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">CPM rate</label>
                <input type="number" min={0} step="0.01" value={adForm.cpmRate} onChange={(e) => setAdForm((f) => ({ ...f, cpmRate: Number(e.target.value) }))} className="w-full rounded-lg border px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">CPC rate</label>
                <input type="number" min={0} step="0.01" value={adForm.cpcRate} onChange={(e) => setAdForm((f) => ({ ...f, cpcRate: Number(e.target.value) }))} className="w-full rounded-lg border px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">CPA rate</label>
                <input type="number" min={0} step="0.01" value={adForm.cpaRate} onChange={(e) => setAdForm((f) => ({ ...f, cpaRate: Number(e.target.value) }))} className="w-full rounded-lg border px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">ZAR / 1,000 impressions (0 = track only)</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={adForm.rateZarPerThousandImpressions}
                  onChange={(e) => setAdForm((f) => ({ ...f, rateZarPerThousandImpressions: Number(e.target.value) }))}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                />
              </div>
              <div className="md:col-span-2">
                <p className="text-xs font-medium text-slate-600 mb-2">Placements (WhatsApp + web)</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {PLACEMENTS.map((p) => (
                    <label key={p.id} className="inline-flex items-start gap-2 text-sm rounded-lg border border-slate-100 px-3 py-2 hover:bg-slate-50">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={adForm.placements.includes(p.id)}
                        onChange={() => togglePlacement(p.id)}
                      />
                      <span>
                        <span className="font-mono text-xs text-slate-500">{p.id}</span>
                        <span className="block text-slate-800">{p.label}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="adApproved"
                  type="checkbox"
                  checked={adForm.approved}
                  onChange={(e) => setAdForm((f) => ({ ...f, approved: e.target.checked }))}
                />
                <label htmlFor="adApproved" className="text-sm">
                  Approved (only approved ads go live)
                </label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="adActive"
                  type="checkbox"
                  checked={adForm.active}
                  onChange={(e) => setAdForm((f) => ({ ...f, active: e.target.checked }))}
                />
                <label htmlFor="adActive" className="text-sm">
                  Active
                </label>
              </div>
              <div className="md:col-span-2 flex flex-wrap gap-2">
                <button type="submit" className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800">
                  {editingAd ? 'Save changes' : 'Create ad'}
                </button>
                {editingAd ? (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingAd(null);
                      setAdForm({
                        advertiserId: '',
                        title: '',
                        videoUrl: '',
                        caption: '',
                        placements: ['wa_menu_wallet'],
                        weight: 1,
                        approved: false,
                        active: true,
                        startDate: '',
                        endDate: '',
                        rateZarPerThousandImpressions: 0,
                        adType: 'CPM',
                        cpmRate: 40,
                        cpcRate: 1,
                        cpaRate: 20,
                        targetAudience: 'generic',
                        moduleCategory: 'general',
                        priority: 1,
                      });
                    }}
                    className="rounded-lg border px-4 py-2 text-sm"
                  >
                    Cancel edit
                  </button>
                ) : null}
              </div>
            </form>

            <div className="border-t pt-4">
              <h3 className="text-sm font-semibold text-slate-800 mb-2">All ads</h3>
              <div className="space-y-2">
                {ads.map((ad) => (
                  <div key={ad._id} className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-slate-100 px-4 py-3">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900">{ad.title}</p>
                      <p className="text-xs text-slate-500 truncate" title={ad.videoUrl}>
                        {ad.videoUrl}
                      </p>
                      <p className="text-xs text-slate-600 mt-1">
                        video-card · {(ad.placements || []).join(', ')} · {ad.adType || 'CPM'} · audience {ad.targetAudience || 'generic'} · module{' '}
                        {ad.moduleCategory || 'general'} · weight {ad.weight}
                        {ad.startDate ? ` · start ${String(ad.startDate).slice(0, 10)}` : ''}
                        {ad.endDate ? ` · end ${String(ad.endDate).slice(0, 10)}` : ''}
                        · {ad.approved ? 'approved' : 'draft'} · {ad.active === false ? 'inactive' : 'active'}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => startEditAd(ad)}
                        className="rounded-lg border px-2 py-1 text-xs font-medium hover:bg-slate-50"
                      >
                        <Pencil className="inline h-3 w-3 mr-1" />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteAd(ad._id)}
                        className="rounded-lg border border-red-200 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default function ProtectedSponsoredVideoPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'superadmin']}>
      <SponsoredVideoAdmin />
    </ProtectedRoute>
  );
}
