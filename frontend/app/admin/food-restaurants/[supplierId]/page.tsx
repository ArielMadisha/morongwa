'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  ImagePlus,
  Loader2,
  MapPin,
  Save,
  UtensilsCrossed,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { adminAPI, getImageUrl } from '@/lib/api';
import { adminMarkupPctForCategory } from '@/lib/marketplaceCategoryMarkups';

const FOOD_CATEGORY = 'Food & Restaurant';

type FoodItem = {
  _id: string;
  title: string;
  price: number;
  images?: string[];
  tags?: string[];
  categories?: string[];
  active?: boolean;
};

type Draft = {
  title: string;
  /** Supplier / kitchen cost before markup */
  basePrice: string;
  /** Admin markup % applied on save → customer list price */
  markupPct: string;
  image?: string;
  saving?: boolean;
  uploading?: boolean;
};

type LocationForm = {
  storeId: string;
  address: string;
  mapsUrl: string;
  latitude: string;
  longitude: string;
};

function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

function listFromBase(base: number, markupPct: number) {
  if (!Number.isFinite(base) || base < 0) return 0;
  return roundMoney(base * (1 + markupPct / 100));
}

function baseFromList(list: number, markupPct: number) {
  if (!Number.isFinite(list) || list < 0) return 0;
  const den = 1 + markupPct / 100;
  if (den <= 0) return 0;
  return roundMoney(list / den);
}

function isExtra(p: FoodItem) {
  return (p.tags || []).map((t) => String(t).toLowerCase()).includes('food-extra');
}

