'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { adminAPI } from '@/lib/api';
import { ArrowLeft, Loader2, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

type StorePop = {
  _id?: string;
  name?: string;
  slug?: string;
  type?: string;
  userId?: { name?: string; email?: string };
} | null;

type Row = {
  _id: string;
  status: string;
  storeId?: StorePop;
  requestedBy?: { name?: string; email?: string };
  createdAt?: string;
};

export default function StoreDeletionRequestsPage() {
  const [tab, setTab] = useState<'pending' | 'all'>('pending');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await adminAPI.getStoreDeletionRequests(tab === 'pending' ? { status: 'pending' } : { status: 'all' });
      const list = (r.data?.data ?? r.data ?? []) as Row[];
      setRows(Array.isArray(list) ? list : []);
    } catch {
      toast.error('Failed to load requests');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    void load();
  }, [load]);

  const approve = async (id: string) => {
    if (
      !confirm(
        'Permanently delete this store and cascade-remove supplier products / reseller MyStore listings? This cannot be undone.'
      )
    ) {
      return;
    }
    try {
      const res = await adminAPI.approveStoreDeletionRequest(id);
      const n = res.data?.productsDeleted as number | undefined;
      toast.success(n && n > 0 ? `Store removed (${n} product(s) deleted)` : 'Store removed');
      void load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || 'Failed');
    }
  };

  const reject = async (id: string) => {
    const reason = window.prompt('Rejection reason (optional):') ?? '';
    try {
      await adminAPI.rejectStoreDeletionRequest(id, reason.trim() || undefined);
      toast.success('Request rejected');
      void load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || 'Failed');
    }
  };

  return (
    <ProtectedRoute allowedRoles={['superadmin']}>
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-sky-100 text-slate-800">
        <header className="border-b border-white/60 bg-white/70 backdrop-blur">
          <div className="mx-auto max-w-4xl px-6 py-6">
            <Link href="/admin" className="inline-flex items-center gap-2 text-sky-600 hover:text-sky-700 text-sm font-medium mb-4">
              <ArrowLeft className="h-4 w-4" /> Admin
            </Link>
            <div className="flex items-center gap-3">
              <Trash2 className="h-9 w-9 text-orange-600" />
              <div>
                <h1 className="text-2xl font-semibold text-slate-900">Store removal queue</h1>
                <p className="text-sm text-slate-600">
                  Delegated admins submit store removals here; super-admin confirms permanent deletion.
                </p>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setTab('pending')}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                  tab === 'pending' ? 'bg-sky-600 text-white' : 'bg-white border border-slate-200 text-slate-700'
                }`}
              >
                Pending
              </button>
              <button
                type="button"
                onClick={() => setTab('all')}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                  tab === 'all' ? 'bg-sky-600 text-white' : 'bg-white border border-slate-200 text-slate-700'
                }`}
              >
                Recent (all statuses)
              </button>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-4xl px-6 py-8">
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-10 w-10 animate-spin text-sky-600" />
            </div>
          ) : rows.length === 0 ? (
            <p className="text-slate-600">No requests{tab === 'pending' ? ' pending' : ''}.</p>
          ) : (
            <ul className="space-y-4">
              {rows.map((r) => {
                const store = r.storeId && typeof r.storeId === 'object' ? r.storeId : null;
                const sid = store?._id ? String(store._id) : '';
                return (
                  <li key={r._id} className="rounded-xl border border-slate-200 bg-white/90 p-4 shadow-sm">
                    <div className="flex flex-wrap justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-900">
                          {store?.name || (sid ? 'Store' : 'Store (already removed)')}
                        </p>
                        <p className="text-sm text-slate-600 capitalize">
                          Type: {store?.type || '—'}
                          {store?.slug ? ` · /store/${store.slug}` : ''}
                        </p>
                        <p className="text-sm text-slate-600">
                          Owner: {store?.userId?.name || '—'} ({store?.userId?.email || '—'})
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                          Requested by {r.requestedBy?.name || '—'}
                          {r.createdAt ? ` · ${new Date(r.createdAt).toLocaleString()}` : ''}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">Status: {r.status}</p>
                      </div>
                      {r.status === 'pending' && sid ? (
                        <div className="flex flex-wrap gap-2 items-center">
                          <button
                            type="button"
                            onClick={() => approve(r._id)}
                            className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
                          >
                            Approve removal
                          </button>
                          <button
                            type="button"
                            onClick={() => reject(r._id)}
                            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                          >
                            Reject
                          </button>
                        </div>
                      ) : null}
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
