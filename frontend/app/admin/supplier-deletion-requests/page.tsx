'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { adminAPI } from '@/lib/api';
import { ArrowLeft, Loader2, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

type SupplierPop = {
  _id?: string;
  storeName?: string;
  userId?: { name?: string; email?: string };
} | null;

type Row = {
  _id: string;
  status: string;
  supplierId?: SupplierPop;
  requestedBy?: { name?: string; email?: string };
  createdAt?: string;
};

export default function SupplierDeletionRequestsPage() {
  const [tab, setTab] = useState<'pending' | 'all'>('pending');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await adminAPI.getSupplierDeletionRequests(tab === 'pending' ? { status: 'pending' } : { status: 'all' });
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
        'Permanently delete this supplier, their supplier store, and all internal marketplace products linked to them? This cannot be undone.'
      )
    )
      return;
    try {
      await adminAPI.approveSupplierDeletionRequest(id);
      toast.success('Supplier removed');
      void load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || 'Failed');
    }
  };

  const reject = async (id: string) => {
    const reason = window.prompt('Rejection reason (optional):') ?? '';
    try {
      await adminAPI.rejectSupplierDeletionRequest(id, reason.trim() || undefined);
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
                <h1 className="text-2xl font-semibold text-slate-900">Supplier removal queue</h1>
                <p className="text-sm text-slate-600">
                  Sub-admins can only request removal for suppliers they captured; you confirm permanent deletion here.
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
                const sup = r.supplierId && typeof r.supplierId === 'object' ? r.supplierId : null;
                const sid = sup?._id ? String(sup._id) : '';
                return (
                  <li key={r._id} className="rounded-xl border border-slate-200 bg-white/90 p-4 shadow-sm">
                    <div className="flex flex-wrap justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-900">{sup?.storeName || (sid ? 'Supplier' : 'Supplier (record already removed)')}</p>
                        <p className="text-sm text-slate-600">
                          Seller: {sup?.userId?.name || '—'} ({sup?.userId?.email || '—'})
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                          Requested by {r.requestedBy?.name || '—'}
                          {r.createdAt ? ` · ${new Date(r.createdAt).toLocaleString()}` : ''}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">Request status: {r.status}</p>
                      </div>
                      {r.status === 'pending' && sid ? (
                        <div className="flex flex-wrap gap-2 items-center">
                          <Link href={`/admin/suppliers/${sid}`} className="text-sm text-sky-600 hover:underline">
                            View supplier
                          </Link>
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