function AdminFoodRestaurantEditor() {
  const params = useParams<{ supplierId: string }>();
  const supplierId = useMemo(() => String(params?.supplierId || ''), [params]);

  const [loading, setLoading] = useState(true);
  const [storeName, setStoreName] = useState('Restaurant');
  const [items, setItems] = useState<FoodItem[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [location, setLocation] = useState<LocationForm | null>(null);
  const [savingLocation, setSavingLocation] = useState(false);

  const defaultMarkup = adminMarkupPctForCategory(FOOD_CATEGORY);

  const load = useCallback(async () => {
    if (!supplierId) return;
    setLoading(true);
    try {
      const [prodRes, storesRes] = await Promise.all([
        adminAPI.getProducts({ supplierId, limit: 100, active: true }),
        adminAPI.getStores({ limit: 20, type: 'supplier', supplierId }),
      ]);
      const products = (prodRes.data?.products ?? []) as FoodItem[];
      const food = products.filter((p) =>
        (p.categories || []).some((c) => String(c).toLowerCase() === FOOD_CATEGORY.toLowerCase())
      );
      setItems(food);

      const nextDrafts: Record<string, Draft> = {};
      for (const p of food) {
        const mk = defaultMarkup;
        nextDrafts[p._id] = {
          title: p.title || '',
          basePrice: String(baseFromList(Number(p.price) || 0, mk)),
          markupPct: String(mk),
          image: p.images?.[0],
        };
      }
      setDrafts(nextDrafts);

      const stores = (storesRes.data?.stores ?? storesRes.data ?? []) as Array<{
        _id: string;
        name?: string;
        address?: string;
        mapsUrl?: string;
        latitude?: number;
        longitude?: number;
        supplierId?: { _id?: string; storeName?: string } | string;
      }>;
      const store = stores[0] || null;
      const supplierName =
        store && typeof store.supplierId === 'object' ? store.supplierId?.storeName : undefined;
      setStoreName(store?.name || supplierName || 'Restaurant');

      if (store) {
        setLocation({
          storeId: store._id,
          address: store.address || '',
          mapsUrl: store.mapsUrl || '',
          latitude: store.latitude != null ? String(store.latitude) : '',
          longitude: store.longitude != null ? String(store.longitude) : '',
        });
      } else {
        setLocation(null);
      }
    } catch {
      toast.error('Could not load restaurant menu');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [supplierId, defaultMarkup]);

  useEffect(() => {
    void load();
  }, [load]);

  const menuItems = useMemo(() => items.filter((p) => !isExtra(p)), [items]);
  const extras = useMemo(() => items.filter(isExtra), [items]);

  const updateDraft = (id: string, patch: Partial<Draft>) => {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  const saveItem = async (id: string) => {
    const d = drafts[id];
    if (!d) return;
    const base = Number.parseFloat(String(d.basePrice).replace(',', '.'));
    const mk = Number.parseFloat(String(d.markupPct).replace(',', '.'));
    if (!Number.isFinite(base) || base < 0) {
      toast.error('Enter a valid base price');
      return;
    }
    if (!Number.isFinite(mk) || mk < 0) {
      toast.error('Enter a valid markup %');
      return;
    }
    const listPrice = listFromBase(base, mk);
    const item = items.find((x) => x._id === id);
    updateDraft(id, { saving: true });
    try {
      await adminAPI.updateProduct(id, {
        title: d.title.trim() || undefined,
        price: listPrice,
        images: d.image ? [d.image] : [],
        categories:
          Array.isArray(item?.categories) && item!.categories!.length > 0
            ? item!.categories
            : [FOOD_CATEGORY],
        allowResell: false,
        colors: d.image ? [{ name: 'Standard', hex: '#f59e0b', imageIndex: 0 }] : undefined,
      });
      toast.success(`Saved · customer price R ${listPrice.toFixed(2)}`);
      setItems((prev) =>
        prev.map((p) =>
          p._id === id
            ? { ...p, title: d.title.trim() || p.title, price: listPrice, images: d.image ? [d.image] : [] }
            : p
        )
      );
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { error?: string; message?: string } } })?.response?.data
          ?.error ||
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Save failed';
      toast.error(String(msg));
    } finally {
      updateDraft(id, { saving: false });
    }
  };

  const uploadImage = async (id: string, file: File) => {
    updateDraft(id, { uploading: true });
    try {
      const res = await adminAPI.uploadProductImages([file]);
      const url = res.data?.urls?.[0];
      if (!url) throw new Error('No URL');
      updateDraft(id, { image: url });
      toast.success('Picture uploaded — click Save item to apply');
    } catch {
      toast.error('Image upload failed');
    } finally {
      updateDraft(id, { uploading: false });
    }
  };

  const saveLocation = async () => {
    if (!location?.storeId) {
      toast.error('No store record linked to this restaurant');
      return;
    }
    setSavingLocation(true);
    try {
      const latRaw = location.latitude.trim();
      const lngRaw = location.longitude.trim();
      await adminAPI.updateStore(location.storeId, {
        address: location.address.trim() || undefined,
        mapsUrl: location.mapsUrl.trim() || undefined,
        latitude: latRaw === '' ? null : Number(latRaw),
        longitude: lngRaw === '' ? null : Number(lngRaw),
      });
      toast.success('Pickup location saved');
    } catch {
      toast.error('Could not save location');
    } finally {
      setSavingLocation(false);
    }
  };

  const renderItemRow = (p: FoodItem) => {
    const d = drafts[p._id];
    if (!d) return null;
    const base = Number.parseFloat(String(d.basePrice).replace(',', '.'));
    const mk = Number.parseFloat(String(d.markupPct).replace(',', '.'));
    const sell =
      Number.isFinite(base) && Number.isFinite(mk) ? listFromBase(base, mk) : Number(p.price) || 0;
    return (
      <div
        key={p._id}
        className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-[96px_1fr_auto]"
      >
        <div className="relative h-24 w-24 overflow-hidden rounded-lg bg-orange-50">
          {d.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={getImageUrl(d.image) || d.image} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-slate-400">No photo</div>
          )}
          <label className="absolute inset-x-0 bottom-0 cursor-pointer bg-black/55 py-1 text-center text-[10px] font-semibold text-white">
            {d.uploading ? '…' : 'Upload'}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={!!d.uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadImage(p._id, f);
                e.target.value = '';
              }}
            />
          </label>
        </div>

        <div className="min-w-0 space-y-2">
          <input
            value={d.title}
            onChange={(e) => updateDraft(p._id, { title: e.target.value })}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-900"
          />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <label className="block text-xs text-slate-500">
              Base (R)
              <input
                value={d.basePrice}
                onChange={(e) => updateDraft(p._id, { basePrice: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm tabular-nums"
                inputMode="decimal"
              />
            </label>
            <label className="block text-xs text-slate-500">
              Markup %
              <input
                value={d.markupPct}
                onChange={(e) => updateDraft(p._id, { markupPct: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm tabular-nums"
                inputMode="decimal"
              />
            </label>
            <div className="col-span-2 sm:col-span-1">
              <p className="text-xs text-slate-500">Customer pays</p>
              <p className="mt-1 text-sm font-bold tabular-nums text-sky-700">R {sell.toFixed(2)}</p>
            </div>
          </div>
        </div>

        <div className="flex sm:flex-col gap-2 sm:justify-center">
          <button
            type="button"
            onClick={() => void saveItem(p._id)}
            disabled={!!d.saving}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
          >
            {d.saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save item
          </button>
          <Link
            href={`/admin/products/${p._id}/edit`}
            className="inline-flex items-center justify-center rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            Full editor
          </Link>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-orange-50 text-slate-800">
      <header className="border-b border-white/60 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-6">
          <div className="flex items-center gap-3 min-w-0">
            <UtensilsCrossed className="h-7 w-7 shrink-0 text-orange-600" />
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-widest text-orange-600">Food admin</p>
              <h1 className="truncate text-2xl font-bold text-slate-900">{storeName}</h1>
              <p className="text-sm text-slate-600">Edit menu, photos, markup prices, and GPS / Maps link.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/food-restaurants"
              className="inline-flex items-center gap-2 rounded-full border border-orange-100 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:shadow-md"
            >
              <ArrowLeft className="h-4 w-4" /> All restaurants
            </Link>
            <Link
              href="/admin"
              className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:shadow-md"
            >
              <ArrowLeft className="h-4 w-4" /> Back to admin
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-8 px-6 py-8">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
          </div>
        ) : (
          <>
            <section className="rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <MapPin className="h-5 w-5 text-sky-600" />
                <h2 className="text-lg font-semibold text-slate-900">Pickup location</h2>
              </div>
              {!location ? (
                <p className="text-sm text-slate-500">
                  No supplier store found for this restaurant. Create/link it under{' '}
                  <Link href="/admin/stores" className="text-sky-600 hover:underline">
                    Stores
                  </Link>
                  .
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm sm:col-span-2">
                    <span className="text-slate-600">Address / notes</span>
                    <input
                      value={location.address}
                      onChange={(e) => setLocation({ ...location, address: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                      placeholder={`Customer collection · 25°22'33.6"S 28°15'40.9"E`}
                    />
                  </label>
                  <label className="block text-sm sm:col-span-2">
                    <span className="text-slate-600">Google Maps URL</span>
                    <input
                      value={location.mapsUrl}
                      onChange={(e) => setLocation({ ...location, mapsUrl: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                      placeholder="https://maps.app.goo.gl/…"
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="text-slate-600">Latitude</span>
                    <input
                      value={location.latitude}
                      onChange={(e) => setLocation({ ...location, latitude: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 tabular-nums"
                      placeholder="-25.376"
                      inputMode="decimal"
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="text-slate-600">Longitude</span>
                    <input
                      value={location.longitude}
                      onChange={(e) => setLocation({ ...location, longitude: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 tabular-nums"
                      placeholder="28.261"
                      inputMode="decimal"
                    />
                  </label>
                  <div className="sm:col-span-2">
                    <button
                      type="button"
                      onClick={() => void saveLocation()}
                      disabled={savingLocation}
                      className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
                    >
                      {savingLocation ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      Save location
                    </button>
                    {location.mapsUrl ? (
                      <a
                        href={location.mapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-3 text-sm font-medium text-sky-600 hover:underline"
                      >
                        Preview Maps
                      </a>
                    ) : null}
                  </div>
                </div>
              )}
            </section>

            <section>
              <div className="mb-3 flex items-center gap-2">
                <ImagePlus className="h-5 w-5 text-orange-600" />
                <h2 className="text-lg font-semibold text-slate-900">Menu ({menuItems.length})</h2>
              </div>
              <p className="mb-3 text-sm text-slate-600">
                Set base price + markup %. Customer pay price is saved to the live menu. Upload a
                picture then Save item.
              </p>
              <div className="space-y-3">{menuItems.map(renderItemRow)}</div>
            </section>

            <section>
              <h2 className="mb-3 text-lg font-semibold text-slate-900">Extras ({extras.length})</h2>
              <div className="space-y-3">{extras.map(renderItemRow)}</div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

export default function Page() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'superadmin']}>
      <AdminFoodRestaurantEditor />
    </ProtectedRoute>
  );
}
