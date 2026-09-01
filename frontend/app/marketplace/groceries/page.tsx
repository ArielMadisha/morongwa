'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2, MapPin, Store } from 'lucide-react';
import { productsAPI, getImageUrl } from '@/lib/api';
import { QwertyHubSectionShell } from '@/components/marketplace/QwertyHubSectionShell';

type GroceryProduct = {
  _id: string;
  title: string;
  price: number;
  images?: string[];
  tags?: string[];
  categories?: string[];
  store?: {
    _id?: string;
    name?: string;
    slug?: string;
    address?: string;
    mapsUrl?: string;
  };
  supplierId?: { _id?: string; storeName?: string } | string;
};

type GroceryStoreCard = {
  key: string;
  name: string;
  storeId?: string;
  supplierId?: string;
  sampleImage?: string;
  itemCount: number;
  mapsUrl?: string;
  address?: string;
};

const FALLBACK_COVER = '/qwertymates-q-mark-official.png';

function resolveSupplierId(p: GroceryProduct): string {
  const s = p.supplierId;
  if (!s) return '';
  if (typeof s === 'string') return s;
  return String(s._id || '');
}

function resolveStoreName(p: GroceryProduct): string {
  if (p.store?.name) return p.store.name;
  const s = p.supplierId;
  if (s && typeof s === 'object' && s.storeName) return s.storeName;
  return 'Grocery store';
}

function looksLikeCoordsOnly(address: string): boolean {
  const a = address.trim().toLowerCase();
  if (!a) return true;
  if (/^\d{1,3}°/.test(a) || /\d{1,3}°\d{1,2}'/.test(a)) return true;
  return false;
}

export default function MarketplaceGroceriesPage() {
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<GroceryProduct[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    productsAPI
      .list({ category: 'Groceries', limit: 300, page: 1 })
      .then((res) => {
        if (cancelled) return;
        const list = res.data?.data ?? res.data ?? [];
        setProducts(Array.isArray(list) ? list : []);
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
  }, []);

  const stores = useMemo(() => {
    const map = new Map<string, GroceryStoreCard>();
    for (const p of products) {
      const supplierId = resolveSupplierId(p);
      const storeId = p.store?._id ? String(p.store._id) : undefined;
      const name = resolveStoreName(p);
      const key = storeId || supplierId || name;
      if (!key) continue;
      const address = (p.store?.address || '').trim();
      const existing = map.get(key);
      if (existing) {
        existing.itemCount += 1;
        if (!existing.mapsUrl) existing.mapsUrl = p.store?.mapsUrl;
        if (!existing.address && address && !looksLikeCoordsOnly(address)) existing.address = address;
        if (!existing.sampleImage && p.images?.[0]) existing.sampleImage = p.images[0];
        continue;
      }
      map.set(key, {
        key,
        name,
        storeId,
        supplierId: supplierId || undefined,
        sampleImage: p.images?.[0] || FALLBACK_COVER,
        itemCount: 1,
        mapsUrl: p.store?.mapsUrl,
        address: address && !looksLikeCoordsOnly(address) ? address : undefined,
      });
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [products]);

  return (
    <QwertyHubSectionShell
      section="groceries"
      title="Order Groceries"
      description="Order groceries and bakery items. Pay with ACBPay wallet or card. Collect from the store."
    >
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-10 w-10 animate-spin text-sky-500" />
        </div>
      ) : stores.length === 0 ? (
        <div className="bg-white/90 backdrop-blur rounded-2xl border border-slate-100 p-10 sm:p-12 text-center shadow-sm">
          <h3 className="text-2xl font-semibold text-slate-800 mb-2">Coming Soon</h3>
          <p className="text-slate-600 max-w-md mx-auto">
            Order Groceries will open here soon. For now, shop products on QwertyHub or order food from
            restaurants.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {stores.map((s) => {
            const href = `/marketplace/groceries/store/${s.supplierId || s.key}?by=supplier`;
            const cover = getImageUrl(s.sampleImage) || FALLBACK_COVER;
            return (
              <div
                key={s.key}
                className="group flex flex-col bg-white/90 rounded-2xl border border-slate-100 overflow-hidden shadow-sm hover:shadow-lg hover:border-sky-200 transition-all"
              >
                <Link href={href} className="block">
                  <div className="h-40 bg-emerald-50 overflow-hidden">
                    <img src={cover} alt="" className="h-full w-full object-cover" />
                  </div>
                </Link>
                <div className="p-4 flex flex-col gap-2">
                  <Link href={href} className="flex items-center gap-2 min-w-0">
                    <Store className="h-4 w-4 text-sky-600 shrink-0" />
                    <h3 className="font-semibold text-slate-900 group-hover:text-sky-700 truncate">{s.name}</h3>
                  </Link>

                  {s.mapsUrl ? (
                    <div>
                      <a
                        href={s.mapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-sky-600 hover:text-sky-700"
                      >
                        <MapPin className="h-4 w-4 shrink-0" />
                        Open in Google Maps
                      </a>
                      {s.address ? (
                        <p className="mt-0.5 text-xs text-slate-500 line-clamp-2">{s.address}</p>
                      ) : null}
                    </div>
                  ) : s.address ? (
                    <p className="text-xs text-slate-500 line-clamp-2">{s.address}</p>
                  ) : null}

                  <Link href={href} className="text-sm text-slate-500">
                    {s.itemCount} items · Customer collection
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </QwertyHubSectionShell>
  );
}
