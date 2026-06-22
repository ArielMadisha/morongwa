'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import { storesAPI, resellerAPI, suppliersAPI, cartAPI, getEffectivePrice } from '@/lib/api';
import Link from 'next/link';
import { Loader2, Package, Plus, Store, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { AppSidebar, AppSidebarMenuButton } from '@/components/AppSidebar';
import { SearchButton } from '@/components/SearchButton';
import { ProfileHeaderButton } from '@/components/ProfileHeaderButton';
import { useCartAndStores, invalidateCartStoresCache } from '@/lib/useCartAndStores';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import StoreHeader from '@/components/StoreHeader';
import { StorefrontProductCard } from '@/components/StorefrontProductCard';
import { formatCatalogProductPrice } from '@/lib/productPriceZar';
import { WALL_EXPECT_REFRESH_KEY } from '@/lib/wallRefresh';
import { useCurrency } from '@/contexts/CurrencyContext';
import { resellerMarkupBoundsForProductCategories } from '@/lib/marketplaceCategoryMarkups';

function productQtyMapFromCartResponse(res: { data?: { data?: { items?: unknown[] } } }): Record<string, number> {
  const items = Array.isArray(res.data?.data?.items) ? res.data!.data!.items! : [];
  const m: Record<string, number> = {};
  for (const it of items) {
    const row = it as {
      type?: string;
      songId?: unknown;
      productId?: { _id?: string } | string;
      product?: { _id?: string };
      qty?: number;
    };
    if (row.type === 'music' || row.songId) continue;
    const pid = String(row.product?._id ?? (row.productId as { _id?: string } | undefined)?._id ?? row.productId ?? '');
    if (!pid) continue;
    m[pid] = Number(row.qty ?? 0);
  }
  return m;
}

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
  product: { _id: string; title: string; slug: string; images: string[]; price: number; currency: string; discountPrice?: number; categories?: string[] };
  resellerCommissionPct?: number;
  addedAt: string;
}

