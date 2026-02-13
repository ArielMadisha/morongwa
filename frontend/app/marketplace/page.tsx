'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Package, ArrowRight, ShoppingBag, Store, Building2 } from 'lucide-react';
import { productsAPI, getImageUrl } from '@/lib/api';
import type { Product } from '@/lib/types';
import { useAuth } from '@/contexts/AuthContext';
import { useCartAndStores } from '@/lib/useCartAndStores';
import ProtectedRoute from '@/components/ProtectedRoute';
import { AppSidebar, AppSidebarMenuButton } from '@/components/AppSidebar';
import { ProfileDropdown } from '@/components/ProfileDropdown';

function formatPrice(price: number, currency: string) {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: currency || 'ZAR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);
}

function MarketplacePageContent() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const { cartCount, hasStore } = useCartAndStores(!!user);

  useEffect(() => {
    productsAPI
      .list({ limit: 50 })
      .then((res) => {
        const list = res.data?.data ?? res.data ?? [];
        setProducts(Array.isArray(list) ? list : []);
      })
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  }, []);

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-blue-50 to-white text-slate-900 flex">
      <AppSidebar
        variant="wall"
        userName={user?.name}
        cartCount={cartCount}
        hasStore={hasStore}
        onLogout={handleLogout}
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
      />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="bg-white/85 backdrop-blur-md border-b border-slate-100 shadow-sm flex-shrink-0">
          <div className="px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <AppSidebarMenuButton onClick={() => setMenuOpen(true)} />
                <div className="flex items-center gap-2">
                  <div className="h-9 w-9 rounded-xl bg-sky-100 border border-sky-200 flex items-center justify-center">
                    <ShoppingBag className="h-5 w-5 text-sky-600" />
                  </div>
                  <h1 className="text-lg font-semibold text-slate-900">QwertyHub</h1>
                </div>
              </div>
              <div className="flex gap-2">
                <Link href="/supplier/apply" className="shrink-0 rounded-xl border border-sky-200 bg-white/80 px-4 py-2 text-sm font-medium text-sky-700 hover:bg-sky-50 transition-colors">
                  Become a supplier
                </Link>
                <ProfileDropdown userName={user?.name} />
              </div>
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-6">
        <p className="text-slate-600 mb-8">Products from verified suppliers. Buy or resell with delivery by runners.</p>

        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="bg-white/80 rounded-2xl border border-slate-100 p-6 animate-pulse">
                <div className="h-40 bg-slate-200 rounded-xl mb-4" />
                <div className="h-5 bg-slate-200 rounded w-3/4 mb-2" />
                <div className="h-5 bg-slate-200 rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="bg-white/90 backdrop-blur rounded-2xl border border-slate-100 p-12 text-center">
            <Package className="h-16 w-16 text-slate-300 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-slate-700 mb-2">No products yet</h2>
            <p className="text-slate-600 mb-6">Suppliers will list products here soon. Check back or post a task in the meantime.</p>
            <Link
              href="/wall"
              className="inline-flex items-center gap-2 text-sky-600 hover:text-sky-700 font-medium"
            >
              Back to home
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {products.map((p) => (
              <Link
                key={p._id}
                href={`/marketplace/product/${p._id}`}
                className="group relative bg-white/90 backdrop-blur rounded-2xl border border-slate-100 overflow-hidden shadow-sm hover:shadow-lg hover:border-sky-200 transition-all"
              >
                {((p as any).outOfStock || (p.stock != null && p.stock < 1)) && (
                  <span className="absolute top-2 right-2 z-10 px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">Out of stock</span>
                )}
                <div className="aspect-square bg-slate-100 flex items-center justify-center">
                  {p.images?.[0] ? (
                    <img
                      src={getImageUrl(p.images[0])}
                      alt={p.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Package className="h-16 w-16 text-slate-300" />
                  )}
                </div>
                <div className="p-4">
                  <h3 className="font-semibold text-slate-900 group-hover:text-sky-700 truncate">
                    {p.title}
                  </h3>
                  <div className="mt-1">
                    {p.discountPrice != null && p.discountPrice < p.price ? (
                      <>
                        <span className="text-lg font-bold text-sky-600">{formatPrice(p.discountPrice, p.currency)}</span>
                        <span className="ml-2 text-sm text-slate-400 line-through">{formatPrice(p.price, p.currency)}</span>
                      </>
                    ) : (
                      <p className="text-lg font-bold text-sky-600">{formatPrice(p.price, p.currency)}</p>
                    )}
                  </div>
                  {p.ratingAvg != null && (
                    <p className="text-sm text-slate-500 mt-1">
                      {p.ratingAvg.toFixed(1)}★
                      {p.ratingCount != null && p.ratingCount > 0 && ` (${p.ratingCount})`}
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}

        <div className="mt-12 rounded-2xl border border-slate-200 bg-white/90 p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Sell on Morongwa</h2>
          <div className="grid sm:grid-cols-2 gap-6">
            <div className="rounded-xl border border-sky-100 bg-sky-50/50 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Store className="h-5 w-5 text-sky-600" />
                <span className="font-semibold text-slate-800">Reseller (no verification)</span>
              </div>
              <p className="text-sm text-slate-600 mb-3">Add products to your wall and get a store automatically. Rename your store anytime.</p>
              <ol className="text-sm text-slate-700 space-y-1 list-decimal list-inside mb-4">
                <li>Click <strong>Add to my wall</strong> on a product</li>
                <li>Your store is created; go to <Link href="/store" className="text-sky-600 hover:underline">My store</Link> to rename it</li>
                <li>Share your wall link so others can buy from you</li>
              </ol>
              <Link href="/store" className="text-sm font-medium text-sky-600 hover:underline">My store →</Link>
            </div>
            <div className="rounded-xl border border-sky-100 bg-sky-50/50 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Building2 className="h-5 w-5 text-sky-600" />
                <span className="font-semibold text-slate-800">Supplier (verified)</span>
              </div>
              <p className="text-sm text-slate-600 mb-3">List your own products. Apply once, get verified, then add as many products as you like.</p>
              <ol className="text-sm text-slate-700 space-y-1 list-decimal list-inside mb-4">
                <li><Link href="/supplier/apply" className="text-sky-600 hover:underline">Become a supplier</Link> and submit your details</li>
                <li>Admin approves; you get a supplier store</li>
                <li>Use <Link href="/supplier/products" className="text-sky-600 hover:underline">Add product</Link> to list items</li>
              </ol>
              <Link href="/supplier/apply" className="text-sm font-medium text-sky-600 hover:underline">Become a supplier →</Link>
            </div>
          </div>
        </div>
      </main>
      </div>
    </div>
  );
}

export default function MarketplacePage() {
  return (
    <ProtectedRoute>
      <MarketplacePageContent />
    </ProtectedRoute>
  );
}
