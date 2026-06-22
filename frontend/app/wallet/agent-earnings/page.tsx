'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Loader2, TrendingUp, ArrowLeft, Mail } from 'lucide-react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import { walletAPI } from '@/lib/api';
import { AppSidebar } from '@/components/AppSidebar';
import { AppShellHeader } from '@/components/AppShellHeader';
import { ProfileHeaderButton } from '@/components/ProfileHeaderButton';
import { SearchButton } from '@/components/SearchButton';
import { useCartAndStores } from '@/lib/useCartAndStores';

export default function AgentEarningsPage() {
  const { user, logout } = useAuth();
  const { cartCount, hasStore } = useCartAndStores(!!user);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reporting, setReporting] = useState(false);
  const [summary, setSummary] = useState<{
    tuckshopsRegistered: number;
    pendingApprovals: number;
    totalCommissionsEarnedZar: number;
  } | null>(null);
  const [registrations, setRegistrations] = useState<any[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await walletAPI.getAgentEarningsSummary();
      setSummary(res.data.summary);
      setRegistrations(Array.isArray(res.data.registrations) ? res.data.registrations : []);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Could not load earnings');
      setSummary(null);
      setRegistrations([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const emailReport = async () => {
    setReporting(true);
    try {
      const res = await walletAPI.emailAgentEarningsReport();
      toast.success(res.data.message || 'Report sent');
    } catch (e: any) {
      toast.error(e?.response?.data?.message || e?.response?.data?.error || 'Could not send report');
    } finally {
      setReporting(false);
    }
  };

  return (
    <ProtectedRoute>
      <div className="flex min-h-[100dvh] flex-col overflow-hidden bg-gradient-to-br from-emerald-50 via-white to-sky-50 text-slate-900">
        <AppShellHeader
          onMenuClick={() => setMenuOpen((v) => !v)}
          center={
            <>
              <TrendingUp className="h-5 w-5 shrink-0 text-emerald-600" />
              <h1 className="min-w-0 truncate text-base font-semibold sm:text-lg">My earnings</h1>
            </>
          }
          actions={
            <>
              <SearchButton />
              <ProfileHeaderButton />
            </>
          }
        />

        <div className="flex min-h-0 min-w-0 flex-1">
          <AppSidebar
            variant="wall"
            userName={user?.name}
            userAvatar={(user as any)?.avatar}
            userId={user?._id || user?.id}
            cartCount={cartCount}
            hasStore={hasStore}
            onLogout={logout}
            menuOpen={menuOpen}
            setMenuOpen={setMenuOpen}
            hideLogo
            belowHeader
          />
          <main className="min-h-0 flex-1 overflow-y-auto px-4 py-4 pb-24 sm:px-6 lg:px-8 lg:pb-8">
            <div className="mx-auto max-w-3xl">
              <Link
                href="/wallet"
                className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-sky-700 hover:underline"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to wallet
              </Link>

              <div className="mb-6 rounded-2xl border border-white/60 bg-white/90 p-5 shadow-lg shadow-emerald-50 backdrop-blur">
                <p className="text-xs uppercase tracking-[0.25em] text-emerald-700">Commission dashboard</p>
                <h2 className="mt-1 text-xl font-semibold text-slate-900">Tuckshop cash-agent earnings</h2>
                <p className="mt-2 text-sm text-slate-600">
                  Figures update when you register tuckshops on WhatsApp (Jobs menu). Approved commissions are entered by
                  admin when they approve your tuckshop.
                </p>
              </div>

              {loading ? (
                <div className="flex justify-center py-16">
                  <Loader2 className="h-10 w-10 animate-spin text-emerald-600" />
                </div>
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border border-emerald-100 bg-white/95 p-4 shadow-sm">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tuckshops registered</p>
                      <p className="mt-2 text-2xl font-bold text-emerald-700">
                        ✅ {summary?.tuckshopsRegistered ?? 0}
                      </p>
                    </div>
                    <div className="rounded-xl border border-amber-100 bg-white/95 p-4 shadow-sm">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pending approvals</p>
                      <p className="mt-2 text-2xl font-bold text-amber-700">
                        ⏳ {summary?.pendingApprovals ?? 0}
                      </p>
                    </div>
                    <div className="rounded-xl border border-sky-100 bg-white/95 p-4 shadow-sm">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Total commissions earned
                      </p>
                      <p className="mt-2 text-2xl font-bold text-sky-800">
                        💰 R {(summary?.totalCommissionsEarnedZar ?? 0).toFixed(2)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 rounded-2xl border border-white/60 bg-white/90 p-5 shadow-md backdrop-blur">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">Payment &amp; reporting</p>
                        <p className="text-xs text-slate-600">
                          Download a CSV + PDF summary by email (same as WhatsApp &quot;DOWNLOAD REPORT&quot;). Max once per
                          hour.
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={reporting}
                        onClick={() => void emailReport()}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {reporting ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Mail className="h-4 w-4" />
                        )}
                        Download report (email)
                      </button>
                    </div>
                  </div>

                  {registrations.length > 0 && (
                    <div className="mt-6 rounded-2xl border border-slate-100 bg-white/95 p-5 shadow-sm">
                      <p className="text-sm font-semibold text-slate-900">Your registrations</p>
                      <ul className="mt-3 divide-y divide-slate-100">
                        {registrations.map((r) => (
                          <li key={r._id} className="py-3 text-sm">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-medium text-slate-900">{r.tuckshopName || '—'}</span>
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold uppercase text-slate-600">
                                {r.status}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-slate-500">
                              Commission (ZAR): R {Number(r.commissionAmountZar || 0).toFixed(2)}
                            </p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </div>
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
