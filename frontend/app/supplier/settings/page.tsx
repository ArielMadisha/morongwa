'use client';

import { useState, useEffect } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { suppliersAPI } from '@/lib/api';
import Link from 'next/link';
import { ArrowLeft, Loader2, Truck } from 'lucide-react';
import toast from 'react-hot-toast';
import SiteHeader from '@/components/SiteHeader';

export default function SupplierSettingsPage() {
  const [shippingCost, setShippingCost] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [supplier, setSupplier] = useState<{ status?: string; shippingCost?: number } | null>(null);

  useEffect(() => {
    suppliersAPI.getMe().then((res) => {
      const d = res.data?.data ?? res.data;
      setSupplier(d ?? null);
      if (d?.shippingCost != null) setShippingCost(String(d.shippingCost));
      else setShippingCost('100');
    }).catch(() => setSupplier(null)).finally(() => setLoading(false));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = Number(shippingCost);
    if (isNaN(val) || val < 0) {
      toast.error('Enter a valid shipping cost (ZAR)');
      return;
    }
    setSaving(true);
    try {
      await suppliersAPI.updateMe({ shippingCost: val });
      toast.success('Shipping cost updated');
      setSupplier((s) => (s ? { ...s, shippingCost: val } : null));
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-sky-100 flex items-center justify-center">
          <Loader2 className="h-10 w-10 animate-spin text-sky-600" />
        </div>
      </ProtectedRoute>
    );
  }

  if (!supplier || supplier.status !== 'approved') {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-sky-100 flex items-center justify-center">
          <div className="text-center">
            <p className="text-slate-600 mb-4">Only approved suppliers can update settings.</p>
            <Link href="/supplier/apply" className="text-sky-600 hover:underline font-medium">Apply to become a supplier</Link>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-sky-100 text-slate-800">
        <SiteHeader />
        <main className="max-w-xl mx-auto px-4 sm:px-6 py-12">
          <nav className="flex items-center gap-2 text-sm text-slate-600 mb-6">
            <Link href="/marketplace" className="text-sky-600 hover:underline">Marketplace</Link>
            <span>/</span>
            <span className="text-slate-800 font-medium">Supplier settings</span>
          </nav>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Supplier settings</h1>
          <p className="text-slate-600 mb-6">Configure shipping and other options for your products.</p>

          <div className="rounded-2xl border border-white/60 bg-white/80 p-6 shadow-xl shadow-sky-50">
            <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <Truck className="h-5 w-5 text-sky-600" /> Shipping cost
            </h2>
            <p className="text-sm text-slate-600 mb-4">
              This amount is charged per order when customers buy your products. If the cart has items from multiple suppliers, each supplier&apos;s shipping cost is added.
            </p>
            <form onSubmit={handleSave} className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Shipping cost (ZAR)</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={shippingCost}
                  onChange={(e) => setShippingCost(e.target.value)}
                  className="rounded-lg border border-slate-200 px-3 py-2 w-32 text-slate-900 focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                />
              </div>
              <button type="submit" disabled={saving} className="rounded-lg bg-sky-600 px-4 py-2 text-white font-medium hover:bg-sky-700 disabled:opacity-50 flex items-center gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save
              </button>
            </form>
          </div>

          <Link href="/supplier/products" className="inline-flex items-center gap-2 mt-6 text-sky-600 hover:text-sky-700 font-medium">
            <ArrowLeft className="h-4 w-4" /> Back to Add product
          </Link>
        </main>
      </div>
    </ProtectedRoute>
  );
}
