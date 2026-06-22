'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { adminAPI } from '@/lib/api';
import { userAtUsername } from '@/lib/userDisplayLabel';
import { ArrowLeft, KeyRound, Loader2, RefreshCw, School, Trash2, Users } from 'lucide-react';
import toast from 'react-hot-toast';

type LegacyRow = {
  _id: string;
  name?: string;
  username?: string;
  email?: string;
  displayLabel?: string;
  role?: string[];
  active?: boolean;
  suspended?: boolean;
};

function LegacyAccountsPage() {
  const [rows, setRows] = useState<LegacyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [normalizing, setNormalizing] = useState(false);
  const [numericSchools, setNumericSchools] = useState<
    Array<{ _id: string; name?: string; username?: string; email?: string }>
  >([]);
  const [numericSchoolsLoading, setNumericSchoolsLoading] = useState(true);
  const [purgingNumericSchools, setPurgingNumericSchools] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminAPI.getLegacyAccounts();
      const data = res.data?.data ?? res.data ?? [];
      setRows(Array.isArray(data) ? data : []);
    } catch (e: unknown) {
      const msg =
        typeof e === 'object' && e !== null && 'response' in e
          ? (e as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast.error(msg || 'Failed to load legacy accounts');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadNumericSchools = useCallback(async () => {
    setNumericSchoolsLoading(true);
    try {
      const res = await adminAPI.getInvalidNumericSchools();
      const data = res.data?.data ?? res.data ?? [];
      setNumericSchools(Array.isArray(data) ? data : []);
    } catch {
      setNumericSchools([]);
    } finally {
      setNumericSchoolsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    void loadNumericSchools();
  }, [load, loadNumericSchools]);

  const handlePurgeNumericSchools = async () => {
    if (numericSchools.length === 0) return;
    if (
      !confirm(
        `Remove ${numericSchools.length} school account(s) whose name is only digits? Empty accounts are deleted; others are deactivated and unmarked as schools.`
      )
    ) {
      return;
    }
    setPurgingNumericSchools(true);
    try {
      const res = await adminAPI.purgeInvalidNumericSchools(false);
      const deleted = res.data?.deleted ?? 0;
      const deactivated = res.data?.deactivated ?? 0;
      toast.success(`Done: ${deleted} deleted, ${deactivated} deactivated`);
      await loadNumericSchools();
    } catch (e: unknown) {
      const msg =
        typeof e === 'object' && e !== null && 'response' in e
          ? (e as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast.error(msg || 'Purge failed');
    } finally {
      setPurgingNumericSchools(false);
    }
  };

  const handleReset = async (row: LegacyRow) => {
    const label = userAtUsername(row) || row.displayLabel || row.email || 'this account';
    if (!confirm(`Reset password for ${label}? A new temporary password will be shown once.`)) return;
    setResettingId(row._id);
    try {
      const res = await adminAPI.resetLegacyAccountPassword(row._id);
      const temp = res.data?.data?.tempPassword;
      const uname = res.data?.data?.username || row.username;
      toast.success(temp ? `Password reset for @${uname}` : 'Password reset');
      if (temp) {
        window.prompt(`Temporary password for @${uname} (copy now):`, temp);
      }
      await load();
    } catch (e: unknown) {
      const msg =
        typeof e === 'object' && e !== null && 'response' in e
          ? (e as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast.error(msg || 'Reset failed');
    } finally {
      setResettingId(null);
    }
  };

  const handleNormalize = async () => {
    setNormalizing(true);
    try {
      const res = await adminAPI.normalizeLegacyAccountDisplayNames();
      const n = res.data?.updated ?? 0;
      toast.success(n ? `Updated ${n} display name(s) to username` : 'No generic names to fix');
      await load();
    } catch (e: unknown) {
      const msg =
        typeof e === 'object' && e !== null && 'response' in e
          ? (e as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast.error(msg || 'Normalize failed');
    } finally {
      setNormalizing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-sky-100 text-slate-800">
      <header className="border-b border-white/60 bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-4xl flex-col gap-4 px-6 py-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/admin"
              className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="flex items-center gap-3">
              <Users className="h-8 w-8 text-sky-600" />
              <div>
                <h1 className="text-xl font-semibold text-slate-900">Legacy publisher accounts</h1>
                <p className="text-sm text-slate-500">
                  Usernames only — never &quot;Administrator&quot;. Fix generic names updates the database for all affected accounts.
                </p>
              </div>
            </div>
          </div>
          <button
            type="button"
            disabled={normalizing || loading}
            onClick={() => void handleNormalize()}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {normalizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Fix generic names
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8 space-y-8">
        <section className="rounded-2xl border border-amber-200 bg-amber-50/80 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <School className="h-6 w-6 text-amber-800 shrink-0 mt-0.5" />
              <div>
                <h2 className="font-semibold text-slate-900">Schools with numeric-only names</h2>
                <p className="text-sm text-slate-600 mt-1">
                  Legacy or flagged schools whose <strong>name</strong> is only digits (not phone usernames). Deleted when empty; otherwise deactivated.
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled={purgingNumericSchools || numericSchoolsLoading || numericSchools.length === 0}
              onClick={() => void handlePurgeNumericSchools()}
              className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-800 hover:bg-red-50 disabled:opacity-50"
            >
              {purgingNumericSchools ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Remove all ({numericSchools.length})
            </button>
          </div>
          {numericSchoolsLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-6 w-6 animate-spin text-amber-700" />
            </div>
          ) : numericSchools.length === 0 ? (
            <p className="text-sm text-slate-600 mt-4">None found.</p>
          ) : (
            <ul className="mt-4 max-h-48 overflow-y-auto rounded-xl border border-amber-100 bg-white divide-y divide-slate-100 text-sm">
              {numericSchools.map((s) => (
                <li key={s._id} className="px-4 py-2 flex justify-between gap-2">
                  <span className="font-mono text-slate-800">{s.name}</span>
                  <span className="text-slate-500 truncate">
                    @{s.username || '—'}{' '}
                    <a
                      href={`/user/${s._id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sky-700 hover:underline"
                    >
                      profile
                    </a>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-10 w-10 animate-spin text-sky-600" />
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden divide-y divide-slate-100">
            {rows.length === 0 ? (
              <p className="p-10 text-center text-slate-500">No legacy accounts found</p>
            ) : (
              rows.map((row) => {
                const handle = userAtUsername(row);
                const primary = handle || (row.displayLabel ? `@${row.displayLabel}` : '—');
                return (
                  <div
                    key={row._id}
                    className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 hover:bg-slate-50/80"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">{primary}</p>
                      {row.username ? (
                        <p className="text-sm text-slate-600 font-mono">{row.username}</p>
                      ) : (
                        <p className="text-sm text-amber-700">No username set</p>
                      )}
                      <p className="text-sm text-slate-500 truncate">{row.email || '—'}</p>
                    </div>
                    <button
                      type="button"
                      disabled={resettingId !== null}
                      onClick={() => void handleReset(row)}
                      className="inline-flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-medium text-sky-800 hover:bg-sky-100 disabled:opacity-50"
                    >
                      {resettingId === row._id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <KeyRound className="h-4 w-4" />
                      )}
                      Reset
                    </button>
                  </div>
                );
              })
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default function ProtectedLegacyAccountsPage() {
  return (
    <ProtectedRoute allowedRoles={['superadmin']}>
      <LegacyAccountsPage />
    </ProtectedRoute>
  );
}
