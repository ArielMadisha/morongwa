'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Loader2, Plus, ShoppingCart } from 'lucide-react';
import toast from 'react-hot-toast';
import { cartAPI, productsAPI, getImageUrl, getEffectivePrice } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useCartAndStores, invalidateCartStoresCache } from '@/lib/useCartAndStores';
import { QwertyHubSectionShell } from '@/components/marketplace/QwertyHubSectionShell';
import { formatCatalogProductPrice } from '@/lib/productPriceZar';

type GroceryProduct = {
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

const FALLBACK_COVER = '/qwertymates-q-mark-official.png';

function supplierIdOf(p: GroceryProduct): string {
  const s = p.supplierId;
  if (!s) return '';
  return typeof s === 'string' ? s : String(s._id || '');
}

function storeNameOf(products: GroceryProduct[]): string {
  const p = products[0];
  if (!p) return 'Grocery store';
  if (p.store?.name) return p.store.name;
  const s = p.supplierId;
  if (s && typeof s === 'object' && s.storeName) return s.storeName;
  return 'Grocery store';
}

/** Grocery lines carry no food service fee — catalog price is what the customer pays. */
function unitPrice(p: GroceryProduct): number {
  return getEffectivePrice(p as never) ?? p.price;
}

/** Sort by printed board number when the title starts with `#n`. */
function sortKey(p: GroceryProduct): number {
  const hash = String(p.title || '').match(/^#\s*(\d+)\b/);
  if (hash) return Number(hash[1]);
  return 9999;
}

function displayTitle(title: string): string {
  return String(title || '').replace(/^#\s*\d+\s*/, '').trim() || title;
}

export default function GroceryStorePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const { rates } = useCurrency();
  const { invalidate } = useCartAndStores(!!user);
  const storeParam = String(params?.storeId || '');
  const bySupplier = searchParams.get('by') === 'supplier';

  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<GroceryProduct[]>([]);
  const [addingId, setAddingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    productsAPI
      .list({ category: 'Groceries', limit: 300, page: 1 })
      .then((res) => {
        if (cancelled) return;
        const list = (res.data?.data ?? res.data ?? []) as GroceryProduct[];
        const all = Array.isArray(list) ? list : [];
        setProducts(
          all.filter((p) => {
            if (bySupplier) return supplierIdOf(p) === storeParam;
            if (p.store?._id) return String(p.store._id) === storeParam;
            return supplierIdOf(p) === storeParam;
          })
        );
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

  const items = useMemo(() => [...products].sort((a, b) => sortKey(a) - sortKey(b)), [products]);
  const storeName = storeNameOf(products);

  const addLine = useCallback(
    async (product: GroceryProduct) => {
      if (!user) {
        router.push(
          `/login?returnTo=${encodeURIComponent(
            `/marketplace/groceries/store/${storeParam}${bySupplier ? '?by=supplier' : ''}`
          )}`
        );
        return;
      }
      setAddingId(product._id);
      try {
        const color = product.colors?.[0]?.name;
        await cartAPI.add(product._id, 1, undefined, color);
        invalidateCartStoresCache();
        invalidate();
        toast.success(`Added ${displayTitle(product.title)}`);
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

  return (
    <QwertyHubSectionShell
      section="groceries"
      title={storeName}
      description="Tap an item to add it to your cart. Pay in checkout — collect from the store."
    >
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Link href="/marketplace/groceries" className="text-sm font-medium text-slate-600 hover:text-sky-700">
          ← Back to All grocery stores
        </Link>
        <Link
          href="/cart"
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-700"
        >
          <ShoppingCart className="h-4 w-4" /> Cart
        </Link>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-10 w-10 animate-spin text-sky-500" />
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white/90 rounded-2xl border border-slate-100 p-10 text-center text-slate-600">
          This store has no grocery items listed yet.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
          {items.map((item) => {
            const n = sortKey(item);
            const label = n < 9999 ? `#${n} ${displayTitle(item.title)}` : displayTitle(item.title);
            return (
              <button
                key={item._id}
                type="button"
                onClick={() => void addLine(item)}
                disabled={addingId === item._id}
                className="text-left bg-white/90 rounded-2xl border border-slate-100 overflow-hidden shadow-sm hover:shadow-md hover:border-emerald-200 transition-all disabled:opacity-60"
              >
                <div className="aspect-square bg-emerald-50 overflow-hidden">
                  <img
                    src={getImageUrl(item.images?.[0]) || FALLBACK_COVER}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="p-3">
                  <p className="text-xs sm:text-sm font-semibold text-slate-900 line-clamp-3 min-h-[3.5rem]">
                    {label}
                  </p>
                  <p className="mt-1 text-sm font-bold text-sky-600 tabular-nums">
                    {formatCatalogProductPrice(unitPrice(item), item.currency || 'ZAR', rates)}
                  </p>
                  <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                    <Plus className="h-3.5 w-3.5" /> Add to order
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </QwertyHubSectionShell>
  );
}
