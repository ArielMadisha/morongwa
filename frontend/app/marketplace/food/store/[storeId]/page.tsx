'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Loader2, Plus, ShoppingCart, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { cartAPI, productsAPI, getImageUrl, getEffectivePrice } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useCartAndStores } from '@/lib/useCartAndStores';
import { QwertyHubSectionShell } from '@/components/marketplace/QwertyHubSectionShell';
import { formatCatalogProductPrice } from '@/lib/productPriceZar';

/** Flat platform service fee (ZAR) — mirrors backend FOOD_ORDER_SERVICE_FEE_ZAR. */
const FOOD_ORDER_SERVICE_FEE_ZAR = 3.5;

type FoodProduct = {
  _id: string;
  title: string;
  description?: string;
  price: number;
  discountPrice?: number;
  currency?: string;
  images?: string[];
  tags?: string[];
  categories?: string[];
  colors?: Array<{ name: string }>;
  sku?: string;
  store?: { _id?: string; name?: string };
  supplierId?: { _id?: string; storeName?: string } | string;
};

/** Printed Caliba extras order (menu board). */
const EXTRA_ORDER = [
  'small chips',
  'medium chips',
  'large chips',
  'russian',
  'burger',
  'french',
  'atchaar',
  'fried eggs',
  'cheese',
  'vienna',
];

function isExtra(p: FoodProduct) {
  return (p.tags || []).map((t) => String(t).toLowerCase()).includes('food-extra');
}

function isMenu(p: FoodProduct) {
  const tags = (p.tags || []).map((t) => String(t).toLowerCase());
  return tags.includes('food-menu') || (!isExtra(p) && (p.categories || []).includes('Food & Restaurant'));
}

function catalogUnit(p: FoodProduct): number {
  return getEffectivePrice(p as never) ?? p.price;
}

/**
 * Display price with service fee:
 * - Menu items: always +R3.50
 * - Extras alone (grid): +R3.50
 * - Extras with a menu item (modal): no fee
 */
function displayUnitPrice(p: FoodProduct, opts: { waiveExtraFee?: boolean }): number {
  const base = catalogUnit(p);
  if (isMenu(p)) return Math.round((base + FOOD_ORDER_SERVICE_FEE_ZAR) * 100) / 100;
  if (isExtra(p)) {
    if (opts.waiveExtraFee) return base;
    return Math.round((base + FOOD_ORDER_SERVICE_FEE_ZAR) * 100) / 100;
  }
  return Math.round((base + FOOD_ORDER_SERVICE_FEE_ZAR) * 100) / 100;
}

function supplierIdOf(p: FoodProduct) {
  const s = p.supplierId;
  if (!s) return '';
  return typeof s === 'string' ? s : String(s._id || '');
}

function storeNameOf(products: FoodProduct[]) {
  const p = products[0];
  if (!p) return 'Restaurant';
  if (p.store?.name) return p.store.name;
  const s = p.supplierId;
  if (s && typeof s === 'object' && s.storeName) return s.storeName;
  return 'Restaurant';
}

