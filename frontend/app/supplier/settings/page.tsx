'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { suppliersAPI } from '@/lib/api';
import Link from 'next/link';
import { Loader2, Truck, BookOpen } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useCartAndStores } from '@/lib/useCartAndStores';
import { AppSidebar, AppSidebarMenuButton } from '@/components/AppSidebar';
import { ProfileDropdown } from '@/components/ProfileDropdown';

export default function SupplierSettingsPage() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const { cartCount, hasStore } = useCartAndStores(!!user);
  const [menuOpen, setMenuOpen] = useState(false);
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

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-amber-50/20 to-sky-50 flex items-center justify-center">
          <Loader2 className="h-10 w-10 animate-spin text-sky-600" />
        </div>
      </ProtectedRoute>
    );
  }

  if (!supplier || supplier.status !== 'approved') {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-amber-50/20 to-sky-50 text-slate-800 flex">
          <AppSidebar variant="wall" userName={user?.name} cartCount={cartCount} hasStore={hasStore} onLogout={handleLogout} menuOpen={menuOpen} setMenuOpen={setMenuOpen} />
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            <header className="bg-white/85 backdrop-blur-md border-b border-slate-100 px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between gap-4">
              <AppSidebarMenuButton onClick={() => setMenuOpen(true)} />
              <ProfileDropdown userName={user?.name} className="ml-auto" />
            </header>
            <main className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-8 flex items-center justify-center">
              <div className="text-center">
                <p className="text-slate-600 mb-4">Only approved suppliers can update settings.</p>
                <Link href="/supplier/apply" className="text-sky-600 hover:underline font-medium">Apply to become a supplier</Link>
              </div>
            </main>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-amber-50/20 to-sky-50 text-slate-800 flex">
        <AppSidebar variant="wall" userName={user?.name} cartCount={cartCount} hasStore={hasStore} onLogout={handleLogout} menuOpen={menuOpen} setMenuOpen={setMenuOpen} />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <header className="bg-white/85 backdrop-blur-md border-b border-slate-100 px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between gap-4">
            <AppSidebarMenuButton onClick={() => setMenuOpen(true)} />
            <ProfileDropdown userName={user?.name} className="ml-auto" />
          </header>
          <main className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="max-w-xl mx-auto">
              <h1 className="text-2xl font-bold text-slate-900 mb-2">Supplier settings</h1>
              <p className="text-slate-600 mb-6">Configure shipping, store info, and add products.</p>

              <div className="mb-8 rounded-xl border border-sky-100 bg-sky-50/50 p-4">
                <p className="text-sm font-semibold text-slate-800 mb-3">Add product flow</p>
                <ol className="space-y-2 text-sm text-slate-700 list-none">
                  <li className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-600 text-white text-xs font-bold">1</span>
                    <span><strong>Be verified</strong> — You&apos;re approved. Add products to sell.</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-600 text-white text-xs font-bold">2</span>
                    <span><strong>Fill the form</strong> — Title, price, description, sizes, and options (e.g. allow resell).</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-600 text-white text-xs font-bold">3</span>
                    <span><strong>Product goes live</strong> — It appears on QwertyHub and can be bought or resold by others.</span>
                  </li>
                </ol>
                <Link href="/supplier/products" className="mt-3 inline-block text-sm font-medium text-sky-600 hover:text-sky-700">Add product →</Link>
              </div>

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

          <div className="mt-8 rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-sky-600" /> Policies & Legal
            </h2>
            <p className="text-sm text-slate-600 mb-4">
              Policies relevant to suppliers, products, and payouts.
            </p>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/policies/refunds-cancellations" className="text-sky-600 hover:text-sky-700 hover:underline">
                  Refunds, Cancellations & Cooling-off
                </Link>
              </li>
              <li>
                <Link href="/policies/escrow-payouts" className="text-sky-600 hover:text-sky-700 hover:underline">
                  Escrow & Payouts
                </Link>
              </li>
              <li>
                <Link href="/policies/pricing-fees" className="text-sky-600 hover:text-sky-700 hover:underline">
                  Pricing & Fees
                </Link>
              </li>
              <li>
                <Link href="/policies/suppliers-manufacturers" className="text-sky-600 hover:text-sky-700 hover:underline">
                  Suppliers & Manufacturers
                </Link>
              </li>
              <li>
                <Link href="/policies/terms-of-service" className="text-sky-600 hover:text-sky-700 hover:underline">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link href="/policies" className="text-sky-600 hover:text-sky-700 hover:underline font-medium">
                  All policies →
                </Link>
              </li>
            </ul>
          </div>

          <Link href="/supplier/products" className="inline-flex items-center gap-2 mt-6 text-sky-600 hover:text-sky-700 font-medium">
            Add product →
          </Link>
            </div>
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
