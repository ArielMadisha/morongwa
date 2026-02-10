'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import { adminAPI } from '@/lib/api';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Shield,
  LogOut,
  Loader2,
  ArrowRight,
  Lock,
  Wallet,
  RefreshCw,
  Filter,
} from 'lucide-react';
import toast from 'react-hot-toast';

const STATUS_OPTIONS = ['', 'pending', 'held', 'released', 'refunded', 'disputed'];

function AdminEscrowsPage() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [escrows, setEscrows] = useState<any[]>([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 20, pages: 0 });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');

  const fetchEscrows = async (page = 1) => {
    setLoading(true);
    try {
      const params: any = { page, limit: 20 };
      if (statusFilter) params.status = statusFilter;
      const res = await adminAPI.getEscrows(params);
      setEscrows(res.data.escrows || []);
      setPagination(res.data.pagination || { total: 0, page: 1, limit: 20, pages: 0 });
    } catch {
      toast.error('Failed to load escrows');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEscrows(pagination.page);
  }, [statusFilter, pagination.page]);

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  const statusColor: Record<string, string> = {
    pending: 'bg-slate-100 text-slate-700',
    held: 'bg-amber-100 text-amber-800',
    released: 'bg-emerald-100 text-emerald-800',
    refunded: 'bg-blue-100 text-blue-800',
    disputed: 'bg-red-100 text-red-800',
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-sky-100 text-slate-800">
      <header className="border-b border-white/60 bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/admin"
              className="text-sky-600 hover:text-sky-700 text-sm font-medium"
            >
              ← Dashboard
            </Link>
            <div>
              <p className="text-xs uppercase tracking-widest text-sky-600">Morongwa</p>
              <div className="mt-1 flex items-center gap-2 text-sm text-slate-500">
                <Lock className="h-4 w-4 text-sky-500" />
                <span>Escrow & ledger</span>
              </div>
              <h1 className="mt-1 text-2xl font-semibold text-slate-900">View escrow</h1>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="inline-flex items-center gap-2 rounded-full bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-slate-500" />
            <label className="text-sm font-medium text-slate-700">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPagination((p) => ({ ...p, page: 1 }));
              }}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="">All</option>
              {STATUS_OPTIONS.filter(Boolean).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={() => fetchEscrows(pagination.page)}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
          </div>
        ) : escrows.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-600">
            <Wallet className="mx-auto mb-4 h-12 w-12 text-slate-300" />
            <p>No escrows found.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">
                    Task / ID
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">
                    Client / Runner
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">
                    Amount
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">
                    FNB
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-slate-600">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {escrows.map((e: any) => (
                  <tr key={e._id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-slate-900">
                        {e.task?.title || 'Task'} 
                      </div>
                      <div className="text-xs text-slate-500">{e._id?.slice(-8)}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      <div>{e.client?.name || '—'}</div>
                      <div className="text-xs text-slate-500">{e.runner?.name || '—'}</div>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className="font-medium">{e.currency} {e.totalHeld?.toFixed(2)}</span>
                      <div className="text-xs text-slate-500">Runner net: {e.runnersNet?.toFixed(2)}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusColor[e.status] || 'bg-slate-100 text-slate-700'}`}>
                        {e.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {e.fnbStatus || '—'}
                      {e.fnbInstructionId && (
                        <div className="text-slate-400 truncate max-w-[120px]" title={e.fnbInstructionId}>
                          {e.fnbInstructionId.slice(0, 12)}…
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/escrows/${e._id}`}
                        className="inline-flex items-center gap-1 text-sm font-medium text-sky-600 hover:text-sky-700"
                      >
                        View ledger
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pagination.pages > 1 && (
          <div className="mt-6 flex justify-center gap-2">
            <button
              disabled={pagination.page <= 1}
              onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm disabled:opacity-50"
            >
              Previous
            </button>
            <span className="flex items-center px-4 text-sm text-slate-600">
              Page {pagination.page} of {pagination.pages}
            </span>
            <button
              disabled={pagination.page >= pagination.pages}
              onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

export default function ProtectedAdminEscrows() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'superadmin']}>
      <AdminEscrowsPage />
    </ProtectedRoute>
  );
}
