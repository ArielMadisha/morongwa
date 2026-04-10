'use client';

import { useState, useEffect } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { adminAPI } from '@/lib/api';
import Link from 'next/link';
import { ArrowLeft, Store, Loader2, CheckCircle, XCircle, Ban, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';

interface AgentRow {
  _id: string;
  name?: string;
  email?: string;
  username?: string;
  phone?: string;
  isVerified?: boolean;
  merchantAgent?: {
    applicationStatus?: string;
    businessName?: string;
    businessDescription?: string;
    publicNote?: string;
    appliedAt?: string;
    reviewedAt?: string;
    rejectionReason?: string;
  };
  createdAt?: string;
}

export default function AdminMerchantAgentsPage() {
  const [rows, setRows] = useState<AgentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [actionId, setActionId] = useState<string | null>(null);

  const fetchRows = async () => {
    try {
      const res = await adminAPI.getMerchantAgentApplications({
        status: statusFilter === 'all' ? 'all' : statusFilter,
      });
      const list = res.data?.data ?? [];
      setRows(Array.isArray(list) ? list : []);
    } catch {
      toast.error('Failed to load applications');
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchRows();
  }, [statusFilter]);

  const run = async (fn: () => Promise<unknown>, msg: string) => {
    try {
      await fn();
      toast.success(msg);
      fetchRows();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || e?.response?.data?.error || 'Action failed');
    } finally {
      setActionId(null);
    }
  };

  return (
    <ProtectedRoute allowedRoles={['admin', 'superadmin']}>
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-sky-100 text-slate-800">
        <header className="border-b border-white/60 bg-white/70 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
            <div>
              <p className="text-xs uppercase tracking-widest text-sky-600">Qwertymates</p>
              <h1 className="mt-1 text-3xl font-semibold text-slate-900 flex items-center gap-2">
                <Store className="h-8 w-8 text-sky-600" /> Merchant agents
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                KYC + business review. Approve only active businesses with sufficient wallet float discipline.
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
          <div className="mb-6 flex flex-wrap gap-2">
            {['pending', 'approved', 'rejected', 'suspended', 'all'].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`rounded-lg px-4 py-2 text-sm font-medium capitalize ${
                  statusFilter === s ? 'bg-sky-600 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          <div className="rounded-2xl border border-white/60 bg-white/80 shadow-xl shadow-sky-50 backdrop-blur overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-10 w-10 animate-spin text-sky-600" />
              </div>
            ) : rows.length === 0 ? (
              <div className="py-16 text-center text-slate-500">No applications found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">User</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Business</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">KYC</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Status</th>
                      <th className="text-right py-3 px-4 text-sm font-semibold text-slate-700">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((u) => {
                      const st = u.merchantAgent?.applicationStatus || '—';
                      const busy = actionId === u._id;
                      return (
                        <tr key={u._id} className="border-b border-slate-50 hover:bg-slate-50/50 align-top">
                          <td className="py-3 px-4 text-sm">
                            <p className="font-medium text-slate-900">{u.name || u.username}</p>
                            <p className="text-xs text-slate-500">{u.email}</p>
                            <p className="text-xs text-slate-500">{u.phone || '—'}</p>
                          </td>
                          <td className="py-3 px-4 text-sm max-w-md">
                            <p className="font-medium text-slate-800">{u.merchantAgent?.businessName || '—'}</p>
                            <p className="text-xs text-slate-600 line-clamp-3">{u.merchantAgent?.businessDescription || '—'}</p>
                            {u.merchantAgent?.rejectionReason && (
                              <p className="text-xs text-rose-600 mt-1">Last rejection: {u.merchantAgent.rejectionReason}</p>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            {u.isVerified ? (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                                <CheckCircle className="h-3.5 w-3.5" /> Verified
                              </span>
                            ) : (
                              <span className="text-xs text-amber-700">Not verified</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-sm capitalize text-slate-700">{st}</td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex flex-col items-end gap-2">
                              {st === 'pending' && (
                                <>
                                  <div className="flex gap-2">
                                    <button
                                      type="button"
                                      disabled={busy || !u.isVerified}
                                      onClick={() => {
                                        setActionId(u._id);
                                        run(() => adminAPI.approveMerchantAgent(u._id), 'Approved');
                                      }}
                                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                                    >
                                      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
                                      Approve
                                    </button>
                                    <button
                                      type="button"
                                      disabled={busy}
                                      onClick={() => {
                                        const reason = window.prompt('Rejection reason (optional)') ?? '';
                                        setActionId(u._id);
                                        run(() => adminAPI.rejectMerchantAgent(u._id, reason), 'Rejected');
                                      }}
                                      className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-800 hover:bg-rose-100"
                                    >
                                      <XCircle className="h-3 w-3" /> Reject
                                    </button>
                                  </div>
                                  {!u.isVerified && (
                                    <p className="text-[10px] text-amber-700">Approve disabled until KYC verified.</p>
                                  )}
                                </>
                              )}
                              {st === 'approved' && (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => {
                                    setActionId(u._id);
                                    run(() => adminAPI.suspendMerchantAgent(u._id), 'Suspended');
                                  }}
                                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50"
                                >
                                  <Ban className="h-3 w-3" /> Suspend
                                </button>
                              )}
                              {st === 'suspended' && (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => {
                                    setActionId(u._id);
                                    run(() => adminAPI.reinstateMerchantAgent(u._id), 'Reinstated');
                                  }}
                                  className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700"
                                >
                                  <RotateCcw className="h-3 w-3" /> Reinstate
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
