'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ShoppingCart, Minus, Plus, Trash2, ArrowRight, Package } from 'lucide-react';
import { cartAPI, getImageUrl } from '@/lib/api';
import { invalidateCartStoresCache, useCartAndStores } from '@/lib/useCartAndStores';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import { AppSidebar, AppSidebarMenuButton } from '@/components/AppSidebar';
import { ProfileDropdown } from '@/components/ProfileDropdown';

interface CartItem {
  productId: string;
  qty: number;
  resellerId?: string;
  product: {
    _id: string;
    title: string;
    slug: string;
    images: string[];
    price: number;
    currency: string;
    stock: number;
  };
  lineTotal: number;
}

function formatPrice(price: number, currency: string) {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: currency || 'ZAR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);
}

function CartPageContent() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const { cartCount, hasStore } = useCartAndStores(!!user);

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  const loadCart = () => {
    cartAPI
      .get()
      .then((res) => {
        const data = res.data?.data ?? res.data;
        setItems(Array.isArray(data?.items) ? data.items : []);
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadCart();
  }, []);

  const updateQty = (productId: string, newQty: number) => {
    if (newQty < 1) return;
    setUpdating(productId);
    cartAPI
      .updateItem(productId, newQty)
      .then(() => { invalidateCartStoresCache(); loadCart(); })
      .finally(() => setUpdating(null));
  };

  const remove = (productId: string) => {
    setUpdating(productId);
    cartAPI
      .removeItem(productId)
      .then(() => { invalidateCartStoresCache(); loadCart(); })
      .finally(() => setUpdating(null));
  };

  const subtotal = items.reduce((sum, i) => sum + i.lineTotal, 0);

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
          <main className="flex-1 min-w-0 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 mb-8">
            <div className="h-12 w-12 rounded-2xl bg-blue-100 border border-blue-200 flex items-center justify-center">
              <ShoppingCart className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Your cart</h1>
              <p className="text-slate-600">Review items and proceed to checkout</p>
            </div>
          </div>

          {loading ? (
            <div className="bg-white/90 rounded-2xl border border-slate-100 p-8 animate-pulse">
              <div className="h-24 bg-slate-100 rounded-xl mb-4" />
              <div className="h-24 bg-slate-100 rounded-xl mb-4" />
            </div>
          ) : items.length === 0 ? (
            <div className="bg-white/90 backdrop-blur rounded-2xl border border-slate-100 p-12 text-center">
              <Package className="h-16 w-16 text-slate-300 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-slate-700 mb-2">Cart is empty</h2>
              <p className="text-slate-600 mb-6">Add products from the marketplace to get started.</p>
              <Link
                href="/marketplace"
                className="inline-flex items-center gap-2 bg-sky-600 text-white px-6 py-3 rounded-xl hover:bg-sky-700 font-medium"
              >
                Browse marketplace
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ) : (
            <>
              <div className="space-y-4 mb-8">
                {items.map((item) => (
                  <div
                    key={item.productId}
                    className="bg-white/90 backdrop-blur rounded-2xl border border-slate-100 p-4 flex gap-4 items-center"
                  >
                    <div className="w-20 h-20 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 overflow-hidden">
                      {item.product?.images?.[0] ? (
                        <img src={getImageUrl(item.product.images[0])} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <Package className="h-8 w-8 text-slate-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <Link
                        href={`/marketplace/product/${item.productId}`}
                        className="font-semibold text-slate-900 hover:text-sky-600 truncate block"
                      >
                        {item.product?.title ?? 'Product'}
                      </Link>
                      <p className="text-sky-600 font-medium">{formatPrice(item.product?.price ?? 0, item.product?.currency ?? 'ZAR')} each</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => updateQty(item.productId, Math.max(1, item.qty - 1))}
                        disabled={updating === item.productId || item.qty <= 1}
                        className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-50"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="w-8 text-center font-medium">{item.qty}</span>
                      <button
                        type="button"
                        onClick={() => updateQty(item.productId, item.qty + 1)}
                        disabled={updating === item.productId || (item.product?.stock != null && item.qty >= item.product.stock)}
                        className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-50"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                    <p className="font-semibold text-slate-900 w-24 text-right">
                      {formatPrice(item.lineTotal, item.product?.currency ?? 'ZAR')}
                    </p>
                    <button
                      type="button"
                      onClick={() => remove(item.productId)}
                      disabled={updating === item.productId}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                      aria-label="Remove"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="bg-white/90 backdrop-blur rounded-2xl border border-slate-100 p-6 flex flex-col sm:flex-row justify-between items-center gap-4">
                <p className="text-slate-600">
                  Subtotal ({items.length} item{items.length !== 1 ? 's' : ''}):{' '}
                  <span className="font-bold text-slate-900">{formatPrice(subtotal, 'ZAR')}</span>
                </p>
                <Link
                  href="/checkout"
                  className="inline-flex items-center gap-2 bg-sky-600 text-white px-6 py-3 rounded-xl hover:bg-sky-700 font-medium"
                >
                  Proceed to checkout
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </>
          )}
          </main>
          <aside className="hidden lg:block w-56 xl:w-64 shrink-0 pr-4 lg:pr-6 pt-8">
            <div className="sticky top-24 h-48 rounded-xl border border-dashed border-slate-200 bg-slate-50/50" aria-hidden="true" />
          </aside>
        </div>
      </div>
    </div>
  );
}

export default function CartPage() {
  return (
    <ProtectedRoute>
      <CartPageContent />
    </ProtectedRoute>
  );
}
