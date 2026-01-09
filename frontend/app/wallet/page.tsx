'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import {
  ArrowLeft,
  ArrowUpRight,
  ArrowDownLeft,
  DollarSign,
  Plus,
  TrendingUp,
  Loader2,
  Send,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import { walletAPI } from '@/lib/api';

function WalletDashboard() {
  const { user } = useAuth();
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [topUpAmount, setTopUpAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchWalletData();
  }, []);

  const fetchWalletData = async () => {
    try {
      const [balanceRes, transRes] = await Promise.all([
        walletAPI.getBalance(),
        walletAPI.getTransactions({ limit: 20 }),
      ]);
      setBalance(balanceRes.data.balance || 0);
      setTransactions(transRes.data || []);
    } catch (error) {
      toast.error('Failed to load wallet');
    } finally {
      setLoading(false);
    }
  };

  const handleTopUp = async () => {
    const amount = parseFloat(topUpAmount);
    if (!amount || amount <= 0) {
      toast.error('Enter a valid amount');
      return;
    }

    setIsSubmitting(true);
    try {
      await walletAPI.topUp(amount);
      toast.success(`R${amount.toFixed(2)} added to wallet`);
      setTopUpAmount('');
      fetchWalletData();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Top-up failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'topup':
        return <Plus className="h-5 w-5 text-emerald-600" />;
      case 'payout':
        return <ArrowDownLeft className="h-5 w-5 text-sky-600" />;
      case 'escrow':
        return <Send className="h-5 w-5 text-purple-600" />;
      case 'refund':
        return <ArrowUpRight className="h-5 w-5 text-cyan-600" />;
      default:
        return <TrendingUp className="h-5 w-5 text-slate-400" />;
    }
  };

  const getTransactionColor = (type: string) => {
    switch (type) {
      case 'topup':
      case 'refund':
        return 'text-emerald-700';
      case 'payout':
        return 'text-sky-700';
      case 'escrow':
        return 'text-purple-700';
      default:
        return 'text-slate-700';
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-sky-50 via-white to-sky-100">
        <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
      </div>
    );
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-sky-100 text-slate-800">
        <header className="border-b border-white/60 bg-white/70 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-sky-600">Morongwa</p>
              <h1 className="mt-1 text-3xl font-semibold text-slate-900">Your wallet</h1>
              <p className="mt-1 text-sm text-slate-600">Manage funds, top up, withdraw securely.</p>
            </div>
            <Link
              href={user?.role?.includes('runner') ? '/dashboard/runner' : user?.role?.includes('client') ? '/dashboard/client' : '/dashboard'}
              className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-6 py-8">
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-6">
              <div className="rounded-2xl border border-white/60 bg-gradient-to-br from-sky-500 via-cyan-500 to-teal-500 p-8 text-white shadow-xl shadow-sky-200">
                <p className="text-xs uppercase tracking-[0.3em] opacity-90">Current balance</p>
                <h2 className="mt-2 text-5xl font-bold">R{balance.toFixed(2)}</h2>
                <p className="mt-3 text-sm opacity-80">Keep it topped up for seamless task payouts.</p>
              </div>

              <div className="rounded-2xl border border-white/60 bg-white/80 p-6 shadow-xl shadow-sky-50 backdrop-blur">
                <div className="mb-6">
                  <p className="text-xs uppercase tracking-[0.2em] text-sky-600">Quick topup</p>
                  <h3 className="mt-1 text-2xl font-semibold text-slate-900">Add funds now</h3>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Amount (ZAR)</label>
                    <input
                      type="number"
                      placeholder="Enter amount..."
                      value={topUpAmount}
                      onChange={(e) => setTopUpAmount(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white/80 px-4 py-3 text-lg font-semibold text-slate-900 transition focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                    />
                  </div>
                  <div className="grid grid-cols-4 gap-3">
                    {[50, 100, 250, 500].map((amt) => (
                      <button
                        key={amt}
                        onClick={() => setTopUpAmount(amt.toString())}
                        className="rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-sky-300 hover:bg-sky-50"
                      >
                        +R{amt}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={handleTopUp}
                    disabled={isSubmitting || !topUpAmount}
                    className="w-full rounded-full bg-gradient-to-r from-sky-500 via-cyan-500 to-teal-500 px-6 py-3 font-semibold text-white shadow-lg shadow-sky-200 transition hover:scale-[1.01] disabled:opacity-50"
                  >
                    {isSubmitting ? <Loader2 className="inline h-4 w-4 animate-spin mr-2" /> : null}
                    Top up wallet
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-white/60 bg-white/80 p-6 shadow-xl shadow-sky-50 backdrop-blur">
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-sky-600">History</p>
                    <h3 className="mt-1 text-2xl font-semibold text-slate-900">Recent transactions</h3>
                  </div>
                  <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-700">
                    {transactions.length} total
                  </span>
                </div>

                {transactions.length === 0 ? (
                  <div className="py-12 text-center text-slate-600">
                    <DollarSign className="mx-auto mb-3 h-12 w-12 text-slate-300" />
                    <p className="font-semibold text-slate-900">No transactions yet</p>
                    <p className="text-sm">Top up or complete tasks to get started.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {transactions.map((tx, idx) => (
                      <div key={idx} className="flex items-center justify-between rounded-lg border border-slate-100 bg-white/80 p-4 transition hover:shadow-md">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100">
                            {getTransactionIcon(tx.type)}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-900 capitalize">{tx.type}</p>
                            <p className="text-xs text-slate-600">{new Date(tx.createdAt).toLocaleDateString()}</p>
                          </div>
                        </div>
                        <p className={`font-bold ${getTransactionColor(tx.type)}`}>
                          {['topup', 'refund'].includes(tx.type) ? '+' : '-'}R{Math.abs(tx.amount).toFixed(2)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-6">
              <div className="rounded-2xl border border-white/60 bg-white/80 p-6 shadow-xl shadow-sky-50 backdrop-blur">
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-sky-600">
                    <TrendingUp className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-sky-600">Quick info</p>
                    <h3 className="text-lg font-semibold text-slate-900">Wallet tips</h3>
                  </div>
                </div>
                <ul className="space-y-3 text-sm text-slate-600">
                  <li className="flex items-start gap-2">
                    <span className="mt-1.5 h-2 w-2 rounded-full bg-sky-500 flex-shrink-0" />
                    <span>Top up anytime for instant payouts.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-1.5 h-2 w-2 rounded-full bg-cyan-500 flex-shrink-0" />
                    <span>Escrow funds are held securely during tasks.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-1.5 h-2 w-2 rounded-full bg-teal-500 flex-shrink-0" />
                    <span>Withdrawals processed within 24 hours.</span>
                  </li>
                </ul>
              </div>

              <div className="rounded-2xl border border-white/60 bg-gradient-to-br from-sky-500 via-cyan-500 to-teal-500 p-6 text-white shadow-xl shadow-sky-200">
                <p className="text-xs uppercase tracking-[0.25em]">Security</p>
                <h3 className="mt-2 text-lg font-semibold">Your funds are protected</h3>
                <p className="mt-2 text-sm text-white/80">All transactions are encrypted and verified. Need help? Contact support.</p>
                <Link
                  href="/support"
                  className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm font-semibold backdrop-blur transition hover:bg-white/20"
                >
                  Get help
                </Link>
              </div>
            </div>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}

export default WalletDashboard;