export default function MyStorePage() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const { cartCount, hasStore, invalidate } = useCartAndStores(!!user);
  const [menuOpen, setMenuOpen] = useState(false);
  const [cartQtyByProduct, setCartQtyByProduct] = useState<Record<string, number>>({});
  const [stores, setStores] = useState<MyStore[]>([]);
  const [wallProducts, setWallProducts] = useState<WallProduct[]>([]);
  const [supplierProducts, setSupplierProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', address: '', email: '', cellphone: '', whatsapp: '' });
  const [saving, setSaving] = useState(false);
  const { rates } = useCurrency();
  const handleLogout = () => {
    logout();
    router.push('/');
  };

  const authUserId =
    user?._id != null ? String(user._id) : user?.id != null ? String(user.id) : '';

  const storeLoginHref = `/login?returnTo=${encodeURIComponent('/store')}`;

  const refreshCartQty = useCallback(() => {
    if (!user) {
      setCartQtyByProduct({});
      return;
    }
    cartAPI
      .get()
      .then((res) => setCartQtyByProduct(productQtyMapFromCartResponse(res)))
      .catch(() => setCartQtyByProduct({}));
  }, [user]);

  const handleCartUpdated = useCallback(() => {
    invalidate();
    refreshCartQty();
  }, [invalidate, refreshCartQty]);

  useEffect(() => {
    refreshCartQty();
  }, [refreshCartQty]);

  const [refreshingWall, setRefreshingWall] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const fetchStores = useCallback(async () => {
    try {
      const res = await storesAPI.getMyStores();
      const list = res.data?.data ?? res.data ?? [];
      setStores(Array.isArray(list) ? list : []);
    } catch {
      toast.error('Failed to load your stores');
      setStores([]);
    }
  }, []);

  const fetchWall = useCallback(async () => {
    try {
      const res = await resellerAPI.getMyWall();
      const data = res.data?.data ?? res.data;
      const products = data?.products ?? [];
      setWallProducts(Array.isArray(products) ? products : []);
    } catch (e: unknown) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      console.warn('[MyStore] reseller wall/me failed', status);
      setWallProducts([]);
      if (status && status !== 401) {
        toast.error('Could not load your resell products. Tap refresh or try again.');
      }
    }
  }, []);

  const fetchSupplierProducts = useCallback(async () => {
    try {
      const res = await suppliersAPI.getMyProducts();
      const list = res.data?.data ?? res.data ?? [];
      setSupplierProducts(Array.isArray(list) ? list : []);
    } catch {
      setSupplierProducts([]);
    }
  }, []);

  // Load (and reload) when the authenticated user id is known — avoids an empty wall from a race
  // where this page mounted before auth/token was fully ready (recurring empty My Store).
  useEffect(() => {
    if (!authUserId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchStores(), fetchWall(), fetchSupplierProducts()]).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [authUserId, fetchStores, fetchWall, fetchSupplierProducts]);

  // After add-to-wall, wall/me can briefly lag (replica / timing) — retry a few times.
  useEffect(() => {
    if (!authUserId || typeof window === 'undefined') return;
    if (sessionStorage.getItem(WALL_EXPECT_REFRESH_KEY) !== '1') return;
    sessionStorage.removeItem(WALL_EXPECT_REFRESH_KEY);
    const t1 = setTimeout(() => void fetchWall(), 400);
    const t2 = setTimeout(() => void fetchWall(), 1100);
    const t3 = setTimeout(() => void fetchWall(), 2600);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [authUserId, fetchWall]);

  // Refetch when tab becomes visible (e.g. returning from adding a product)
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void Promise.all([fetchWall(), fetchStores(), fetchSupplierProducts()]);
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [fetchWall, fetchStores, fetchSupplierProducts]);

  // bfcache restore (browser back) can show stale empty wall
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted && authUserId) {
        void Promise.all([fetchWall(), fetchStores(), fetchSupplierProducts()]);
      }
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, [authUserId, fetchWall, fetchStores, fetchSupplierProducts]);

  // Only redirect after both stores and wall have loaded; if the user has wall products (resell), stay on MyStore.
  useEffect(() => {
    if (loading) return;
    const hasWallItems = wallProducts.length > 0;
    if (stores.length === 0 && !hasWallItems) {
      router.replace('/marketplace');
    }
  }, [loading, stores.length, wallProducts.length, router]);

  const refreshAll = async () => {
    setRefreshingWall(true);
    invalidateCartStoresCache();
    await Promise.all([fetchStores(), fetchWall(), fetchSupplierProducts()]);
    setRefreshingWall(false);
    toast.success('Refreshed');
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
  const formatStorePrice = (amount: number, sourceCurrency: string) =>
    formatCatalogProductPrice(amount, sourceCurrency || 'ZAR', rates);

  const handleMainWheelCapture: React.WheelEventHandler<HTMLElement> = (e) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
    const scroller = scrollContainerRef.current;
    if (!scroller) return;
    if (scroller.scrollHeight <= scroller.clientHeight) return;
    scroller.scrollTop += e.deltaY;
    e.preventDefault();
  };

  return (
    <ProtectedRoute>
      <div className="h-[100dvh] min-h-screen flex flex-col overflow-hidden bg-gradient-to-br from-sky-50 via-blue-50 to-white text-slate-900">
        {/* Full-width frozen header - same as QwertyHub */}
        <header className="sticky top-0 z-40 w-full bg-white/95 backdrop-blur-md border-b border-slate-100 shadow-sm flex-shrink-0">
          <div className="px-4 sm:px-6 lg:px-8 py-3 sm:py-4">
            <div className="flex items-center justify-between gap-3 sm:gap-4 min-w-0">
              <Link href="/wall" className="shrink-0 flex items-center" aria-label="Home">
                <img src="/qwertymates-logo-icon.png" alt="Qwertymates" className="h-11 w-11 sm:h-12 sm:w-12 object-contain lg:hidden shrink-0" />
                <img src="/qwertymates-logo.png" alt="Qwertymates" className="h-9 w-auto object-contain hidden lg:block" />
              </Link>
              <AppSidebarMenuButton onClick={() => setMenuOpen((v) => !v)} />
              <div className="flex items-center gap-2 min-w-0 shrink-0">
                <div className="h-8 w-8 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
                  <Store className="h-4 w-4 text-brand-600" />
                </div>
                <h1 className="text-base sm:text-lg font-semibold text-slate-900 truncate">My Store</h1>
              </div>
              <div className="flex-1 min-w-0" />
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={refreshAll}
                disabled={refreshingWall}
                className="p-2 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
                title="Refresh store"
              >
                <RefreshCw className={`h-5 w-5 ${refreshingWall ? 'animate-spin' : ''}`} />
              </button>
              <SearchButton />
              <ProfileHeaderButton />
            </div>
            </div>
          </div>
        </header>

        <div className="flex min-h-0 min-w-0 w-full flex-1">
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
          <div
            ref={scrollContainerRef}
            className="flex-1 flex flex-col min-w-0 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain touch-pan-y"
          >
            {!loading && stores.length > 0 ? (
              <>
                {/* When user has both supplier and reseller stores, show single unified header (prefer supplier store) */}
                {(() => {
                  const supplierStore = stores.find((s) => s.type === 'supplier');
                  const resellerStore = stores.find((s) => s.type === 'reseller');
                  const displayStores = supplierStore && resellerStore
                    ? [{ ...supplierStore, _merged: true }]
                    : stores;
                  return displayStores.map((store) => (
                  <div key={store._id}>
                    <StoreHeader
                      title={store.name}
                      address={store.address || 'Enter address'}
                      phone={store.cellphone || store.whatsapp || '—'}
                      email={store.email || '—'}
                      storeSlug={store.slug}
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
                ));
                })()}
              </>
            ) : null}
            <main onWheelCapture={handleMainWheelCapture} className="flex-1 px-4 sm:px-6 lg:px-8 py-8 pb-24 md:pb-8 min-h-0">
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
                /** Show QwertyHub resell grid if we have products on the wall, even if /stores/me is slow or missing the reseller row. */
                const showResellerHub = hasResellerStore || validWallProducts.length > 0;

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
                            <StorefrontProductCard
                              key={p._id}
                              productId={String(p._id)}
                              title={p.title}
                              image={p.images?.[0]}
                              priceLabel={formatStorePrice(price, p.currency || 'ZAR')}
                              productHref={`/marketplace/product/${p._id}`}
                              resellHref={p.allowResell ? `/marketplace/product/${p._id}?view=resell` : undefined}
                              allowResell={!!p.allowResell}
                              outOfStock={!!isOutOfStock}
                              cartQty={cartQtyByProduct[String(p._id)] ?? 0}
                              isGuest={false}
                              loginHref={storeLoginHref}
                              onCartUpdated={handleCartUpdated}
                              colorsRequired={Array.isArray((p as { colors?: unknown[] }).colors) && (p as { colors: unknown[] }).colors.length > 0}
                            />
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
                    {showResellerHub && (
                      <>
                        {validWallProducts.length > 0 ? (
                          <div className={showSupplierProducts ? 'mt-10' : ''}>
                            {showSupplierProducts && <h3 className="text-lg font-semibold text-slate-800 mb-4">Products from QwertyHub</h3>}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                              {validWallProducts.map((wp) => {
                          const p = wp.product!;
                          const fb = resellerMarkupBoundsForProductCategories(p.categories ?? []);
                          const markup = wp.resellerCommissionPct ?? fb.defaultPct;
                          const basePrice = getEffectivePrice(p);
                          const resellerPrice = Math.round(basePrice * (1 + markup / 100) * 100) / 100;
                          const rowKey = typeof wp.productId === 'string' ? wp.productId : String((wp.productId as { _id?: string })?._id ?? p._id);
                          const productHref = authUserId
                            ? `/marketplace/product/${p._id}?resellerId=${authUserId}&resellerCommissionPct=${markup}`
                            : `/marketplace/product/${p._id}`;
                          const isOutOfStock = !!(p as { outOfStock?: boolean }).outOfStock || (p.stock != null && p.stock < 1);
                          return (
                            <StorefrontProductCard
                              key={rowKey}
                              productId={String(p._id)}
                              title={p.title}
                              image={p.images?.[0]}
                              priceLabel={formatStorePrice(resellerPrice, p.currency || 'ZAR')}
                              productHref={productHref}
                              outOfStock={isOutOfStock}
                              resellerId={authUserId || undefined}
                              cartQty={cartQtyByProduct[String(p._id)] ?? 0}
                              isGuest={false}
                              loginHref={storeLoginHref}
                              onCartUpdated={handleCartUpdated}
                              colorsRequired={Array.isArray((p as { colors?: unknown[] }).colors) && (p as { colors: unknown[] }).colors.length > 0}
                            />
                          );
                        })}
                            </div>
                          </div>
                        ) : (
                          <div className={`rounded-xl border-2 border-dashed border-slate-200 bg-white/70 backdrop-blur-sm p-10 text-center shadow-sm ${showSupplierProducts ? 'mt-10' : ''}`}>
                            <div className="h-12 w-12 rounded-xl bg-brand-50 text-brand-600 grid place-items-center mx-auto mb-4">
                              <Package className="h-6 w-6" />
                            </div>
                            <h3 className="text-slate-800 font-semibold text-lg">No products from QwertyHub yet</h3>
                            <p className="text-slate-500 mt-1">Add products from QwertyHub to your store to resell them.</p>
                            <Link href="/marketplace" className="inline-block mt-6 px-5 py-2.5 rounded-lg bg-brand-500 text-white font-medium hover:bg-brand-600 shadow-sm">
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
