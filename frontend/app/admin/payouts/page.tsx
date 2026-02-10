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
  DollarSign,
  Send,
  RefreshCw,
  Banknote,
} from 'lucide-react';
import toast from 'react-hot-toast';

function AdminPayoutsPage() {
  const { user, logout } = useAuth();
  const [escrows, setEscrows] = useState<any[]>([]);
  const [fnbBalance, setFnbBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [escRes, balanceRes] = await Promise.all([
        adminAPI.getEscrows({ status: 'released', limit: 100 }),
        adminAPI.getFnbBalance().catch(() => ({ data: { balance: null } })),
      ]);
      setEscrows(escRes.data.escrows || []);
      setFnbBalance(balanceRes.data?.balance ?? null);
    } catch {
      toast.error('Failed to load payouts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleInitiate = async (id: string) => {
    setActionLoading(id);
    try {
      await adminAPI.initiateEscrowPayout(id);
      toast.success('FNB payout initiated');
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Initiate failed');
    } finally {
      setActionLoading(null);
    }
  };

  const handlePoll = async (id: string) => {
    setActionLoading(`poll-${id}`);
    try {
      await adminAPI.pollEscrowPayout(id);
      toast.success('Status updated');
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Poll failed');
    } finally {
      setActionLoading(null);
    }
  };

  const handleLogout = () => {
    logout();
    window.location.href = '/';
  };

  const pendingPayout = escrows.filter(
    (e: any) => !e.fnbInstructionId || ['pending', 'submitted', 'processing'].includes(e.fnbStatus)
  );
  const completedPayout = escrows.filter(
    (e: any) => e.fnbStatus === 'SUCCESS'
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-sky-100 text-slate-800">
      <header className="border-b border-white/60 bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <Link href="/admin" className="inline-flex items-center gap-1 text-sky-600 hover:text-sky-700 text-sm font-medium">
              <ArrowLeft className="h-4 w-4" />
              Dashboard
            </Link>
            <div>
              <p className="text-xs uppercase tracking-widest text-sky-600">Morongwa</p>
              <div className="mt-1 flex items-center gap-2 text-sm text-slate-500">
                <Banknote className="h-4 w-4 text-sky-500" />
                <span>FNB payouts</span>
              </div>
              <h1 className="mt-1 text-2xl font-semibold text-slate-900">Initiate & poll payouts</h1>
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
        {fnbBalance !== null && (
          <div className="mb-8 rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50 to-white p-6">
            <h2 className="text-sm font-semibold uppercase text-sky-700">FNB merchant balance</h2>
            <p className="mt-2 text-3xl font-bold text-slate-900">R {fnbBalance?.toFixed(2) ?? '—'}</p>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
          </div>
        ) : (
          <>
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Released escrows (ready for payout)</h2>
              <button
                onClick={fetchData}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </button>
            </div>

            {pendingPayout.length === 0 && completedPayout.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-600">
                <DollarSign className="mx-auto mb-4 h-12 w-12 text-slate-300" />
                <p>No released escrows. Release escrow from the escrow detail page first.</p>
                <Link href="/admin/escrows" className="mt-4 inline-block text-sky-600 hover:underline">
                  View escrows →
                </Link>
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">Escrow / Task</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">Runner</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">Amount</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">FNB status</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-slate-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {[...pendingPayout, ...completedPayout].map((e: any) => (
                      <tr key={e._id} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3">
                          <Link href={`/admin/escrows/${e._id}`} className="text-sky-600 hover:underline font-medium">
                            {e._id?.slice(-8)}
                          </Link>
                          <div className="text-xs text-slate-500">{e.task?.title || '—'}</div>
                        </td>
                        <td className="px-4 py-3 text-sm">{e.runner?.name || '—'}</td>
                        <td className="px-4 py-3 font-medium">{e.currency} {e.runnersNet?.toFixed(2)}</td>
                        <td className="px-4 py-3 text-sm">{e.fnbStatus || '—'}</td>
                        <td className="px-4 py-3 text-right">
                          {!e.fnbInstructionId ? (
                            <button
                              onClick={() => handleInitiate(e._id)}
                              disabled={!!actionLoading}
                              className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-50"
                            >
                              {actionLoading === e._id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                              Initiate
                            </button>
                          ) : e.fnbStatus !== 'SUCCESS' && e.fnbStatus !== 'FAILED' && e.fnbStatus !== 'REJECTED' ? (
                            <button
                              onClick={() => handlePoll(e._id)}
                              disabled={!!actionLoading}
                              className="inline-flex items-center gap-1 rounded-lg border border-sky-600 px-3 py-1.5 text-xs font-medium text-sky-600 hover:bg-sky-50 disabled:opacity-50"
                            >
                              {actionLoading === `poll-${e._id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                              Poll
                            </button>
                          ) : (
                            <span className="text-xs text-slate-500">{e.fnbStatus}</span>
                          )}
                          <Link href={`/admin/escrows/${e._id}`} className="ml-2 text-xs text-sky-600 hover:underline">
                            View
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default function ProtectedAdminPayouts() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'superadmin']}>
      <AdminPayoutsPage />
    </ProtectedRoute>
  );
}
