'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import { storesAPI, resellerAPI, suppliersAPI, getImageUrl, getEffectivePrice } from '@/lib/api';
import Link from 'next/link';
import { Loader2, Package, Plus, Store } from 'lucide-react';
import toast from 'react-hot-toast';
import { AppSidebar, AppSidebarMenuButton } from '@/components/AppSidebar';
import { SearchButton } from '@/components/SearchButton';
import { useCartAndStores } from '@/lib/useCartAndStores';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import StoreHeader from '@/components/StoreHeader';

interface MyStore {
  _id: string;
  name: string;
  slug: string;
  type: string;
  supplierId?: { storeName?: string; status?: string };
  address?: string;
  email?: string;
  cellphone?: string;
  whatsapp?: string;
  stripBackgroundPic?: string;
}

interface WallProduct {
  productId: string;
  product: { _id: string; title: string; slug: string; images: string[]; price: number; currency: string; discountPrice?: number };
  resellerCommissionPct?: number;
  addedAt: string;
}

export default function MyStorePage() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const { cartCount, hasStore } = useCartAndStores(!!user);
  const [menuOpen, setMenuOpen] = useState(false);
  const [stores, setStores] = useState<MyStore[]>([]);
  const [wallProducts, setWallProducts] = useState<WallProduct[]>([]);
  const [supplierProducts, setSupplierProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', address: '', email: '', cellphone: '', whatsapp: '' });
  const [saving, setSaving] = useState(false);
  const handleLogout = () => {
    logout();
    router.push('/');
  };

  useEffect(() => {
    fetchStores();
    fetchWall();
    fetchSupplierProducts();
  }, []);

  // Refetch when tab becomes visible (e.g. returning from adding a product)
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchWall();
        fetchStores();
        fetchSupplierProducts();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  // No store = redirect to marketplace; store is only created when user resells a product
  useEffect(() => {
    if (!loading && stores.length === 0) {
      router.replace('/marketplace');
    }
  }, [loading, stores.length, router]);

  const fetchStores = async () => {
    try {
      const res = await storesAPI.getMyStores();
      const list = res.data?.data ?? res.data ?? [];
      setStores(Array.isArray(list) ? list : []);
    } catch {
      toast.error('Failed to load your stores');
      setStores([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchWall = async () => {
    try {
      const res = await resellerAPI.getMyWall();
      const data = res.data?.data ?? res.data;
      const products = data?.products ?? [];
      setWallProducts(Array.isArray(products) ? products : []);
    } catch {
      setWallProducts([]);
    }
  };

  const fetchSupplierProducts = async () => {
    try {
      const res = await suppliersAPI.getMyProducts();
      const list = res.data?.data ?? res.data ?? [];
      setSupplierProducts(Array.isArray(list) ? list : []);
    } catch {
      setSupplierProducts([]);
    }
  };

  const startEdit = (store: MyStore) => {
    setEditingId(store._id);
    setEditForm({
      name: store.name,
      address: store.address ?? '',
      email: store.email ?? '',
      cellphone: store.cellphone ?? '',
      whatsapp: store.whatsapp ?? '',
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const saveStore = async () => {
    if (!editingId) return;
    setSaving(true);
    try {
      await storesAPI.updateStore(editingId, {
        name: editForm.name.trim() || undefined,
        address: editForm.address.trim() || undefined,
        email: editForm.email.trim() || undefined,
        cellphone: editForm.cellphone.trim() || undefined,
        whatsapp: editForm.whatsapp.trim() || undefined,
      });
      toast.success('Store updated');
      setEditingId(null);
      fetchStores();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to update store');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen flex flex-col bg-gradient-to-br from-sky-50 via-blue-50 to-white text-slate-900">
        {/* Full-width frozen header - same as QwertyHub */}
        <header className="sticky top-0 z-40 w-full bg-white/95 backdrop-blur-md border-b border-slate-100 shadow-sm flex-shrink-0">
          <div className="px-4 sm:px-6 lg:px-8 py-3 sm:py-4">
            <div className="flex items-center justify-between gap-3 sm:gap-4 min-w-0">
              <Link href="/wall" className="shrink-0 flex items-center" aria-label="Home">
                <img src="/qwertymates-logo-icon.png" alt="Qwertymates" className="h-9 w-9 object-contain lg:hidden" />
                <img src="/qwertymates-logo.png" alt="Qwertymates" className="h-9 w-auto object-contain hidden lg:block" />
              </Link>
              <AppSidebarMenuButton onClick={() => setMenuOpen(true)} />
              <div className="flex items-center gap-2 min-w-0 shrink-0">
                <div className="h-8 w-8 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
                  <Store className="h-4 w-4 text-brand-600" />
                </div>
                <h1 className="text-base sm:text-lg font-semibold text-slate-900 truncate">My Store</h1>
              </div>
              <div className="flex-1 min-w-0" />
              <SearchButton />
            </div>
          </div>
        </header>

        <div className="flex flex-1 min-h-0">
          <AppSidebar
            variant="wall"
            userName={user?.name}
            userAvatar={(user as any)?.avatar}
            userId={user?._id || user?.id}
            cartCount={cartCount}
            hasStore={hasStore}
            onLogout={handleLogout}
            menuOpen={menuOpen}
            setMenuOpen={setMenuOpen}
            hideLogo
            belowHeader
          />
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            {!loading && stores.length > 0 ? (
              <>
                {stores.map((store) => (
                  <div key={store._id}>
                    <StoreHeader
                      title={store.name}
                      address={store.address || 'Enter address'}
                      phone={store.cellphone || store.whatsapp || '—'}
                      email={store.email || '—'}
                      isEditing={editingId === store._id}
                      onEdit={() =>
                        editingId === store._id ? cancelEdit() : startEdit(store)
                      }
                    />
                    {editingId === store._id && (
                      <div className="mt-4 p-4 rounded-xl bg-white/95 backdrop-blur-sm border border-slate-200 shadow-sm">
                        <div className="flex flex-col sm:flex-row flex-wrap gap-4 items-stretch max-w-xl">
                          <div className="flex-1 min-w-[200px]">
                            <label className="block text-xs text-slate-600 font-medium mb-1">
                              Store name
                            </label>
                            <input
                              type="text"
                              value={editForm.name}
                              onChange={(e) =>
                                setEditForm((f) => ({ ...f, name: e.target.value }))
                              }
                              className="rounded-lg border border-slate-200 px-3 py-2 text-sm w-full focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                              placeholder="Store name"
                            />
                          </div>
                          <div className="flex-1 min-w-[200px]">
                            <label className="block text-xs text-slate-600 font-medium mb-1">
                              Address
                            </label>
                            <input
                              type="text"
                              value={editForm.address}
                              onChange={(e) =>
                                setEditForm((f) => ({ ...f, address: e.target.value }))
                              }
                              className="rounded-lg border border-slate-200 px-3 py-2 text-sm w-full focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                              placeholder="Enter address"
                            />
                          </div>
                          <div className="flex gap-4 flex-wrap flex-1">
                            <div className="flex-1 min-w-[140px]">
                              <label className="block text-xs text-slate-600 font-medium mb-1">
                                Contact No
                              </label>
                              <input
                                type="tel"
                                value={editForm.cellphone}
                                onChange={(e) =>
                                  setEditForm((f) => ({ ...f, cellphone: e.target.value }))
                                }
                                className="rounded-lg border border-slate-200 px-3 py-2 text-sm w-full focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                                placeholder="+27..."
                              />
                            </div>
                            <div className="flex-1 min-w-[180px]">
                              <label className="block text-xs text-slate-600 font-medium mb-1">
                                Email Address
                              </label>
                              <input
                                type="email"
                                value={editForm.email}
                                onChange={(e) =>
                                  setEditForm((f) => ({ ...f, email: e.target.value }))
                                }
                                className="rounded-lg border border-slate-200 px-3 py-2 text-sm w-full focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                                placeholder="Email"
                              />
                            </div>
                          </div>
                          <div className="flex items-end gap-2">
                            <button
                              type="button"
                              onClick={saveStore}
                              disabled={saving}
                              className="rounded-lg bg-brand-500 text-white px-4 py-2 text-sm font-medium hover:bg-brand-600 disabled:opacity-50"
                            >
                              {saving ? (
                                <Loader2 className="h-4 w-4 animate-spin inline" />
                              ) : null}{' '}
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={cancelEdit}
                              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </>
            ) : null}
            <main className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-8 pb-24 lg:pb-8 min-h-0">
            <div className="max-w-6xl mx-auto">
              {loading ? (
                <div className="flex justify-center py-16">
                  <Loader2 className="h-10 w-10 animate-spin text-brand-600" />
                </div>
              ) : stores.length === 0 ? (
                <p className="text-center text-slate-600 py-8">Redirecting to products…</p>
              ) : (() => {
                const hasSupplierStore = stores.some((s) => s.type === 'supplier');
                const hasResellerStore = stores.some((s) => s.type === 'reseller');
                const showSupplierProducts = hasSupplierStore;
                const validWallProducts = wallProducts.filter((wp) => wp.product);
                const showWallProducts = hasResellerStore && validWallProducts.length > 0;

                return (
                  <>
                    {showSupplierProducts && (
                      <div className="mb-6 flex items-center justify-between">
                        <h3 className="text-lg font-semibold text-slate-800">Your products</h3>
                        <Link
                          href="/supplier/products"
                          className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 transition shadow-sm"
                        >
                          <Plus className="h-4 w-4" /> Add product
                        </Link>
                      </div>
                    )}
                    {showSupplierProducts && supplierProducts.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {supplierProducts.map((p) => {
                          const price = getEffectivePrice(p);
                          const isOutOfStock = p.outOfStock || (p.stock != null && p.stock < 1);
                          return (
                            <Link key={p._id} href={`/marketplace/product/${p._id}`} className="group flex flex-col rounded-xl border border-slate-100 overflow-hidden bg-white shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
                              <div className="aspect-square bg-slate-100 overflow-hidden relative">
                                {p.images?.[0] ? (
                                  <img src={getImageUrl(p.images[0])} alt="" className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-200" />
                                ) : (
                                  <div className="h-full w-full flex items-center justify-center text-slate-400"><Package className="h-12 w-12" /></div>
                                )}
                                {isOutOfStock && <span className="absolute top-2 right-2 z-10 px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">Out of stock</span>}
                              </div>
                              <div className="p-4 flex-1 flex flex-col">
                                <p className="font-medium text-slate-800 line-clamp-2">{p.title}</p>
                                <p className="text-base text-brand-600 font-semibold mt-2">
                                  {new Intl.NumberFormat('en-ZA', { style: 'currency', currency: p.currency || 'ZAR' }).format(price)}
                                </p>
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                    ) : showSupplierProducts && supplierProducts.length === 0 ? (
                      <div className="rounded-xl border-2 border-dashed border-slate-200 bg-white/70 backdrop-blur-sm p-10 text-center shadow-sm">
                        <div className="h-12 w-12 rounded-xl bg-brand-50 text-brand-600 grid place-items-center mx-auto mb-4">
                          <Package className="h-6 w-6" />
                        </div>
                        <h3 className="text-slate-800 font-semibold text-lg">No products yet</h3>
                        <p className="text-slate-500 mt-1 mb-6">Add your first product to start selling on QwertyHub.</p>
                        <Link href="/supplier/products" className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 transition shadow-sm">
                          <Plus className="h-4 w-4" /> Add product
                        </Link>
                      </div>
                    ) : null}
                    {showWallProducts && (
                      <>
                        {hasResellerStore && validWallProducts.length > 0 && (
                          <div className={showSupplierProducts ? 'mt-10' : ''}>
                            {showSupplierProducts && <h3 className="text-lg font-semibold text-slate-800 mb-4">Products from QwertyHub</h3>}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                              {validWallProducts.map((wp) => {
                          const p = wp.product!;
                          const markup = wp.resellerCommissionPct ?? 5;
                          const basePrice = getEffectivePrice(p);
                          const resellerPrice = Math.round(basePrice * (1 + markup / 100) * 100) / 100;
                          return (
                            <Link key={wp.productId} href={`/marketplace/product/${p._id}`} className="group flex flex-col rounded-xl border border-slate-100 overflow-hidden bg-white shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
                              <div className="aspect-square bg-slate-100 overflow-hidden">
                                {p.images?.[0] ? (
                                  <img src={getImageUrl(p.images[0])} alt="" className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-200" />
                                ) : (
                                  <div className="h-full w-full flex items-center justify-center text-slate-400 text-sm">No image</div>
                                )}
                              </div>
                              <div className="p-4 flex-1 flex flex-col">
                                <p className="font-medium text-slate-800 line-clamp-2">{p.title}</p>
                                <p className="text-base text-brand-600 font-semibold mt-2">
                                  {new Intl.NumberFormat('en-ZA', { style: 'currency', currency: p.currency || 'ZAR' }).format(resellerPrice)}
                                </p>
                              </div>
                            </Link>
                          );
                        })}
                            </div>
                          </div>
                        )}
                        {hasResellerStore && validWallProducts.length === 0 && !showSupplierProducts && (
                          <div className="rounded-xl border-2 border-dashed border-slate-200 bg-white/70 backdrop-blur-sm p-10 text-center shadow-sm">
                            <div className="h-12 w-12 rounded-xl bg-brand-50 text-brand-600 grid place-items-center mx-auto mb-4">
                              <Package className="h-6 w-6" />
                            </div>
                            <h3 className="text-slate-800 font-semibold text-lg">No products yet</h3>
                            <p className="text-slate-500 mt-1">Add products from QwertyHub to your store.</p>
                            <Link href="/marketplace" className="inline-block mt-6 px-5 py-2 rounded-lg border border-slate-200 bg-white text-slate-800 hover:bg-slate-50 shadow-xs">
                              Browse QwertyHub →
                            </Link>
                          </div>
                        )}
                      </>
                    )}
                  </>
                );
              })()}
            </div>
          </main>
          </div>
        </div>
      </div>
      <MobileBottomNav cartCount={cartCount} hasStore={hasStore} />
    </ProtectedRoute>
  );
}
