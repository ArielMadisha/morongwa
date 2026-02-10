'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import { adminAPI } from '@/lib/api';
import Link from 'next/link';
import {
  LogOut,
  Loader2,
  ArrowLeft,
  FileText,
  RefreshCw,
  Filter,
} from 'lucide-react';
import toast from 'react-hot-toast';

function AdminAuditPage() {
  const { user, logout } = useAuth();
  const [logs, setLogs] = useState<any[]>([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 25, pages: 0 });
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('');

  const fetchLogs = async (page = 1) => {
    setLoading(true);
    try {
      const params: any = { page, limit: 25 };
      if (actionFilter) params.action = actionFilter;
      const res = await adminAPI.getAuditLogs(params);
      setLogs(res.data.logs || []);
      setPagination(res.data.pagination || { total: 0, page: 1, limit: 25, pages: 0 });
    } catch {
      toast.error('Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs(pagination.page);
  }, [actionFilter, pagination.page]);

  const handleLogout = () => {
    logout();
    window.location.href = '/';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-sky-100 text-slate-800">
      <header className="border-b border-white/60 bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/admin"
              className="inline-flex items-center gap-1 text-sky-600 hover:text-sky-700 text-sm font-medium"
            >
              <ArrowLeft className="h-4 w-4" />
              Dashboard
            </Link>
            <div>
              <p className="text-xs uppercase tracking-widest text-sky-600">Morongwa</p>
              <div className="mt-1 flex items-center gap-2 text-sm text-slate-500">
                <FileText className="h-4 w-4 text-sky-500" />
                <span>Audit logging</span>
              </div>
              <h1 className="mt-1 text-2xl font-semibold text-slate-900">Audit log</h1>
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
            <label className="text-sm font-medium text-slate-700">Action</label>
            <input
              type="text"
              value={actionFilter}
              onChange={(e) => {
                setActionFilter(e.target.value);
                setPagination((p) => ({ ...p, page: 1 }));
              }}
              placeholder="e.g. USER_SUSPENDED"
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm w-56"
            />
          </div>
          <button
            onClick={() => fetchLogs(pagination.page)}
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
        ) : logs.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-600">
            <FileText className="mx-auto mb-4 h-12 w-12 text-slate-300" />
            <p>No audit entries found.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">Time</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">Action</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">User</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">Target / Meta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((log: any) => (
                  <tr key={log._id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-slate-900">{log.action}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      {log.user?.name || log.user?.email || '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 max-w-xs">
                      {log.target ? `Target: ${typeof log.target === 'object' ? log.target._id : log.target}` : ''}
                      {log.meta && Object.keys(log.meta).length > 0 && (
                        <pre className="mt-1 text-slate-500 overflow-x-auto">
                          {JSON.stringify(log.meta)}
                        </pre>
                      )}
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

export default function ProtectedAdminAudit() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'superadmin']}>
      <AdminAuditPage />
    </ProtectedRoute>
  );
}
