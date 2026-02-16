'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import { storesAPI, resellerAPI, getImageUrl, getEffectivePrice } from '@/lib/api';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { AppSidebar, AppSidebarMenuButton } from '@/components/AppSidebar';
import { ProfileDropdown } from '@/components/ProfileDropdown';
import { useCartAndStores } from '@/lib/useCartAndStores';

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
  }, []);

  // Refetch when tab becomes visible (e.g. returning from adding a product)
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchWall();
        fetchStores();
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
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-amber-50/20 to-sky-50 text-slate-800 flex">
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
          <header className="flex-shrink-0">
            {!loading && stores.length > 0 ? (
              <>
                {stores.map((store) => (
                  <div
                    key={store._id}
                    className="px-4 sm:px-6 lg:px-8 py-3 bg-gradient-to-r from-sky-600 via-sky-500 to-sky-600"
                  >
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-x-4">
                        <AppSidebarMenuButton onClick={() => setMenuOpen(true)} />
                        <div className="flex-1 flex flex-col items-center text-center">
                          <h2 className="text-xl font-bold text-white drop-shadow-sm">{store.name}</h2>
                          <p className="text-sm text-white/90 mt-0.5">{store.address || 'Enter address'}</p>
                          <div className="flex flex-wrap justify-center gap-x-6 gap-y-1 mt-1 text-sm text-white/95">
                            <span>Contact No: {store.cellphone || store.whatsapp || '—'}</span>
                            <span>Email Address: {store.email || '—'}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => editingId === store._id ? (cancelEdit(), undefined) : startEdit(store)}
                          className="rounded-lg bg-white/95 border-0 px-2.5 py-1 text-sm font-medium text-sky-700 hover:bg-white shadow-sm"
                        >
                          {editingId === store._id ? 'Cancel' : 'Edit'}
                        </button>
                        <ProfileDropdown userName={user?.name} className="!bg-white/20 !text-white hover:!bg-white/30" />
                        </div>
                      </div>
                    </div>
                    {editingId === store._id && (
                      <div className="mt-3 pt-3 border-t border-white/30">
                        <div className="flex flex-col sm:flex-row flex-wrap gap-4 items-stretch max-w-xl mx-auto">
                          <div className="flex-1 min-w-[200px]">
                            <label className="block text-xs text-white/80 mb-0.5">Store name</label>
                            <input
                              type="text"
                              value={editForm.name}
                              onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                              className="rounded border-0 px-2 py-1.5 text-sm w-full"
                              placeholder="Store name"
                            />
                          </div>
                          <div className="flex-1 min-w-[200px]">
                            <label className="block text-xs text-white/80 mb-0.5">Address</label>
                            <input
                              type="text"
                              value={editForm.address}
                              onChange={(e) => setEditForm((f) => ({ ...f, address: e.target.value }))}
                              className="rounded border-0 px-2 py-1.5 text-sm w-full"
                              placeholder="Enter address"
                            />
                          </div>
                          <div className="flex gap-4 flex-wrap">
                            <div className="flex-1 min-w-[140px]">
                              <label className="block text-xs text-white/80 mb-0.5">Contact No</label>
                              <input
                                type="tel"
                                value={editForm.cellphone}
                                onChange={(e) => setEditForm((f) => ({ ...f, cellphone: e.target.value }))}
                                className="rounded border-0 px-2 py-1.5 text-sm w-full"
                                placeholder="+27..."
                              />
                            </div>
                            <div className="flex-1 min-w-[180px]">
                              <label className="block text-xs text-white/80 mb-0.5">Email Address</label>
                              <input
                                type="email"
                                value={editForm.email}
                                onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                                className="rounded border-0 px-2 py-1.5 text-sm w-full"
                                placeholder="Email"
                              />
                            </div>
                          </div>
                          <div className="flex items-end">
                            <button type="button" onClick={saveStore} disabled={saving} className="rounded-lg bg-white text-sky-700 px-3 py-1.5 text-sm font-medium hover:bg-white/90 disabled:opacity-50">
                              {saving ? <Loader2 className="h-4 w-4 animate-spin inline" /> : null} Save
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </>
            ) : (
              <div className="bg-white/85 backdrop-blur-md border-b border-slate-100 px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between gap-4">
                <AppSidebarMenuButton onClick={() => setMenuOpen(true)} />
                <ProfileDropdown userName={user?.name} className="ml-auto" />
              </div>
            )}
          </header>
          <main className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="max-w-6xl mx-auto">
              {loading ? (
                <div className="flex justify-center py-16">
                  <Loader2 className="h-10 w-10 animate-spin text-sky-600" />
                </div>
              ) : stores.length === 0 ? (
                <p className="text-center text-slate-600 py-8">Redirecting to products…</p>
              ) : wallProducts.length > 0 ? (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {wallProducts.map((wp) => {
                          const p = wp.product;
                          if (!p) return null;
                          const markup = wp.resellerCommissionPct ?? 5;
                          const basePrice = getEffectivePrice(p);
                          const resellerPrice = Math.round(basePrice * (1 + markup / 100) * 100) / 100;
                          return (
                            <Link key={wp.productId} href={`/marketplace/product/${p._id}`} className="group flex flex-col rounded-xl border border-slate-200 overflow-hidden bg-white hover:shadow-lg hover:border-sky-200 transition-all duration-200">
                              <div className="aspect-square bg-slate-100 overflow-hidden">
                                {p.images?.[0] ? (
                                  <img src={getImageUrl(p.images[0])} alt="" className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-200" />
                                ) : (
                                  <div className="h-full w-full flex items-center justify-center text-slate-400 text-sm">No image</div>
                                )}
                              </div>
                              <div className="p-4 flex-1 flex flex-col">
                                <p className="font-medium text-slate-900 line-clamp-2 group-hover:text-sky-700 transition-colors">{p.title}</p>
                                <p className="text-base text-sky-600 font-semibold mt-2">
                                  {new Intl.NumberFormat('en-ZA', { style: 'currency', currency: p.currency || 'ZAR' }).format(resellerPrice)}
                                </p>
                              </div>
                            </Link>
                          );
                  })}
                </div>
              ) : null}
            </div>
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
