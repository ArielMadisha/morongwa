'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { adminAPI } from '@/lib/api';
import {
  ArrowLeft,
  Loader2,
  Megaphone,
  CheckCircle,
  Clock,
  XCircle,
  ExternalLink,
  Layers,
  PieChart,
  RefreshCw,
} from 'lucide-react';
import toast from 'react-hot-toast';

type OnboardingFilter = '' | 'pending' | 'approved' | 'rejected';

type AdvertiserRow = {
  _id: string;
  name: string;
  companyName?: string;
  contactEmail?: string;
  contactPhone?: string;
  notes?: string;
  active?: boolean;
  verified?: boolean;
  walletBalance?: number;
  webOnboardingStatus?: 'pending' | 'approved' | 'rejected';
  webPackageTier?: string;
  webOnboardingNotes?: string;
  createdAt?: string;
};

function statusLabel(s: AdvertiserRow['webOnboardingStatus']) {
  if (s === 'pending') return { text: 'Pending review', Icon: Clock, className: 'bg-amber-100 text-amber-900' };
  if (s === 'rejected') return { text: 'Rejected', Icon: XCircle, className: 'bg-red-100 text-red-900' };
  if (s === 'approved')
    return { text: 'Approved', Icon: CheckCircle, className: 'bg-emerald-100 text-emerald-900' };
  return { text: 'Approved (legacy)', Icon: CheckCircle, className: 'bg-slate-100 text-slate-800' };
}

const PACKAGE_CARDS = [
  {
    tier: 'starter',
    title: 'Starter plan',
    emoji: '🥉',
    price: 'R500',
    bullets: ['10,000 impressions', 'Web placements (wallet, marketplace, home, …)', 'Basic targeting', 'Duration: 7 days'],
  },
  {
    tier: 'growth',
    title: 'Growth plan',
    emoji: '🥈',
    price: 'R2,000',
    bullets: ['50,000 impressions', 'Advanced targeting', 'Performance tracking', 'Priority web placement'],
  },
  {
    tier: 'premium',
    title: 'Premium plan',
    emoji: '🥇',
    price: 'R5,000 – R10,000',
    bullets: ['100,000+ impressions', 'Wallet + errands-oriented modules', 'Dedicated campaign support', 'Custom targeting'],
  },
];

const ADD_ONS = [
  { label: 'CPC', detail: 'R1 per click' },
  { label: 'CPA', detail: 'R10 – R50 per action' },
  { label: 'Wallet top banner', detail: 'R1,000/week' },
  { label: 'Marketplace featured row', detail: 'R800/week' },
  { label: 'Errands page boost', detail: 'R1,200/week' },
];

const VIDEO_PACK =
  'Video ad pack: 50,000 views · Web placements · R3,000 – R6,000 (WhatsApp surfaces can be enabled later without changing this admin flow).';

