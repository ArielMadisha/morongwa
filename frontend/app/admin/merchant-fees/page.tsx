'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { adminAPI } from '@/lib/api';

export default function AdminMerchantFeesPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [paygateFlatFeeZar, setPaygateFlatFeeZar] = useState<number>(5);
  const [walletPayoutFeeZar, setWalletPayoutFeeZar] = useState<number>(5);
  const [envDefaults, setEnvDefaults] = useState<{ paygateFlatFeeZar: number; walletPayoutFeeZar: number } | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [updatedBy, setUpdatedBy] = useState<string>('');

  const loadSettings = async () => {
    try {
      const res = await adminAPI.getPaymentFees();
      const data = res.data?.data;
      setPaygateFlatFeeZar(Number(data?.paygateFlatFeeZar ?? 5));
      setWalletPayoutFeeZar(Number(data?.walletPayoutFeeZar ?? 5));
      setEnvDefaults(data?.envDefaults || null);
      setUpdatedAt(data?.updatedAt ? String(data.updatedAt) : null);
      setUpdatedBy(String(data?.updatedBy?.name || data?.updatedBy?.email || ''));
    } catch {
      toast.error('Failed to load payment fee settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const save = async () => {
    try {
      setSaving(true);
      await adminAPI.updatePaymentFees({
        paygateFlatFeeZar: Math.max(0, Number(paygateFlatFeeZar || 0)),
        walletPayoutFeeZar: Math.max(0, Number(walletPayoutFeeZar || 0)),
      });
      toast.success('Payment fees saved');
      await loadSettings();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || e?.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ProtectedRoute allowedRoles={['admin', 'superadmin']}>
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-sky-100 text-slate-800">
        <header className="border-b border-white/60 bg-white/70 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
            <div>
              <p className="text-xs uppercase tracking-widest text-sky-600">Qwertymates</p>
              <h1 className="mt-1 text-3xl font-semibold text-slate-900">Payment fee governance</h1>
              <p className="mt-1 text-sm text-slate-600">Control card top-up and wallet payout flat fees.</p>
            </div>
            <Link
              href="/admin"
              className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:shadow-md"
            >
              <ArrowLeft className="h-4 w-4" /> Back to admin
            </Link>
          </div>
        </header>

        <main className="mx-auto max-w-5xl px-6 py-8">
          <div className="rounded-2xl border border-white/60 bg-white/80 p-5 shadow-xl shadow-sky-50">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm text-slate-600">
                Last updated: {updatedAt ? new Date(updatedAt).toLocaleString() : 'Never'} {updatedBy ? `by ${updatedBy}` : ''}
              </p>
              <button
                type="button"
                onClick={save}
                disabled={saving || loading}
                className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save policy
              </button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-14">
                <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                    PayGate flat fee (wallet top-ups only)
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Applies when a user loads wallet by card (including P2P send shortfall top-up).
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-700">R</span>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={paygateFlatFeeZar}
                      onChange={(e) => setPaygateFlatFeeZar(Math.max(0, Number(e.target.value || 0)))}
                      className="w-32 rounded-md border border-slate-200 px-2 py-1 text-sm"
                    />
                  </div>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Wallet payout/disbursement fee
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Applies when user requests payout to bank/disbursement.
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-700">R</span>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={walletPayoutFeeZar}
                      onChange={(e) => setWalletPayoutFeeZar(Math.max(0, Number(e.target.value || 0)))}
                      className="w-32 rounded-md border border-slate-200 px-2 py-1 text-sm"
                    />
                  </div>
                </div>
                {envDefaults && (
                  <p className="text-xs text-slate-500">
                    Env fallback defaults — top-up fee: R{envDefaults.paygateFlatFeeZar.toFixed(2)} | payout fee: R
                    {envDefaults.walletPayoutFeeZar.toFixed(2)}
                  </p>
                )}
              </div>
            )}
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
