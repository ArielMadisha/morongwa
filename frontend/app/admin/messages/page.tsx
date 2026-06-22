'use client';

import { useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { adminAPI } from '@/lib/api';
import Link from 'next/link';
import { ArrowLeft, Loader2, MessageSquare, Search } from 'lucide-react';
import toast from 'react-hot-toast';

type PopulatedUser = { _id?: string; name?: string; email?: string; username?: string };

type DirectRow = {
  _id: string;
  content: string;
  createdAt: string;
  read?: boolean;
  sender?: PopulatedUser | string;
  receiver?: PopulatedUser | string;
};

function pickUser(u: DirectRow['sender']): PopulatedUser | null {
  if (u && typeof u === 'object') return u as PopulatedUser;
  return null;
}

function userLabel(u: PopulatedUser | null): string {
  if (!u) return '—';
  const bits = [u.name, u.username ? `@${u.username}` : null, u.email].filter(Boolean);
  return bits.length ? bits.join(' · ') : String(u._id || '');
}

export default function AdminDirectMessagesPage() {
  const [rows, setRows] = useState<DirectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [qInput, setQInput] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 20, pages: 1 });

  useEffect(() => {
    void load();
  }, [page, q]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await adminAPI.getRecentDirectMessages({
        page,
        limit: 20,
        q: q.trim() || undefined,
      });
      const data = res.data;
      setRows(Array.isArray(data?.data) ? (data.data as DirectRow[]) : []);
      setPagination(data.pagination ?? { total: 0, page, limit: 20, pages: 1 });
    } catch {
      toast.error('Failed to load direct messages');
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setQ(qInput.trim());
  };

  return (
    <ProtectedRoute allowedRoles={['admin', 'superadmin']}>
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-sky-100 text-slate-800">
        <header className="border-b border-white/60 bg-white/70 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-6 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-widest text-sky-600">Qwertymates</p>
              <h1 className="mt-1 flex items-center gap-2 text-3xl font-semibold text-slate-900">
                <MessageSquare className="h-8 w-8 text-sky-600" aria-hidden />
                Direct messages
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                Recent user-to-user DMs (oversight). Task chat lives under messenger; this is the direct inbox only.
              </p>
            </div>
            <Link
              href="/admin"
              className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:shadow-md"
            >
              <ArrowLeft className="h-4 w-4" /> Back to admin
            </Link>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-6 py-8">
          <form onSubmit={onSearch} className="mb-6 flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px]">
              <label htmlFor="dm-q" className="block text-xs font-medium text-slate-600">
                Search message text
              </label>
              <div className="relative mt-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="dm-q"
                  value={qInput}
                  onChange={(e) => setQInput(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-10 pr-3 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
                  placeholder="Keyword in message body…"
                  maxLength={128}
                />
              </div>
            </div>
            <button
              type="submit"
              className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-sky-700"
            >
              Apply
            </button>
          </form>

          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-10 w-10 animate-spin text-sky-600" />
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white/80 p-12 text-center text-slate-600">
              No direct messages match this filter.
            </div>
          ) : (
            <div className="space-y-3">
              {rows.map((row) => {
                const from = pickUser(row.sender);
                const to = pickUser(row.receiver);
                return (
                  <article
                    key={row._id}
                    className="rounded-xl border border-slate-100 bg-white/90 p-4 shadow-sm"
                  >
                    <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-500">
                      <span>{new Date(row.createdAt).toLocaleString()}</span>
                      <span className={row.read ? 'text-emerald-600' : 'text-amber-600'}>
                        {row.read ? 'Read' : 'Unread'}
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-medium text-slate-900 whitespace-pre-wrap break-words">
                      {row.content}
                    </p>
                    <p className="mt-3 text-xs text-slate-600">
                      <span className="font-semibold text-slate-700">From:</span> {userLabel(from)}
                    </p>
                    <p className="mt-1 text-xs text-slate-600">
                      <span className="font-semibold text-slate-700">To:</span> {userLabel(to)}
                    </p>
                  </article>
                );
              })}
            </div>
          )}

          {!loading && pagination.pages > 1 && (
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-sm text-slate-600">
                Page {pagination.page} of {pagination.pages} ({pagination.total} total)
              </span>
              <button
                type="button"
                disabled={page >= pagination.pages}
                onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </main>
      </div>
    </ProtectedRoute>
  );
}
