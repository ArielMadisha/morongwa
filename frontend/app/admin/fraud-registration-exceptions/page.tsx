'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { adminAPI } from '@/lib/api';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  ArrowLeft,
  Loader2,
  RefreshCw,
  Store,
  UserCircle,
} from 'lucide-react';

type IncentiveRow = {
  iso: string;
  currencyCode: string;
  amount: number;
  symbol: string;
  display: string;
};

export default function FraudRegistrationExceptionsPage() {
  const [loading, setLoading] = useState(true);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [incentives, setIncentives] = useState<IncentiveRow[]>([]);
  const [tuckshops, setTuckshops] = useState<any[]>([]);
  const [onboarding, setOnboarding] = useState<any[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminAPI.getFraudRegistrationExceptions({ limit: 200 });
      const body = res.data as any;
      setIncentives(Array.isArray(body?.incentiveReference) ? body.incentiveReference : []);
      setTuckshops(Array.isArray(body?.tuckshopFlags) ? body.tuckshopFlags : []);
      setOnboarding(Array.isArray(body?.onboardingFlags) ? body.onboardingFlags : []);
      setGeneratedAt(typeof body?.generatedAt === 'string' ? body.generatedAt : null);
    } catch {
      toast.error('Failed to load fraud exception report');
      setIncentives([]);
      setTuckshops([]);
      setOnboarding([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rescanTuck = async (id: string) => {
    setBusyId(`t:${id}`);
    try {
      await adminAPI.rescanTuckshopRegistrationFraud(id);
      toast.success('Tuckshop fraud signals refreshed');
      await load();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || e?.response?.data?.error || 'Rescan failed');
    } finally {
      setBusyId(null);
    }
  };

  const rescanOnboard = async (id: string) => {
    setBusyId(`o:${id}`);
    try {
      await adminAPI.rescanOnboardingAgentFraud(id);
      toast.success('Onboarding fraud signals refreshed');
      await load();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || e?.response?.data?.error || 'Rescan failed');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <ProtectedRoute allowedRoles={['admin', 'superadmin']}>
      <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-sky-50 text-slate-800">
        <header className="border-b border-white/60 bg-white/70 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-wrap items-start justify-between gap-4 px-6 py-6">
            <div>
              <p className="text-xs uppercase tracking-widest text-amber-800">Qwertymates</p>
              <h1 className="mt-1 flex flex-wrap items-center gap-2 text-3xl font-semibold text-slate-900">
                <AlertTriangle className="h-8 w-8 text-amber-600" />
                Registration fraud signals
              </h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-600">
                Automatic checks after WhatsApp submissions: reused ID numbers across onboarding + tuckshop flows, duplicate
                company certificates / proof uploads, identical shop photo files, perceptually similar shop photos, and GPS pins
                within about 100 metres across different accounts. Reference payouts by country are informational for reviewers.
              </p>
              {generatedAt && (
                <p className="mt-2 text-xs text-slate-500">Report generated: {new Date(generatedAt).toLocaleString()}</p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void load()}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <Link
                href="/admin/tuckshop-cash-agents"
                className="inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-white/90 px-4 py-2 text-sm font-semibold text-emerald-900 shadow-sm hover:bg-emerald-50"
              >
                <Store className="h-4 w-4" /> Tuckshop queue
              </Link>
              <Link
                href="/admin"
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm"
              >
                <ArrowLeft className="h-4 w-4" /> Admin home
              </Link>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-6xl space-y-10 px-6 py-8">
          <section className="rounded-2xl border border-amber-100 bg-white/90 p-6 shadow-lg shadow-amber-50">
            <h2 className="text-lg font-semibold text-slate-900">Country payout reference (successful registration bonus)</h2>
            <p className="mt-1 text-xs text-slate-600">
              Shown to reviewers only; actual settlement depends on your payout rails and policy.
            </p>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {incentives.map((r) => (
                <li key={r.iso} className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2 text-sm">
                  <span className="font-semibold text-slate-900">{r.iso}</span>{' '}
                  <span className="text-slate-700">{r.display}</span>{' '}
                  <span className="text-xs text-slate-500">({r.currencyCode})</span>
                </li>
              ))}
            </ul>
          </section>

          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="h-12 w-12 animate-spin text-amber-600" />
            </div>
          ) : (
            <>
              <section>
                <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-slate-900">
                  <Store className="h-5 w-5 text-emerald-600" /> Tuckshop cash-agent registrations with signals
                </h2>
                {tuckshops.length === 0 ? (
                  <p className="rounded-xl border border-slate-100 bg-white/80 p-6 text-sm text-slate-600">
                    No tuckshop rows with fraud flags or elevated risk yet. New submissions are scanned automatically within
                    seconds.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {tuckshops.map((r: any) => {
                      const flags: string[] = Array.isArray(r.fraudFlags) ? r.fraudFlags : [];
                      const score = typeof r.fraudRiskScore === 'number' ? r.fraudRiskScore : 0;
                      const busy = busyId === `t:${String(r._id)}`;
                      return (
                        <li
                          key={String(r._id)}
                          className="rounded-2xl border border-slate-100 bg-white/95 p-4 shadow-sm"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 space-y-1">
                              <p className="font-semibold text-slate-900">{r.tuckshopName || '—'}</p>
                              <p className="text-xs text-slate-500">
                                {r.createdAt ? new Date(r.createdAt).toLocaleString() : ''} ·{' '}
                                <span className="uppercase">{r.status || '—'}</span> · WA +{r.waPhoneDigits || '—'}
                              </p>
                              {r.registrationIncentiveDisplay && (
                                <p className="text-xs text-slate-700">
                                  <span className="font-semibold">Payout reference:</span> {r.registrationIncentiveDisplay}
                                </p>
                              )}
                              <p className="text-sm text-amber-950">
                                <span className="font-semibold">Risk {score}:</span> {flags.length ? flags.join(', ') : '—'}
                              </p>
                              {r.applicantIdPassport && (
                                <p className="text-xs text-slate-600">
                                  ID / passport (as entered): {r.applicantIdPassport}
                                </p>
                              )}
                            </div>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => rescanTuck(String(r._id))}
                              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                            >
                              <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />
                              Rescan
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              <section>
                <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-slate-900">
                  <UserCircle className="h-5 w-5 text-sky-600" /> Onboarding agent applications (WhatsApp Jobs flow)
                </h2>
                {onboarding.length === 0 ? (
                  <p className="rounded-xl border border-slate-100 bg-white/80 p-6 text-sm text-slate-600">
                    No onboarding applications with fraud flags or elevated risk yet.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {onboarding.map((row: any) => {
                      const meta = row.meta || {};
                      const flags: string[] = Array.isArray(meta.fraudFlags) ? meta.fraudFlags : [];
                      const score = typeof meta.fraudRiskScore === 'number' ? meta.fraudRiskScore : 0;
                      const busy = busyId === `o:${String(row._id)}`;
                      return (
                        <li
                          key={String(row._id)}
                          className="rounded-2xl border border-slate-100 bg-white/95 p-4 shadow-sm"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 space-y-1">
                              <p className="font-semibold text-slate-900">{meta.agentFullName || '—'}</p>
                              <p className="text-xs text-slate-500">
                                {row.createdAt ? new Date(row.createdAt).toLocaleString() : ''} · WA +{meta.phone || '—'}
                              </p>
                              {meta.suggestedRegistrationPayout && (
                                <p className="text-xs text-slate-700">
                                  <span className="font-semibold">Payout reference:</span> {meta.suggestedRegistrationPayout}
                                </p>
                              )}
                              <p className="text-sm text-amber-950">
                                <span className="font-semibold">Risk {score}:</span> {flags.length ? flags.join(', ') : '—'}
                              </p>
                              {meta.agentIdPassport && (
                                <p className="text-xs text-slate-600">ID / passport (as entered): {meta.agentIdPassport}</p>
                              )}
                              {meta.bankAccount && (
                                <p className="text-xs text-slate-600">
                                  Bank note:{' '}
                                  {String(meta.bankAccount).length > 160
                                    ? `${String(meta.bankAccount).slice(0, 160)}…`
                                    : meta.bankAccount}
                                </p>
                              )}
                            </div>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => rescanOnboard(String(row._id))}
                              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                            >
                              <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />
                              Rescan
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </>
          )}
        </main>
      </div>
    </ProtectedRoute>
  );
}
