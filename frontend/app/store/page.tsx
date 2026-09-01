'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import { storesAPI, resellerAPI, suppliersAPI, cartAPI, getEffectivePrice } from '@/lib/api';
import Link from 'next/link';
import { ChevronDown, ClipboardList, Loader2, Package, Plus, Store, RefreshCw } from 'lucide-react';
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
import {
  STORE_VERTICAL_OPTIONS,
  STORE_VERTICAL_STORAGE_KEY,
  StoreVertical,
  inferStoreVertical,
  normalizeStoreVertical,
  productMatchesStoreVertical,
  storeVerticalLabel,
} from '@/lib/storeVertical';

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

function supplierIdOf(store: MyStore): string {
  const sid = store.supplierId as { _id?: string } | string | undefined;
  if (!sid) return '';
  if (typeof sid === 'string') return sid;
  return sid._id ? String(sid._id) : '';
}

interface MyStore {
  _id: string;
  name: string;
  slug: string;
  type: string;
  vertical?: string;
  supplierId?: { _id?: string; storeName?: string; status?: string } | string;
  address?: string;
  email?: string;
  cellphone?: string;
  whatsapp?: string;
  stripBackgroundPic?: string;
}

interface WallProduct {
  productId: string;
  product: {
    _id: string;
    title: string;
    slug: string;
    images: string[];
    price: number;
    currency: string;
    discountPrice?: number;
    categories?: string[];
    stock?: number;
    outOfStock?: boolean;
    colors?: unknown[];
  };
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
  const [selectedVertical, setSelectedVertical] = useState<StoreVertical>('essentials');
  const { rates } = useCurrency();
  const handleLogout = () => {
    logout();
    router.push('/');
  };

  const authUserId =
    user?._id != null ? String(user._id) : user?.id != null ? String(user.id) : '';

