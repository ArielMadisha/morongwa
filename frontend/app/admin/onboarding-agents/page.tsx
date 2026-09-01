'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { adminAPI } from '@/lib/api';
import toast from 'react-hot-toast';
import { ArrowLeft, Loader2, UserPlus, RefreshCw, AlertTriangle } from 'lucide-react';

type OnboardingRow = {
  _id: string;
  createdAt?: string;
  meta?: {
    agentFullName?: string;
    agentIdPassport?: string;
    bankAccount?: string;
    phone?: string;
    fraudFlags?: string[];
    fraudRiskScore?: number;
    suggestedRegistrationPayout?: string;
  };
  user?: { name?: string; username?: string; phone?: string; email?: string };
};

export default function AdminOnboardingAgentsPage() {
  const [rows, setRows] = useState<OnboardingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchRows = async () => {
    try {
      const res = await adminAPI.getOnboardingAgentApplications({ limit: 300 });
      const list = res.data?.data ?? [];
      setRows(Array.isArray(list) ? list : []);
    } catch {
      toast.error('Failed to load onboarding applications');
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    void fetchRows();
  }, []);

  const rescan = async (id: string) => {
    setBusyId(id);
    try {
      await adminAPI.rescanOnboardingAgentFraud(id);
      toast.success('Fraud signals refreshed');
      await fetchRows();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || e?.response?.data?.error || 'Rescan failed');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-slate-50">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-4">
            <Link href="/admin" className="inline-flex items-center gap-1 text-sm font-medium text-sky-700 hover:underline">
              <ArrowLeft className="h-4 w-4" /> Admin
            </Link>
            <div className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-sky-600" />
              <h1 className="text-lg font-semibold text-slate-900">Onboarding agents</h1>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-5xl space-y-4 px-4 py-6">
          <p className="text-sm text-slate-600">
            Applications from WhatsApp <strong>Jobs (6)</strong> → <strong>Register as Onboarding Agent</strong>. Each
            row stores name, ID/passport, and bank note. Fraud-flagged rows also appear under{' '}
            <Link href="/admin/fraud-registration-exceptions" className="font-medium text-sky-700 hover:underline">
              Registration fraud signals
            </Link>
            .
          </p>

          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-2xl border border-slate-100 bg-white p-10 text-center text-slate-500">
              No onboarding agent applications yet.
            </div>
          ) : (
            <ul className="space-y-3">
              {rows.map((row) => {
                const meta = row.meta || {};
                const flags = Array.isArray(meta.fraudFlags) ? meta.fraudFlags : [];
                const score = typeof meta.fraudRiskScore === 'number' ? meta.fraudRiskScore : 0;
                const busy = busyId === String(row._id);
                const u = row.user;
                return (
                  <li
                    key={String(row._id)}
                    className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1.5">
                        <p className="text-base font-semibold text-slate-900">{meta.agentFullName || '—'}</p>
                        <p className="text-xs text-slate-500">
                          {row.createdAt ? new Date(row.createdAt).toLocaleString() : '—'}
                          {meta.phone ? ` · WA +${meta.phone}` : ''}
                          {u?.username ? ` · @${u.username}` : ''}
                        </p>
                        <p className="text-sm text-slate-800">
                          <span className="font-semibold">ID / Passport:</span>{' '}
                          <span className="font-mono">{meta.agentIdPassport || '—'}</span>
                        </p>
                        <p className="text-sm text-slate-800">
                          <span className="font-semibold">Bank:</span> {meta.bankAccount || '(not provided)'}
                        </p>
                        {(score > 0 || flags.length > 0) && (
                          <p className="inline-flex items-center gap-1.5 text-sm text-amber-900">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            Risk {score}
                            {flags.length ? `: ${flags.join(', ')}` : ''}
                          </p>
                        )}
                        {meta.suggestedRegistrationPayout ? (
                          <p className="text-xs text-slate-600">
                            Payout reference: {meta.suggestedRegistrationPayout}
                          </p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void rescan(String(row._id))}
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />
                        Rescan fraud
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </main>
      </div>
    </ProtectedRoute>
  );
}
