'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { adminAPI } from '@/lib/api';
import { ArrowLeft, Loader2, MapPinned, Search, ShieldCheck, ShieldAlert } from 'lucide-react';
import toast from 'react-hot-toast';

type IntelUser = {
  _id: string;
  name?: string;
  username?: string;
  email?: string;
  phone?: string;
  countryCode?: string;
  emailVerified?: boolean;
  emailVerifiedAt?: string;
  registrationIp?: string;
  registrationGeo?: {
    country?: string;
    countryCode?: string;
    region?: string;
    city?: string;
    isp?: string;
    org?: string;
  };
  createdAt?: string;
  role?: string[] | string;
  active?: boolean;
  suspended?: boolean;
};

function formatGeo(u: IntelUser): string {
  const g = u.registrationGeo;
  if (!g) return '—';
  const parts = [g.city, g.region, g.country || g.countryCode].filter(Boolean);
  return parts.length ? parts.join(', ') : '—';
}

export default function RegistrationIntelPage() {
  const PAGE_SIZE = 50;
  const [users, setUsers] = useState<IntelUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');

  const fetchRows = async (targetPage = 1, search = q) => {
    setLoading(true);
    try {
      const res = await adminAPI.getRegistrationIntel({
        page: targetPage,
        limit: PAGE_SIZE,
        q: search.trim() || undefined,
      });
      const list = res.data?.users ?? [];
      setUsers(Array.isArray(list) ? list : []);
      const pagination = res.data?.pagination;
      setPage(Number(pagination?.page || targetPage));
      setTotalPages(Number(pagination?.pages || 1));
      setTotal(Number(pagination?.total || 0));
    } catch {
      toast.error('Failed to load registration intel');
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRows(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ProtectedRoute allowedRoles={['admin', 'superadmin']}>
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-cyan-50 text-slate-800">
        <header className="border-b border-white/60 bg-white/70 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-6">
            <div>
              <p className="text-xs uppercase tracking-widest text-sky-600">Morongwa</p>
              <h1 className="mt-1 flex items-center gap-2 text-3xl font-semibold text-slate-900">
                <MapPinned className="h-7 w-7 text-sky-600" />
                Registration IP &amp; location
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                Where accounts registered from (IP + approximate geo). Captured on new sign-ups after this feature shipped.
              </p>
              <p className="mt-2 text-xs text-slate-500">
                Showing {users.length} of {total} (page {page} of {totalPages})
              </p>
            </div>
            <Link
              href="/admin/users"
              className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:shadow-md"
            >
              <ArrowLeft className="h-4 w-4" /> Back to users
            </Link>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-6 py-8">
          <form
            className="mb-6 flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              fetchRows(1, q);
            }}
          >
            <div className="relative min-w-[240px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search name, email, IP, city, ISP…"
                className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm"
              />
            </div>
            <button
              type="submit"
              className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
            >
              Search
            </button>
          </form>

          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-100 bg-white/90">
              <div className="overflow-x-auto">
                <table className="w-full divide-y divide-slate-100 text-sm">
                  <thead className="bg-slate-50/80">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">User</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Email verified</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">IP</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Location</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">ISP</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Joined</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {users.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                          No rows found
                        </td>
                      </tr>
                    ) : (
                      users.map((u) => (
                        <tr key={u._id} className="hover:bg-slate-50/60">
                          <td className="px-4 py-3">
                            <p className="font-medium text-slate-900">{u.name || '—'}</p>
                            <p className="font-mono text-xs text-slate-500">@{u.username || '—'}</p>
                            <p className="text-xs text-slate-500">{u.email}</p>
                          </td>
                          <td className="px-4 py-3">
                            {u.emailVerified ? (
                              <span className="inline-flex items-center gap-1 text-emerald-700">
                                <ShieldCheck className="h-4 w-4" /> Yes
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-amber-700">
                                <ShieldAlert className="h-4 w-4" /> No / legacy
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-800">{u.registrationIp || '—'}</td>
                          <td className="px-4 py-3 text-slate-700">{formatGeo(u)}</td>
                          <td className="px-4 py-3 text-xs text-slate-600">{u.registrationGeo?.isp || u.registrationGeo?.org || '—'}</td>
                          <td className="px-4 py-3 text-xs text-slate-600">
                            {u.createdAt ? new Date(u.createdAt).toLocaleString() : '—'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-4 py-3">
                <button
                  type="button"
                  disabled={page <= 1 || loading}
                  onClick={() => fetchRows(page - 1)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages || loading}
                  onClick={() => fetchRows(page + 1)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </ProtectedRoute>
  );
}
