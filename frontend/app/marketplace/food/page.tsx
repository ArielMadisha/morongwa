'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2, MapPin, Store } from 'lucide-react';
import { productsAPI, getImageUrl } from '@/lib/api';
import { QwertyHubSectionShell } from '@/components/marketplace/QwertyHubSectionShell';

type FoodProduct = {
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
    latitude?: number;
    longitude?: number;
  };
  supplierId?: { _id?: string; storeName?: string } | string;
};

type RestaurantCard = {
  key: string;
  name: string;
  storeId?: string;
  supplierId?: string;
  sampleImage?: string;
  menuCount: number;
  mapsUrl?: string;
  address?: string;
};

const FALLBACK_MAPS: Record<string, string> = {
  "caliba's township burger": 'https://maps.app.goo.gl/NtygfjwHBQCRHDhB9',
  calibastownshipburger: 'https://maps.app.goo.gl/NtygfjwHBQCRHDhB9',
};

/** Reverse-geocoded from 25°22'33.6"S 28°15'40.9"E (Mosimegi Street / Temba). */
const FALLBACK_ADDRESS: Record<string, string> = {
  "caliba's township burger": 'Mosimegi Street, Temba, Pretoria, Gauteng, 0407',
  calibastownshipburger: 'Mosimegi Street, Temba, Pretoria, Gauteng, 0407',
};

function resolveSupplierId(p: FoodProduct): string {
  const s = p.supplierId;
  if (!s) return '';
  if (typeof s === 'string') return s;
  return String(s._id || '');
}

function resolveStoreName(p: FoodProduct): string {
  if (p.store?.name) return p.store.name;
  const s = p.supplierId;
  if (s && typeof s === 'object' && s.storeName) return s.storeName;
  return 'Restaurant';
}

function resolveMapsUrl(p: FoodProduct, name: string): string | undefined {
  if (p.store?.mapsUrl) return p.store.mapsUrl;
  const key = name.trim().toLowerCase();
  return FALLBACK_MAPS[key];
}

function looksLikeCoordsOnly(address: string): boolean {
  const a = address.trim().toLowerCase();
  if (!a) return true;
  if (a.includes('customer collection') && /[°']/.test(a)) return true;
  if (/^\d{1,3}°/.test(a) || /\d{1,3}°\d{1,2}'/.test(a)) return true;
  return false;
}

function resolveAddress(p: FoodProduct, name: string): string | undefined {
  const raw = (p.store?.address || '').trim();
  if (raw && !looksLikeCoordsOnly(raw)) return raw;
  const key = name.trim().toLowerCase();
  return FALLBACK_ADDRESS[key] || (raw || undefined);
}

export default function MarketplaceFoodPage() {
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<FoodProduct[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    productsAPI
      .list({ category: 'Food & Restaurant', limit: 300, page: 1 })
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

  const restaurants = useMemo(() => {
    const map = new Map<string, RestaurantCard>();
    for (const p of products) {
      const tags = (p.tags || []).map((t) => String(t).toLowerCase());
      if (tags.includes('food-extra')) continue;
      const supplierId = resolveSupplierId(p);
      const storeId = p.store?._id ? String(p.store._id) : undefined;
      const key = storeId || supplierId || resolveStoreName(p);
      if (!key) continue;
      const name = resolveStoreName(p);
      const existing = map.get(key);
      if (existing) {
        existing.menuCount += 1;
        if (!existing.mapsUrl) existing.mapsUrl = resolveMapsUrl(p, name);
        if (!existing.address) existing.address = resolveAddress(p, name);
        if (!existing.sampleImage && p.images?.[0]) existing.sampleImage = p.images[0];
        continue;
      }
      map.set(key, {
        key,
        name,
        storeId,
        supplierId: supplierId || undefined,
        sampleImage: p.images?.[0] || '/food/calibas-kota-1.png',
        menuCount: 1,
        mapsUrl: resolveMapsUrl(p, name),
        address: resolveAddress(p, name),
      });
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [products]);

  return (
    <QwertyHubSectionShell
      section="food"
      title="Order Food/Restaurant"
      description="Order kota / bunny chow and meals. Pay with ACBPay wallet or card. Collect from the restaurant."
    >
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-10 w-10 animate-spin text-sky-500" />
        </div>
      ) : restaurants.length === 0 ? (
        <div className="bg-white/90 rounded-2xl border border-slate-100 p-10 text-center">
          <p className="text-slate-600">No restaurants listed yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {restaurants.map((r) => {
            const href = `/marketplace/food/store/${r.supplierId || r.key}?by=supplier`;
            const cover = getImageUrl(r.sampleImage) || '/food/calibas-kota-1.png';
            return (
              <div
                key={r.key}
                className="group flex flex-col bg-white/90 rounded-2xl border border-slate-100 overflow-hidden shadow-sm hover:shadow-lg hover:border-sky-200 transition-all"
              >
                <Link href={href} className="block">
                  <div className="h-40 bg-orange-50 overflow-hidden">
                    <img src={cover} alt="" className="h-full w-full object-cover" />
                  </div>
                </Link>
                <div className="p-4 flex flex-col gap-2">
                  <Link href={href} className="flex items-center gap-2 min-w-0">
                    <Store className="h-4 w-4 text-sky-600 shrink-0" />
                    <h3 className="font-semibold text-slate-900 group-hover:text-sky-700 truncate">
                      {r.name}
                    </h3>
                  </Link>

                  {r.mapsUrl ? (
                    <div>
                      <a
                        href={r.mapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-sky-600 hover:text-sky-700"
                      >
                        <MapPin className="h-4 w-4 shrink-0" />
                        Open in Google Maps
                      </a>
                      {r.address ? (
                        <p className="mt-0.5 text-xs text-slate-500 line-clamp-2">{r.address}</p>
                      ) : null}
                    </div>
                  ) : r.address ? (
                    <p className="text-xs text-slate-500 line-clamp-2">{r.address}</p>
                  ) : null}

                  <Link href={href} className="text-sm text-slate-500">
                    {r.menuCount} menu items · Customer collection
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
