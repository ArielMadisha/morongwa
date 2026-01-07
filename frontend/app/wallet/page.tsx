'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { walletAPI, paymentsAPI } from '@/lib/api';
import { Wallet as WalletType, Payment } from '@/lib/types';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Wallet as WalletIcon,
  ArrowUp,
  ArrowDown,
  DollarSign,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  Plus,
  ArrowLeft,
  TrendingUp,
  History
} from 'lucide-react';
import toast from 'react-hot-toast';

function WalletPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [wallet, setWallet] = useState<WalletType | null>(null);
  const [transactions, setTransactions] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTopUpModal, setShowTopUpModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [amount, setAmount] = useState('');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    fetchWalletData();
  }, []);

  const fetchWalletData = async () => {
    try {
      const [walletResponse, transactionsResponse] = await Promise.all([
        walletAPI.getBalance(),
        paymentsAPI.getHistory(),
      ]);
      setWallet(walletResponse.data);
      setTransactions(transactionsResponse.data);
    } catch (error) {
      toast.error('Failed to load wallet data');
    } finally {
      setLoading(false);
    }
  };

  const handleTopUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setProcessing(true);

    try {
      const response = await walletAPI.topUp(parseFloat(amount));
      toast.success('Top-up initiated! Redirecting to payment...');
      // Redirect to PayGate payment URL
      if (response.data.paymentUrl) {
        window.location.href = response.data.paymentUrl;
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to initiate top-up');
      setProcessing(false);
    }
  };

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    setProcessing(true);

    try {
      await walletAPI.withdraw(parseFloat(amount));
      toast.success('Withdrawal request submitted!');
      setShowWithdrawModal(false);
      setAmount('');
      fetchWalletData();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to process withdrawal');
    } finally {
      setProcessing(false);
    }
  };

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'top_up':
      case 'refund':
        return <ArrowDown className="h-5 w-5 text-green-600" />;
      case 'task_payment':
      case 'withdrawal':
        return <ArrowUp className="h-5 w-5 text-red-600" />;
      default:
        return <DollarSign className="h-5 w-5 text-gray-600" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded-full">Completed</span>;
      case 'pending':
        return <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-medium rounded-full">Pending</span>;
      case 'failed':
        return <span className="px-2 py-1 bg-red-100 text-red-800 text-xs font-medium rounded-full">Failed</span>;
      default:
        return <span className="px-2 py-1 bg-gray-100 text-gray-800 text-xs font-medium rounded-full">{status}</span>;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/dashboard"
            className="inline-flex items-center text-gray-600 hover:text-gray-900 mb-4 transition-colors"
          >
            <ArrowLeft className="h-5 w-5 mr-2" />
            Back to Dashboard
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Wallet</h1>
        </div>

        {/* Balance Card */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl shadow-xl p-8 text-white mb-8">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm opacity-90 mb-2">Available Balance</p>
              <p className="text-5xl font-bold">R{wallet?.balance.toFixed(2) || '0.00'}</p>
              {wallet && wallet.pendingBalance > 0 && (
                <p className="text-sm opacity-90 mt-2">
                  Pending: R{wallet.pendingBalance.toFixed(2)}
                </p>
              )}
            </div>
            <WalletIcon className="h-20 w-20 opacity-50" />
          </div>
          <div className="mt-8 flex space-x-4">
            <button
              onClick={() => setShowTopUpModal(true)}
              className="flex-1 bg-white text-blue-600 px-6 py-3 rounded-lg hover:bg-gray-50 font-medium transition-colors inline-flex items-center justify-center"
            >
              <Plus className="mr-2 h-5 w-5" />
              Top Up
            </button>
            <button
              onClick={() => setShowWithdrawModal(true)}
              className="flex-1 bg-white bg-opacity-20 text-white px-6 py-3 rounded-lg hover:bg-opacity-30 font-medium transition-colors inline-flex items-center justify-center backdrop-blur-sm"
            >
              <ArrowUp className="mr-2 h-5 w-5" />
              Withdraw
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Earned</p>
                <p className="text-2xl font-bold text-green-600">
                  R{transactions
                    .filter(t => t.type === 'task_payment' && t.status === 'completed' && t.to?._id === user?._id)
                    .reduce((sum, t) => sum + t.amount, 0)
                    .toFixed(2)}
                </p>
              </div>
              <TrendingUp className="h-10 w-10 text-green-600" />
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Spent</p>
                <p className="text-2xl font-bold text-red-600">
                  R{transactions
                    .filter(t => t.type === 'task_payment' && t.status === 'completed' && t.from?._id === user?._id)
                    .reduce((sum, t) => sum + t.amount, 0)
                    .toFixed(2)}
                </p>
              </div>
              <ArrowUp className="h-10 w-10 text-red-600" />
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Transactions</p>
                <p className="text-2xl font-bold text-gray-900">{transactions.length}</p>
              </div>
              <History className="h-10 w-10 text-gray-600" />
            </div>
          </div>
        </div>

        {/* Transaction History */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Transaction History</h2>
          </div>
          {transactions.length === 0 ? (
            <div className="p-12 text-center">
              <History className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No transactions yet</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {transactions.map((transaction) => (
                <div key={transaction._id} className="px-6 py-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className="h-10 w-10 bg-gray-100 rounded-full flex items-center justify-center">
                        {getTransactionIcon(transaction.type)}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 capitalize">
                          {transaction.type.replace('_', ' ')}
                        </p>
                        <p className="text-sm text-gray-600">
                          {new Date(transaction.createdAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`font-semibold ${
                        transaction.to?._id === user?._id ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {transaction.to?._id === user?._id ? '+' : '-'}R{transaction.amount.toFixed(2)}
                      </p>
                      {getStatusBadge(transaction.status)}
                    </div>
                  </div>
                  {transaction.task && (
                    <p className="text-sm text-gray-600 mt-2 ml-14">
                      Task: {transaction.task.title}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Top Up Modal */}
      {showTopUpModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Top Up Wallet</h2>
            <form onSubmit={handleTopUp} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount (R)</label>
                <input
                  type="number"
                  required
                  min="10"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="100.00"
                />
                <p className="mt-1 text-xs text-gray-500">Minimum R10.00</p>
              </div>
              <div className="flex space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowTopUpModal(false)}
                  disabled={processing}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={processing}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors disabled:bg-blue-400 disabled:cursor-not-allowed"
                >
                  {processing ? (
                    <>
                      <Loader2 className="inline-block animate-spin -ml-1 mr-2 h-4 w-4" />
                      Processing...
                    </>
                  ) : (
                    'Continue to Payment'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Withdraw Modal */}
      {showWithdrawModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Withdraw Funds</h2>
            <form onSubmit={handleWithdraw} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount (R)</label>
                <input
                  type="number"
                  required
                  min="10"
                  max={wallet?.balance || 0}
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="100.00"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Available balance: R{wallet?.balance.toFixed(2) || '0.00'}
                </p>
              </div>
              <div className="flex space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowWithdrawModal(false)}
                  disabled={processing}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={processing}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors disabled:bg-blue-400 disabled:cursor-not-allowed"
                >
                  {processing ? (
                    <>
                      <Loader2 className="inline-block animate-spin -ml-1 mr-2 h-4 w-4" />
                      Processing...
                    </>
                  ) : (
                    'Withdraw'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProtectedWalletPage() {
  return (
    <ProtectedRoute>
      <WalletPage />
    </ProtectedRoute>
  );
}
