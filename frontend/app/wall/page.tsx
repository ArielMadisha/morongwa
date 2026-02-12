'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { AppSidebar, AppSidebarMenuButton } from '@/components/AppSidebar';
import { ProfileDropdown } from '@/components/ProfileDropdown';
import ProtectedRoute from '@/components/ProtectedRoute';
import { productsAPI, getImageUrl } from '@/lib/api';
import { useCartAndStores } from '@/lib/useCartAndStores';
import type { Product } from '@/lib/types';
import { Package, Loader2 } from 'lucide-react';

function formatPrice(price: number, currency: string) {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: currency || 'ZAR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);
}

function WallPageContent() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const { cartCount, hasStore } = useCartAndStores(!!user);

  useEffect(() => {
    productsAPI
      .list({ limit: 24, random: true })
      .then((res) => {
        const raw = res.data?.data ?? res.data ?? [];
        setProducts(Array.isArray(raw) ? raw : (raw as any)?.products ?? []);
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

      <div className="flex-1 flex flex-col min-w-0 overflow-visible">
        <header className="bg-white/85 backdrop-blur-md border-b border-slate-100 shadow-sm flex-shrink-0 overflow-visible">
          <div className="px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <AppSidebarMenuButton onClick={() => setMenuOpen(true)} />
                <p className="text-sm text-slate-600 truncate">Welcome back, {user?.name}</p>
              </div>
              <div className="shrink-0">
                <ProfileDropdown userName={user?.name} onLogout={handleLogout} />
              </div>
            </div>
          </div>
        </header>

        <div className="flex-1 flex gap-6 pt-6 min-h-0">
          {/* Area 1: Main content - products, tasks grid */}
          <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8">
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
            </div>
          ) : products.length === 0 ? (
            <div className="bg-white/90 backdrop-blur-md rounded-2xl border border-slate-100 p-12 text-center">
              <Package className="h-16 w-16 text-slate-300 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-slate-700 mb-2">No products yet</h2>
              <p className="text-slate-600">New products will show here. Use the menu to visit Client Dashboard or Runner cockpit.</p>
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
                    <h3 className="font-semibold text-slate-900 line-clamp-2 group-hover:text-sky-600 transition-colors">
                      {p.title}
                    </h3>
                    <div className="mt-1">
                      {p.discountPrice != null && p.discountPrice < p.price ? (
                        <>
                          <span className="text-lg font-bold text-sky-600">{formatPrice(p.discountPrice, p.currency || 'ZAR')}</span>
                          <span className="ml-2 text-sm text-slate-400 line-through">{formatPrice(p.price, p.currency || 'ZAR')}</span>
                        </>
                      ) : (
                        <p className="text-lg font-bold text-slate-900">{formatPrice(p.price, p.currency || 'ZAR')}</p>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
          </main>

          {/* Area 2: Reserved space - starts below header so profile dropdown displays properly */}
          <aside className="hidden lg:block w-56 xl:w-64 shrink-0 pr-4 lg:pr-6 pt-8">
            <div className="sticky top-24 h-48 rounded-xl border border-dashed border-slate-200 bg-slate-50/50" aria-hidden="true" />
          </aside>
        </div>
      </div>
    </div>
  );
}

export default function WallPage() {
  return (
    <ProtectedRoute>
      <WallPageContent />
    </ProtectedRoute>
  );
}