/** Sort kota items by printed board number (#1 … #21 / CALIBA-MENU-n). */
function menuSortKey(p: FoodProduct): number {
  const sku = String(p.sku || '').match(/CALIBA-MENU-(\d+)/i);
  if (sku) return Number(sku[1]);
  const hash = String(p.title || '').match(/^#\s*(\d+)\b/);
  if (hash) return Number(hash[1]);
  return 9999;
}

function extraSortKey(p: FoodProduct): number {
  const sku = String(p.sku || '').match(/CALIBA-EXTRA-(\d+)/i);
  if (sku) return Number(sku[1]);
  const name = String(p.title || '')
    .replace(/^Extra:\s*/i, '')
    .trim()
    .toLowerCase();
  const idx = EXTRA_ORDER.indexOf(name);
  return idx >= 0 ? idx : 100 + name.charCodeAt(0);
}

function displayMenuTitle(title: string): string {
  return String(title || '').replace(/^#\s*\d+\s*/, '').trim() || title;
}

function displayExtraTitle(title: string): string {
  return String(title || '').replace(/^Extra:\s*/i, '').trim() || title;
}

export default function FoodStoreMenuPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const { rates } = useCurrency();
  const { invalidate } = useCartAndStores(!!user);
  const storeParam = String(params?.storeId || '');
  const bySupplier = searchParams.get('by') === 'supplier';

  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<FoodProduct[]>([]);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [extrasFor, setExtrasFor] = useState<FoodProduct | null>(null);
  const [selectedExtras, setSelectedExtras] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    productsAPI
      .list({ category: 'Food & Restaurant', limit: 300, page: 1 })
      .then((res) => {
        if (cancelled) return;
        const list = (res.data?.data ?? res.data ?? []) as FoodProduct[];
        const all = Array.isArray(list) ? list : [];
        const filtered = all.filter((p) => {
          if (bySupplier) return supplierIdOf(p) === storeParam;
          if (p.store?._id) return String(p.store._id) === storeParam;
          return supplierIdOf(p) === storeParam;
        });
        setProducts(filtered);
      })
      .catch(() => {
        if (!cancelled) setProducts([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [storeParam, bySupplier]);

  const menuItems = useMemo(
    () => products.filter(isMenu).sort((a, b) => menuSortKey(a) - menuSortKey(b)),
    [products]
  );
  const extras = useMemo(
    () => products.filter(isExtra).sort((a, b) => extraSortKey(a) - extraSortKey(b)),
    [products]
  );
  const restaurantName = storeNameOf(products);

  const addLine = useCallback(
    async (product: FoodProduct) => {
      if (!user) {
        router.push(
          `/login?returnTo=${encodeURIComponent(`/marketplace/food/store/${storeParam}${bySupplier ? '?by=supplier' : ''}`)}`
        );
        return;
      }
      setAddingId(product._id);
      try {
        const color = product.colors?.[0]?.name;
        await cartAPI.add(product._id, 1, undefined, color);
        invalidate();
        toast.success(`Added ${displayExtraTitle(displayMenuTitle(product.title))}`);
      } catch (e: unknown) {
        const msg =
          (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
          'Could not add to cart';
        toast.error(msg);
      } finally {
        setAddingId(null);
      }
    },
    [user, router, storeParam, bySupplier, invalidate]
  );

  const openExtras = (product: FoodProduct) => {
    setExtrasFor(product);
    setSelectedExtras({});
  };

  const confirmMenuWithExtras = async () => {
    if (!extrasFor) return;
    await addLine(extrasFor);
    const chosen = extras.filter((e) => selectedExtras[e._id]);
    for (const ex of chosen) {
      await addLine(ex);
    }
    setExtrasFor(null);
    setSelectedExtras({});
  };

  const renderProductCard = (
    item: FoodProduct,
    opts: { n?: number; onClick: () => void; waiveExtraFee?: boolean }
  ) => {
    const price = displayUnitPrice(item, { waiveExtraFee: opts.waiveExtraFee });
    const label = opts.n != null ? `#${opts.n} ${displayMenuTitle(item.title)}` : displayExtraTitle(item.title);
    return (
      <button
        key={item._id}
        type="button"
        onClick={opts.onClick}
        disabled={addingId === item._id}
        className="text-left bg-white/90 rounded-2xl border border-slate-100 overflow-hidden shadow-sm hover:shadow-md hover:border-orange-200 transition-all disabled:opacity-60"
      >
        <div className="aspect-square bg-orange-50 overflow-hidden">
          <img
            src={getImageUrl(item.images?.[0]) || '/food/calibas-kota-1.png'}
            alt=""
            className="h-full w-full object-cover"
          />
        </div>
        <div className="p-3">
          <p className="text-xs sm:text-sm font-semibold text-slate-900 line-clamp-3 min-h-[3.5rem]">{label}</p>
          <p className="mt-1 text-sm font-bold text-sky-600 tabular-nums">
            {formatCatalogProductPrice(price, item.currency || 'ZAR', rates)}
          </p>
          <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-orange-700">
            <Plus className="h-3.5 w-3.5" /> Add to order
          </span>
        </div>
      </button>
    );
  };

  return (
    <QwertyHubSectionShell
      section="food"
      title={restaurantName}
      description="Tap a kota to add it to your cart. Extras are optional. Pay in checkout — collect from the store."
    >
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Link href="/marketplace/food" className="text-sm font-medium text-slate-600 hover:text-sky-700">
          ← All restaurants
        </Link>
        <Link
          href="/cart"
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-700"
        >
          <ShoppingCart className="h-4 w-4" /> Cart
        </Link>
      </div>

      <p className="mb-4 text-xs sm:text-sm text-slate-500">
        Prices include a R{FOOD_ORDER_SERVICE_FEE_ZAR.toFixed(2)} service fee per menu item. Extras added with a
        kota do not attract an extra fee; extras bought on their own include the fee.
      </p>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-10 w-10 animate-spin text-sky-500" />
        </div>
      ) : menuItems.length === 0 ? (
        <div className="bg-white/90 rounded-2xl border border-slate-100 p-10 text-center text-slate-600">
          Menu not available.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
            {menuItems.map((item) => {
              const n = menuSortKey(item);
              return renderProductCard(item, {
                n: n < 9999 ? n : undefined,
                onClick: () => openExtras(item),
              });
            })}
          </div>

          {extras.length > 0 ? (
            <section className="mt-10">
              <h3 className="text-lg sm:text-xl font-bold text-slate-900 mb-1">Extras</h3>
              <p className="text-sm text-slate-500 mb-4">
                Add-ons from the board — tap to add alone (includes R{FOOD_ORDER_SERVICE_FEE_ZAR.toFixed(2)} fee),
                or choose them when adding a kota (no fee on extras).
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
                {extras.map((item) =>
                  renderProductCard(item, {
                    onClick: () => void addLine(item),
                  })
                )}
              </div>
            </section>
          ) : null}
        </>
      )}

      {extrasFor && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
          <div className="w-full max-w-lg rounded-t-2xl sm:rounded-2xl bg-white shadow-xl max-h-[85vh] overflow-y-auto">
            <div className="sticky top-0 flex items-center justify-between gap-2 border-b border-slate-100 bg-white px-4 py-3">
              <div className="min-w-0">
                <p className="font-semibold text-slate-900 truncate">
                  {(() => {
                    const n = menuSortKey(extrasFor);
                    const base = displayMenuTitle(extrasFor.title);
                    return n < 9999 ? `#${n} ${base}` : base;
                  })()}
                </p>
                <p className="text-sm text-slate-500">
                  Add extras? (optional — no service fee on extras with this order)
                </p>
              </div>
              <button
                type="button"
                className="p-2 rounded-lg hover:bg-slate-100"
                onClick={() => setExtrasFor(null)}
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 space-y-2">
              {extras.length === 0 ? (
                <p className="text-sm text-slate-500">No extras listed for this store.</p>
              ) : (
                extras.map((ex) => {
                  const price = displayUnitPrice(ex, { waiveExtraFee: true });
                  const on = !!selectedExtras[ex._id];
                  return (
                    <label
                      key={ex._id}
                      className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 cursor-pointer ${
                        on ? 'border-sky-300 bg-sky-50' : 'border-slate-200 bg-white'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={(e) =>
                          setSelectedExtras((prev) => ({ ...prev, [ex._id]: e.target.checked }))
                        }
                        className="h-4 w-4 rounded border-slate-300 text-sky-600"
                      />
                      <span className="flex-1 text-sm font-medium text-slate-800">
                        {displayExtraTitle(ex.title)}
                      </span>
                      <span className="text-sm font-semibold text-sky-600 tabular-nums">
                        {formatCatalogProductPrice(price, ex.currency || 'ZAR', rates)}
                      </span>
                    </label>
                  );
                })
              )}
            </div>
            <div className="sticky bottom-0 flex gap-2 border-t border-slate-100 bg-white p-4">
              <button
                type="button"
                onClick={() => setExtrasFor(null)}
                className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmMenuWithExtras()}
                disabled={!!addingId}
                className="flex-1 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
              >
                {addingId ? 'Adding…' : 'Add to cart'}
              </button>
            </div>
          </div>
        </div>
      )}
    </QwertyHubSectionShell>
  );
}