export default function AdminAdvertisingPackagesPage() {
  const [filter, setFilter] = useState<OnboardingFilter>('');
  const [rows, setRows] = useState<AdvertiserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [packageDrafts, setPackageDrafts] = useState<Record<string, string>>({});

  const [ledgerFrom, setLedgerFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [ledgerTo, setLedgerTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [ledger, setLedger] = useState<Record<string, unknown> | null>(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  const loadLedger = useCallback(async () => {
    setLedgerLoading(true);
    try {
      const res = await adminAPI.getSponsoredVideoRevenueLedger({ from: ledgerFrom, to: ledgerTo });
      setLedger((res.data?.data as Record<string, unknown>) ?? null);
    } catch {
      toast.error('Could not load revenue ledger');
      setLedger(null);
    } finally {
      setLedgerLoading(false);
    }
  }, [ledgerFrom, ledgerTo]);

  useEffect(() => {
    loadLedger();
  }, [loadLedger]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params =
        filter === ''
          ? undefined
          : ({
              webOnboarding: filter,
            } as { webOnboarding: OnboardingFilter });
      const res = await adminAPI.getSponsoredAdvertisers(params as { webOnboarding?: 'pending' | 'approved' | 'rejected' });
      const list = res.data?.data ?? [];
      setRows(Array.isArray(list) ? list : []);
    } catch {
      toast.error('Failed to load advertisers');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const updateAdvertiser = async (
    id: string,
    patch: Parameters<typeof adminAPI.updateSponsoredAdvertiser>[1]
  ) => {
    setBusyId(id);
    try {
      await adminAPI.updateSponsoredAdvertiser(id, patch);
      toast.success('Saved');
      await load();
    } catch (e: unknown) {
      const msg =
        typeof e === 'object' && e !== null && 'response' in e
          ? (e as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast.error(msg || 'Update failed');
    } finally {
      setBusyId(null);
    }
  };

  const effectiveTier = (r: AdvertiserRow) =>
    packageDrafts[r._id] !== undefined ? packageDrafts[r._id] : r.webPackageTier || '';

  return (
    <ProtectedRoute allowedRoles={['admin', 'superadmin']}>
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-sky-100 text-slate-800">
        <header className="border-b border-white/60 bg-white/70 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-6 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-widest text-indigo-600">Qwertymates · Web ads</p>
              <h1 className="mt-1 flex items-center gap-2 text-3xl font-semibold text-slate-900">
                <Megaphone className="h-8 w-8 text-indigo-600" /> Advertising packages & onboarding
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-600">
                Published rate card for sales and support. Approve self-serve advertiser accounts for web campaigns, assign a
                package tier, then create <strong className="font-medium text-slate-800">SponsoredVideoAd</strong> creatives
                (WhatsApp + web placements) under{' '}
                <strong className="font-medium text-slate-800">Sponsored video</strong>. Slot sidebar <em>images</em> stay on{' '}
                <Link href="/admin/adverts" className="font-semibold text-indigo-700 hover:underline">
                  /admin/adverts
                </Link>
                .
              </p>
              <div className="mt-3 flex flex-wrap gap-3 text-sm">
                <Link
                  href="/admin/sponsored-video"
                  className="inline-flex items-center gap-1.5 font-semibold text-indigo-600 hover:text-indigo-800"
                >
                  Open sponsored video admin <ExternalLink className="h-3.5 w-3.5" />
                </Link>
                <span className="text-slate-300">|</span>
                <Link href="/admin/adverts" className="font-semibold text-indigo-600 hover:text-indigo-800">
                  Platform slot adverts
                </Link>
              </div>
            </div>
            <Link
              href="/admin"
              className="inline-flex items-center gap-2 self-start rounded-full border border-slate-200 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:shadow-md"
            >
              <ArrowLeft className="h-4 w-4" /> Back to admin
            </Link>
          </div>
        </header>

        <main className="mx-auto max-w-6xl space-y-10 px-6 py-10">
          <section>
            <div className="mb-4 flex items-center gap-2">
              <Layers className="h-5 w-5 text-indigo-600" />
              <h2 className="text-xl font-semibold text-slate-900">Qwertymates advertising packages</h2>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {PACKAGE_CARDS.map((p) => (
                <div
                  key={p.tier}
                  className="rounded-2xl border border-white/70 bg-white/90 p-5 shadow-lg shadow-indigo-50 backdrop-blur"
                >
                  <p className="text-2xl">
                    {p.emoji} <span className="text-lg font-semibold text-slate-900">{p.title}</span>
                  </p>
                  <p className="mt-2 text-2xl font-bold text-indigo-700">{p.price}</p>
                  <ul className="mt-3 space-y-1.5 text-sm text-slate-600">
                    {p.bullets.map((b) => (
                      <li key={b}>• {b}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-100 bg-white/90 p-5 shadow-sm">
                <h3 className="font-semibold text-slate-900">Add-on pricing</h3>
                <ul className="mt-2 space-y-1 text-sm text-slate-600">
                  {ADD_ONS.map((a) => (
                    <li key={a.label}>
                      <span className="font-medium text-slate-800">{a.label}</span> — {a.detail}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-white/90 p-5 shadow-sm">
                <h3 className="font-semibold text-slate-900">Premium video campaign</h3>
                <p className="mt-2 text-sm text-slate-600">{VIDEO_PACK}</p>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-white/70 bg-white/85 p-6 shadow-xl shadow-indigo-50 backdrop-blur">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="flex items-start gap-2">
                <PieChart className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" />
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">Prepaid billing & revenue split</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Each billed event debits the advertiser wallet; the same gross is attributed to{' '}
                    <strong className="text-slate-800">platform</strong> vs{' '}
                    <strong className="text-slate-800">partner / incentive pool</strong> via{' '}
                    <code className="rounded bg-slate-100 px-1 text-xs">AD_PLATFORM_SHARE_PCT</code> (default 85%). CPM uses
                    (cpm÷1000)×audience multiplier per impression; CPC/CPA flat per event. Auto-pauses creatives when wallet
                    is insufficient.
                  </p>
                  <ul className="mt-3 list-inside list-disc text-xs text-slate-600">
                    <li>Ledger: AdTransaction rows (audit trail)</li>
                    <li>Rollups: PlatformAdRevenue by day + delivery platform (web/whatsapp/…)</li>
                    <li>Top-ups: POST <code className="rounded bg-slate-50 px-0.5">/api/adverts/wallet/topup</code> or{' '}
                      <code className="rounded bg-slate-50 px-0.5">/api/ads/wallet/topup</code></li>
                  </ul>
                </div>
              </div>
              <div className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                <div>
                  <label className="text-xs font-medium text-slate-500">From</label>
                  <input
                    type="date"
                    value={ledgerFrom}
                    onChange={(e) => setLedgerFrom(e.target.value)}
                    className="ml-2 rounded border border-slate-200 px-2 py-1 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500">To</label>
                  <input
                    type="date"
                    value={ledgerTo}
                    onChange={(e) => setLedgerTo(e.target.value)}
                    className="ml-2 rounded border border-slate-200 px-2 py-1 text-sm"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => loadLedger()}
                  disabled={ledgerLoading}
                  className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {ledgerLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Refresh
                </button>
              </div>
            </div>

            {ledgerLoading && !ledger ? (
              <div className="mt-8 flex justify-center py-12">
                <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
              </div>
            ) : ledger ? (
              <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {[
                  {
                    title: 'Gross advertiser charges',
                    value: `R${Number((ledger.ledgerDebits as { grossAdvertiserCharges?: number })?.grossAdvertiserCharges ?? 0).toFixed(2)}`,
                    sub: `${Number((ledger.ledgerDebits as { rows?: number })?.rows ?? 0)} debit rows`,
                  },
                  {
                    title: 'Attributed platform share',
                    value: `R${Number((ledger.ledgerDebits as { platformAttributed?: number })?.platformAttributed ?? 0).toFixed(2)}`,
                    sub: 'From billed events',
                  },
                  {
                    title: 'Partner / incentive pool',
                    value: `R${Number((ledger.ledgerDebits as { partnerAttributed?: number })?.partnerAttributed ?? 0).toFixed(2)}`,
                    sub: 'Remainder of gross',
                  },
                  {
                    title: 'Wallet top-ups (period)',
                    value: `R${Number((ledger.walletCredits as { volume?: number })?.volume ?? 0).toFixed(2)}`,
                    sub: `${Number((ledger.walletCredits as { topups?: number })?.topups ?? 0)} credits`,
                  },
                ].map((card) => (
                  <div key={card.title} className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{card.title}</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900">{card.value}</p>
                    <p className="mt-1 text-xs text-indigo-700">{card.sub}</p>
                  </div>
                ))}
              </div>
            ) : null}

            {ledger?.config ? (
              <div className="mt-6 rounded-xl border border-amber-100 bg-amber-50/70 px-4 py-3 text-sm text-amber-950">
                Active config: platform share {(ledger.config as { adPlatformSharePct?: number }).adPlatformSharePct ?? '—'}% ·
                max impressions per user per hour{' '}
                {(ledger.config as { impressionMaxPerUserPerHour?: number }).impressionMaxPerUserPerHour ?? '—'} (burst / fraud guard)
              </div>
            ) : null}

            {Array.isArray(ledger?.byPlatform) && (ledger!.byPlatform as unknown[]).length > 0 ? (
              <div className="mt-6 overflow-x-auto">
                <p className="mb-2 text-sm font-semibold text-slate-800">Delivery platform (rolled)</p>
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead className="border-b border-slate-100 bg-slate-50">
                    <tr>
                      <th className="px-3 py-2">Platform</th>
                      <th className="px-3 py-2">Total revenue</th>
                      <th className="px-3 py-2">Platform share</th>
                      <th className="px-3 py-2">Partner share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(ledger!.byPlatform as { platform?: string; totalRevenue?: number; platformShare?: number; partnerShare?: number }[]).map(
                      (row) => (
                        <tr key={row.platform} className="border-b border-slate-50">
                          <td className="px-3 py-2 capitalize">{row.platform ?? '—'}</td>
                          <td className="px-3 py-2">R{Number(row.totalRevenue ?? 0).toFixed(2)}</td>
                          <td className="px-3 py-2">R{Number(row.platformShare ?? 0).toFixed(2)}</td>
                          <td className="px-3 py-2">R{Number(row.partnerShare ?? 0).toFixed(2)}</td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>

          <section className="rounded-2xl border border-white/70 bg-white/85 p-6 shadow-xl shadow-indigo-50 backdrop-blur">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">Advertiser onboarding (web)</h2>
                <p className="mt-1 text-sm text-slate-600">
                  New self-serve sign-ups start as <strong>pending</strong>. Approve here before they can POST{' '}
                  <code className="rounded bg-slate-100 px-1 text-xs">/api/ads/create</code> with{' '}
                  <code className="rounded bg-slate-100 px-1 text-xs">surface: &quot;web&quot;</code>.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {(['', 'pending', 'approved', 'rejected'] as OnboardingFilter[]).map((f) => (
                  <button
                    key={f || 'all'}
                    type="button"
                    onClick={() => setFilter(f)}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                      filter === f ? 'bg-indigo-600 text-white' : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {!f ? 'All' : f === 'pending' ? 'Pending' : f === 'approved' ? 'Approved' : 'Rejected'}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-6 overflow-x-auto rounded-xl border border-slate-100">
              {loading ? (
                <div className="flex justify-center py-16">
                  <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
                </div>
              ) : rows.length === 0 ? (
                <p className="py-12 text-center text-slate-500">No advertisers match this filter.</p>
              ) : (
                <table className="w-full min-w-[800px] text-left text-sm">
                  <thead className="border-b border-slate-100 bg-slate-50/90">
                    <tr>
                      <th className="px-4 py-3 font-semibold text-slate-700">Business</th>
                      <th className="px-4 py-3 font-semibold text-slate-700">Contact</th>
                      <th className="px-4 py-3 font-semibold text-slate-700">Web status</th>
                      <th className="px-4 py-3 font-semibold text-slate-700">Package tier</th>
                      <th className="px-4 py-3 font-semibold text-slate-700">Notes</th>
                      <th className="px-4 py-3 text-right font-semibold text-slate-700">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const st = statusLabel(r.webOnboardingStatus);
                      const StIcon = st.Icon;
                      const isBusy = busyId === r._id;
                      return (
                        <tr key={r._id} className="border-b border-slate-50 hover:bg-slate-50/80">
                          <td className="px-4 py-3">
                            <p className="font-medium text-slate-900">{r.name}</p>
                            <p className="text-xs text-slate-500">
                              Wallet R{Number(r.walletBalance ?? 0).toFixed(2)}
                              {r.active === false ? ' · inactive' : ''}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            <p>{r.contactEmail || '—'}</p>
                            <p className="text-xs text-slate-500">{r.contactPhone || ''}</p>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${st.className}`}
                            >
                              <StIcon className="h-3 w-3" /> {st.text}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="text"
                              value={effectiveTier(r)}
                              onChange={(e) => setPackageDrafts((d) => ({ ...d, [r._id]: e.target.value }))}
                              placeholder="starter · growth · premium · …"
                              className="w-full max-w-[180px] rounded border border-slate-200 px-2 py-1 text-xs outline-none focus:border-indigo-400"
                            />
                            <button
                              type="button"
                              disabled={isBusy}
                              className="mt-1 block text-xs font-semibold text-indigo-600 hover:underline disabled:opacity-50"
                              onClick={() =>
                                updateAdvertiser(r._id, {
                                  webPackageTier: effectiveTier(r).trim() || undefined,
                                })
                              }
                            >
                              Save tier
                            </button>
                          </td>
                          <td className="max-w-[220px] px-4 py-3">
                            <textarea
                              rows={2}
                              defaultValue={r.webOnboardingNotes || ''}
                              id={`notes-${r._id}`}
                              className="w-full rounded border border-slate-200 px-2 py-1 text-xs outline-none focus:border-indigo-400"
                              placeholder="Internal note / rejection reason"
                            />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex flex-col items-end gap-2">
                              <button
                                type="button"
                                disabled={isBusy || r.webOnboardingStatus === 'approved'}
                                onClick={() =>
                                  updateAdvertiser(r._id, {
                                    webOnboardingStatus: 'approved',
                                    webPackageTier: effectiveTier(r).trim() || r.webPackageTier,
                                  })
                                }
                                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
                              >
                                Approve web
                              </button>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => {
                                  const el = document.getElementById(`notes-${r._id}`) as HTMLTextAreaElement | null;
                                  updateAdvertiser(r._id, {
                                    webOnboardingStatus: 'pending',
                                    webOnboardingNotes: el?.value?.trim() || undefined,
                                  });
                                }}
                                className="text-xs font-semibold text-slate-600 hover:text-slate-900"
                              >
                                Mark pending
                              </button>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => {
                                  const el = document.getElementById(`notes-${r._id}`) as HTMLTextAreaElement | null;
                                  updateAdvertiser(r._id, {
                                    webOnboardingStatus: 'rejected',
                                    webOnboardingNotes: el?.value?.trim() || undefined,
                                  });
                                }}
                                className="text-xs font-semibold text-red-600 hover:text-red-800"
                              >
                                Reject
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-5 text-sm text-slate-600">
            <p className="font-semibold text-slate-900">Advertiser API (web)</p>
            <p className="mt-2">
              <code className="rounded bg-slate-100 px-1">POST /api/ads/create</code> — pass{' '}
              <code className="rounded bg-slate-100 px-1">surface: &quot;web&quot;</code> and placements such as{' '}
              <code className="rounded bg-slate-100 px-1">wallet</code>,{' '}
              <code className="rounded bg-slate-100 px-1">marketplace</code>, <code className="rounded bg-slate-100 px-1">wall</code>
              … (resolved to <code className="rounded bg-slate-100 px-1">web_*</code> slots). WhatsApp presets still use{' '}
              <code className="rounded bg-slate-100 px-1">surface: &quot;whatsapp&quot;</code> (default).
            </p>
            <p className="mt-2">
              <code className="rounded bg-slate-100 px-1">GET /api/ads/performance</code> ·{' '}
              <code className="rounded bg-slate-100 px-1">POST /api/ads/payment</code>
            </p>
          </section>
        </main>
      </div>
    </ProtectedRoute>
  );
}
