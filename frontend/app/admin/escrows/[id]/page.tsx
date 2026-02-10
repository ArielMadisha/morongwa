'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import { adminAPI } from '@/lib/api';
import Link from 'next/link';
import {
  Loader2,
  LogOut,
  Lock,
  Unlock,
  RotateCcw,
  Send,
  RefreshCw,
  ArrowLeft,
  FileText,
} from 'lucide-react';
import toast from 'react-hot-toast';

function AdminEscrowDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, logout } = useAuth();
  const id = params.id as string;
  const [data, setData] = useState<{ escrow: any; ledger: any[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [refundReason, setRefundReason] = useState('');

  const fetchDetail = async () => {
    setLoading(true);
    try {
      const res = await adminAPI.getEscrow(id);
      setData(res.data);
    } catch {
      toast.error('Failed to load escrow');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) fetchDetail();
  }, [id]);

  const runAction = async (
    key: string,
    fn: () => Promise<any>,
    successMsg: string
  ) => {
    setActionLoading(key);
    try {
      await fn();
      toast.success(successMsg);
      fetchDetail();
    } catch (err: any) {
      toast.error(err.response?.data?.error || err.message || 'Action failed');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRelease = () =>
    runAction('release', () => adminAPI.releaseEscrow(id), 'Escrow released. You can initiate FNB payout.');

  const handleRefund = () => {
    if (!refundReason.trim()) {
      toast.error('Please enter a refund reason.');
      return;
    }
    runAction('refund', () => adminAPI.refundEscrow(id, refundReason), 'Refund processed.');
    setRefundReason('');
  };

  const handleInitiatePayout = () =>
    runAction('initiate', () => adminAPI.initiateEscrowPayout(id), 'FNB payout initiated.');

  const handlePollPayout = () =>
    runAction('poll', () => adminAPI.pollEscrowPayout(id), 'Payout status updated.');

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  if (loading || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-sky-50">
        <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
      </div>
    );
  }

  const { escrow, ledger } = data;
  const canRelease = escrow.status === 'held';
  const canRefund = ['pending', 'held'].includes(escrow.status);
  const canInitiatePayout = escrow.status === 'released' && !escrow.fnbInstructionId;
  const canPollPayout = !!escrow.fnbInstructionId && escrow.fnbStatus !== 'SUCCESS' && escrow.fnbStatus !== 'FAILED' && escrow.fnbStatus !== 'REJECTED';

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-sky-100 text-slate-800">
      <header className="border-b border-white/60 bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/admin/escrows"
              className="inline-flex items-center gap-1 text-sky-600 hover:text-sky-700 text-sm font-medium"
            >
              <ArrowLeft className="h-4 w-4" />
              Escrows
            </Link>
            <div>
              <p className="text-xs uppercase tracking-widest text-sky-600">Escrow detail</p>
              <h1 className="mt-1 text-2xl font-semibold text-slate-900">
                {escrow.task?.title || 'Task'} — {escrow._id?.slice(-8)}
              </h1>
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
        {/* Summary card */}
        <div className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Escrow summary</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs uppercase text-slate-500">Status</p>
              <p className="font-medium capitalize">{escrow.status}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-slate-500">Currency / Total held</p>
              <p className="font-medium">{escrow.currency} {escrow.totalHeld?.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-slate-500">Runner net</p>
              <p className="font-medium">{escrow.currency} {escrow.runnersNet?.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-slate-500">FNB status</p>
              <p className="font-medium">{escrow.fnbStatus || '—'} {escrow.fnbInstructionId ? `(${String(escrow.fnbInstructionId).slice(0, 8)}…)` : ''}</p>
            </div>
          </div>
          <div className="mt-4 text-sm text-slate-600">
            <p>Client: {escrow.client?.name} ({escrow.client?.email})</p>
            <p>Runner: {escrow.runner?.name} ({escrow.runner?.email})</p>
          </div>
        </div>

        {/* Actions */}
        <div className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Actions</h2>
          <div className="flex flex-wrap gap-4">
            {canRelease && (
              <button
                onClick={handleRelease}
                disabled={!!actionLoading}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {actionLoading === 'release' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlock className="h-4 w-4" />}
                Release escrow manually
              </button>
            )}
            {canRefund && (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  placeholder="Refund reason"
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm w-48"
                />
                <button
                  onClick={handleRefund}
                  disabled={!!actionLoading || !refundReason.trim()}
                  className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  {actionLoading === 'refund' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                  Process refund
                </button>
              </div>
            )}
            {canInitiatePayout && (
              <button
                onClick={handleInitiatePayout}
                disabled={!!actionLoading}
                className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
              >
                {actionLoading === 'initiate' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Initiate FNB payout
              </button>
            )}
            {canPollPayout && (
              <button
                onClick={handlePollPayout}
                disabled={!!actionLoading}
                className="inline-flex items-center gap-2 rounded-lg border border-sky-600 bg-white px-4 py-2 text-sm font-medium text-sky-600 hover:bg-sky-50 disabled:opacity-50"
              >
                {actionLoading === 'poll' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Poll payout status
              </button>
            )}
            {!canRelease && !canRefund && !canInitiatePayout && !canPollPayout && (
              <p className="text-sm text-slate-500">No actions available for this status.</p>
            )}
          </div>
        </div>

        {/* Full ledger */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-100 px-6 py-4">
            <FileText className="h-5 w-5 text-sky-600" />
            <h2 className="text-lg font-semibold text-slate-900">Full ledger</h2>
          </div>
          <div className="overflow-x-auto">
            {!ledger?.length ? (
              <div className="px-6 py-8 text-center text-slate-500">No ledger entries.</div>
            ) : (
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">Time</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">Amount</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">Debit → Credit</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">Reference</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ledger.map((entry: any) => (
                    <tr key={entry._id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {new Date(entry.createdAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-slate-900">{entry.type}</td>
                      <td className="px-4 py-3 text-sm">{entry.currency} {entry.amount?.toFixed(2)}</td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {entry.debitAccount} → {entry.creditAccount}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 truncate max-w-[140px]" title={entry.reference}>
                        {entry.reference}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          entry.status === 'confirmed' ? 'bg-emerald-100 text-emerald-800' :
                          entry.status === 'failed' ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-700'
                        }`}>
                          {entry.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default function ProtectedAdminEscrowDetail() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'superadmin']}>
      <AdminEscrowDetailPage />
    </ProtectedRoute>
  );
}