  const storeLoginHref = `/login?returnTo=${encodeURIComponent('/store')}`;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = sessionStorage.getItem(STORE_VERTICAL_STORAGE_KEY);
    if (saved) setSelectedVertical(normalizeStoreVertical(saved));
  }, []);

  const setVertical = useCallback((v: StoreVertical) => {
    setSelectedVertical(v);
    if (typeof window !== 'undefined') sessionStorage.setItem(STORE_VERTICAL_STORAGE_KEY, v);
  }, []);

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

  const supplierStores = useMemo(() => stores.filter((s) => s.type === 'supplier'), [stores]);
  const resellerStore = useMemo(() => stores.find((s) => s.type === 'reseller') || null, [stores]);

  const activeSupplierStore = useMemo(() => {
    if (selectedVertical === 'essentials' && !supplierStores.length) return null;
    const exact = supplierStores.find((s) => normalizeStoreVertical(s.vertical) === selectedVertical);
    if (exact) return exact;
    if (supplierStores.length === 1) return supplierStores[0];
    const inferred = supplierStores.find(
      (s) =>
        inferStoreVertical({
          vertical: s.vertical,
          type: s.type,
          products: [],
        }) === selectedVertical
    );
    return inferred || null;
  }, [selectedVertical, supplierStores]);

  const activeSupplierId = activeSupplierStore ? supplierIdOf(activeSupplierStore) : '';

  const fetchSupplierProducts = useCallback(async (supplierId?: string) => {
    try {
      const res = await suppliersAPI.getMyProducts(supplierId || undefined);
      const list = res.data?.data ?? res.data ?? [];
      setSupplierProducts(Array.isArray(list) ? list : []);
    } catch {
      setSupplierProducts([]);
    }
  }, []);

  // Prefer a vertical that actually has a dedicated store / food catalog on first load.
  useEffect(() => {
    if (!stores.length) return;
    if (typeof window !== 'undefined' && sessionStorage.getItem(STORE_VERTICAL_STORAGE_KEY)) return;
    const restaurantStore = supplierStores.find((s) => normalizeStoreVertical(s.vertical) === 'restaurant');
    const groceryStore = supplierStores.find((s) => normalizeStoreVertical(s.vertical) === 'grocery');
    if (restaurantStore) setVertical('restaurant');
    else if (groceryStore) setVertical('grocery');
    else if (resellerStore && !supplierStores.length) setVertical('essentials');
  }, [stores, supplierStores, resellerStore, setVertical]);

  useEffect(() => {
    if (!authUserId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchStores(), fetchWall()]).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [authUserId, fetchStores, fetchWall]);

  useEffect(() => {
    if (!authUserId) return;
    void fetchSupplierProducts(activeSupplierId || undefined);
  }, [authUserId, activeSupplierId, fetchSupplierProducts, selectedVertical]);

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

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void Promise.all([fetchWall(), fetchStores(), fetchSupplierProducts(activeSupplierId || undefined)]);
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [fetchWall, fetchStores, fetchSupplierProducts, activeSupplierId]);

  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted && authUserId) {
        void Promise.all([fetchWall(), fetchStores(), fetchSupplierProducts(activeSupplierId || undefined)]);
      }
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, [authUserId, fetchWall, fetchStores, fetchSupplierProducts, activeSupplierId]);

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
    await Promise.all([fetchStores(), fetchWall(), fetchSupplierProducts(activeSupplierId || undefined)]);
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

  const filteredSupplierProducts = useMemo(
    () =>
      supplierProducts.filter((p) =>
        productMatchesStoreVertical(
          { categories: p.categories, tags: p.tags },
          selectedVertical
        )
      ),
    [supplierProducts, selectedVertical]
  );

  const validWallProducts = useMemo(
    () => wallProducts.filter((wp) => wp.product),
    [wallProducts]
  );

  const showSupplierSection =
    selectedVertical !== 'essentials'
      ? true
      : supplierStores.some((s) => normalizeStoreVertical(s.vertical) === 'essentials') ||
        (!supplierStores.some((s) => ['restaurant', 'grocery'].includes(normalizeStoreVertical(s.vertical))) &&
          supplierStores.length > 0);

  const showResellerHub = selectedVertical === 'essentials' && (!!resellerStore || validWallProducts.length > 0);

  const headerStore: MyStore | null =
    selectedVertical === 'essentials' && !activeSupplierStore && resellerStore
      ? resellerStore
      : activeSupplierStore || resellerStore || stores[0] || null;

  const dropdownOptions = STORE_VERTICAL_OPTIONS.map((opt) => {
    const match =
      opt.value === 'essentials' && !supplierStores.find((s) => normalizeStoreVertical(s.vertical) === 'essentials')
        ? resellerStore
        : supplierStores.find((s) => normalizeStoreVertical(s.vertical) === opt.value) ||
          (supplierStores.length === 1 &&
          inferStoreVertical({
            vertical: supplierStores[0].vertical,
            type: 'supplier',
            products: supplierProducts,
          }) === opt.value
            ? supplierStores[0]
            : null);
    const name = match?.name;
    return {
      value: opt.value,
      label: name && name.trim() ? `${opt.label} — ${name}` : opt.label,
    };
  });

  return (
    <ProtectedRoute>
      <div className="h-[100dvh] min-h-screen flex flex-col overflow-hidden bg-gradient-to-br from-sky-50 via-blue-50 to-white text-slate-900">
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
                <label className="relative inline-flex items-center min-w-0">
                  <span className="sr-only">Select store type</span>
                  <select
                    value={selectedVertical}
                    onChange={(e) => setVertical(normalizeStoreVertical(e.target.value))}
                    className="appearance-none max-w-[11rem] sm:max-w-[16rem] truncate rounded-lg border border-slate-200 bg-white pl-2.5 pr-8 py-1.5 text-sm font-medium text-slate-800 shadow-sm hover:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
                    aria-label="Select Restaurant, Grocery, or Essentials store"
                  >
                    {dropdownOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2 h-4 w-4 text-slate-500" aria-hidden />
                </label>
              </div>
              <div className="flex-1 min-w-0" />
              <div className="flex items-center gap-2 shrink-0">
                <Link
                  href="/store/orders"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-xs font-semibold text-sky-800 hover:bg-sky-100"
                  title="Shop Orders"
                >
                  <ClipboardList className="h-4 w-4" />
                  <span className="hidden sm:inline">Shop Orders</span>
                </Link>
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
            {!loading && headerStore ? (
              <div>
                <StoreHeader
                  title={`${headerStore.name} · ${storeVerticalLabel(selectedVertical)}`}
                  address={headerStore.address || 'Enter address'}
                  phone={headerStore.cellphone || headerStore.whatsapp || '—'}
                  email={headerStore.email || '—'}
                  storeSlug={headerStore.slug}
                  isEditing={editingId === headerStore._id}
                  onEdit={() =>
                    editingId === headerStore._id ? cancelEdit() : startEdit(headerStore)
                  }
                />
                {editingId === headerStore._id && (
                  <div className="mt-4 mx-4 sm:mx-6 lg:mx-8 p-4 rounded-xl bg-white/95 backdrop-blur-sm border border-slate-200 shadow-sm">
                    <div className="flex flex-col sm:flex-row flex-wrap gap-4 items-stretch max-w-xl">
                      <div className="flex-1 min-w-[200px]">
                        <label className="block text-xs text-slate-600 font-medium mb-1">Store name</label>
                        <input
                          type="text"
                          value={editForm.name}
                          onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                          className="rounded-lg border border-slate-200 px-3 py-2 text-sm w-full focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                          placeholder="Store name"
                        />
                      </div>
                      <div className="flex-1 min-w-[200px]">
                        <label className="block text-xs text-slate-600 font-medium mb-1">Address</label>
                        <input
                          type="text"
                          value={editForm.address}
                          onChange={(e) => setEditForm((f) => ({ ...f, address: e.target.value }))}
                          className="rounded-lg border border-slate-200 px-3 py-2 text-sm w-full focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                          placeholder="Enter address"
                        />
                      </div>
                      <div className="flex gap-4 flex-wrap flex-1">
                        <div className="flex-1 min-w-[140px]">
                          <label className="block text-xs text-slate-600 font-medium mb-1">Contact No</label>
                          <input
                            type="tel"
                            value={editForm.cellphone}
                            onChange={(e) => setEditForm((f) => ({ ...f, cellphone: e.target.value }))}
                            className="rounded-lg border border-slate-200 px-3 py-2 text-sm w-full focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                            placeholder="+27..."
                          />
                        </div>
                        <div className="flex-1 min-w-[180px]">
                          <label className="block text-xs text-slate-600 font-medium mb-1">Email Address</label>
                          <input
                            type="email"
                            value={editForm.email}
                            onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
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
                          {saving ? <Loader2 className="h-4 w-4 animate-spin inline" /> : null} Save
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
            ) : null}
            <main onWheelCapture={handleMainWheelCapture} className="flex-1 px-4 sm:px-6 lg:px-8 py-8 pb-24 md:pb-8 min-h-0">
              <div className="max-w-6xl mx-auto">
                {loading ? (
                  <div className="flex justify-center py-16">
                    <Loader2 className="h-10 w-10 animate-spin text-brand-600" />
                  </div>
                ) : stores.length === 0 ? (
                  <p className="text-center text-slate-600 py-8">Redirecting to products…</p>
                ) : (
                  <>
                    {showSupplierSection && (
                      <div className="mb-6 flex items-center justify-between gap-3 flex-wrap">
                        <h3 className="text-lg font-semibold text-slate-800">
                          Your {storeVerticalLabel(selectedVertical).toLowerCase()} products
                        </h3>
                        <Link
                          href={
                            activeSupplierId
                              ? `/supplier/products?supplierId=${encodeURIComponent(activeSupplierId)}&vertical=${selectedVertical}`
                              : `/supplier/products?vertical=${selectedVertical}`
                          }
                          className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 transition shadow-sm"
                        >
                          <Plus className="h-4 w-4" /> Add product
                        </Link>
                      </div>
                    )}
                    {showSupplierSection && filteredSupplierProducts.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {filteredSupplierProducts.map((p) => {
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
                              colorsRequired={
                                Array.isArray((p as { colors?: unknown[] }).colors) &&
                                (p as { colors: unknown[] }).colors.length > 0
                              }
                            />
                          );
                        })}
                      </div>
                    ) : showSupplierSection ? (
                      <div className="rounded-xl border-2 border-dashed border-slate-200 bg-white/70 backdrop-blur-sm p-10 text-center shadow-sm">
                        <div className="h-12 w-12 rounded-xl bg-brand-50 text-brand-600 grid place-items-center mx-auto mb-4">
                          <Package className="h-6 w-6" />
                        </div>
                        <h3 className="text-slate-800 font-semibold text-lg">
                          No {storeVerticalLabel(selectedVertical).toLowerCase()} products yet
                        </h3>
                        <p className="text-slate-500 mt-1 mb-6">
                          {selectedVertical === 'restaurant'
                            ? 'Food & restaurant items stay in this store — they will not mix with Grocery or Essentials.'
                            : selectedVertical === 'grocery'
                              ? 'Grocery items stay in this store — they will not mix with Restaurant or Essentials.'
                              : 'Essentials are your default Hub goods — separate from Restaurant and Grocery.'}
                        </p>
                        <Link
                          href={
                            activeSupplierId
                              ? `/supplier/products?supplierId=${encodeURIComponent(activeSupplierId)}&vertical=${selectedVertical}`
                              : `/supplier/products?vertical=${selectedVertical}`
                          }
                          className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 transition shadow-sm"
                        >
                          <Plus className="h-4 w-4" /> Add product
                        </Link>
                      </div>
                    ) : null}
                    {showResellerHub && (
                      <>
                        {validWallProducts.length > 0 ? (
                          <div className={showSupplierSection ? 'mt-10' : ''}>
                            {showSupplierSection && (
                              <h3 className="text-lg font-semibold text-slate-800 mb-4">Products from QwertyHub</h3>
                            )}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                              {validWallProducts.map((wp) => {
                                const p = wp.product!;
                                const fb = resellerMarkupBoundsForProductCategories(p.categories ?? []);
                                const markup = wp.resellerCommissionPct ?? fb.defaultPct;
                                const basePrice = getEffectivePrice(p);
                                const resellerPrice = Math.round(basePrice * (1 + markup / 100) * 100) / 100;
                                const rowKey =
                                  typeof wp.productId === 'string'
                                    ? wp.productId
                                    : String((wp.productId as { _id?: string })?._id ?? p._id);
                                const productHref = authUserId
                                  ? `/marketplace/product/${p._id}?resellerId=${authUserId}&resellerCommissionPct=${markup}`
                                  : `/marketplace/product/${p._id}`;
                                const isOutOfStock =
                                  !!(p as { outOfStock?: boolean }).outOfStock || (p.stock != null && p.stock < 1);
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
                                    colorsRequired={
                                      Array.isArray((p as { colors?: unknown[] }).colors) &&
                                      (p as { colors: unknown[] }).colors.length > 0
                                    }
                                  />
                                );
                              })}
                            </div>
                          </div>
                        ) : (
                          <div
                            className={`rounded-xl border-2 border-dashed border-slate-200 bg-white/70 backdrop-blur-sm p-10 text-center shadow-sm ${
                              showSupplierSection ? 'mt-10' : ''
                            }`}
                          >
                            <div className="h-12 w-12 rounded-xl bg-brand-50 text-brand-600 grid place-items-center mx-auto mb-4">
                              <Package className="h-6 w-6" />
                            </div>
                            <h3 className="text-slate-800 font-semibold text-lg">No products from QwertyHub yet</h3>
                            <p className="text-slate-500 mt-1">Add products from QwertyHub to your store to resell them.</p>
                            <Link
                              href="/marketplace"
                              className="inline-block mt-6 px-5 py-2.5 rounded-lg bg-brand-500 text-white font-medium hover:bg-brand-600 shadow-sm"
                            >
                              Browse QwertyHub →
                            </Link>
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
            </main>
          </div>
        </div>
      </div>
      <MobileBottomNav cartCount={cartCount} hasStore={hasStore} />
    </ProtectedRoute>
  );
}
