'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Package, ArrowRight, AlertCircle } from 'lucide-react';
import { productsAPI, getImageUrl, getEffectivePrice } from '@/lib/api';
import type { Product } from '@/lib/types';
import { useCurrency } from '@/contexts/CurrencyContext';
import { formatCurrencyAmount } from '@/lib/formatCurrency';

function formatZar(price: number) {
  return formatCurrencyAmount(price, 'ZAR');
}

function formatUsd(price: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price);
}

export default function LandingMarketplaceCard() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const { formatPrice: formatUsdToViewerCurrency, countryCode, rates } = useCurrency();

  /** ZA: ZAR for local suppliers; USD listings converted via FX. Elsewhere: USD (ZAR listings converted to USD). */
  const formatListingPrice = useCallback(
    (amountInProductCurrency: number, productCurrency: string | undefined) => {
      const cur = (productCurrency || 'ZAR').toUpperCase();
      const inSouthAfrica = countryCode === 'ZA';

      if (inSouthAfrica) {
        if (cur === 'USD') {
          return formatUsdToViewerCurrency(amountInProductCurrency);
        }
        return formatZar(amountInProductCurrency);
      }

      if (cur === 'USD') {
        return formatUsd(amountInProductCurrency);
      }
      const zarPerUsd = rates.ZAR ?? rates.zar ?? 18.5;
      const usd = zarPerUsd > 0 ? amountInProductCurrency / zarPerUsd : amountInProductCurrency;
      return formatUsd(Math.round(usd * 100) / 100);
    },
    [countryCode, formatUsdToViewerCurrency, rates]
  );

  const priceLine = useCallback(
    (p: Product) => {
      const eff = getEffectivePrice(p);
      const list = p.price;
      const hasDiscount = p.discountPrice != null && p.discountPrice < list;
      if (hasDiscount) {
        return (
          <p className="text-brand-600 font-semibold">
            {formatListingPrice(p.discountPrice!, p.currency)}{' '}
            <span className="line-through text-slate-400 text-xs ml-1">{formatListingPrice(list, p.currency)}</span>
          </p>
        );
      }
      return <p className="text-brand-600 font-semibold">{formatListingPrice(eff, p.currency)}</p>;
    },
    [formatListingPrice]
  );

  useEffect(() => {
    productsAPI
      .list({ limit: 5, random: true })
      .then((res) => {
        const list = res.data?.data ?? res.data ?? [];
        setProducts(Array.isArray(list) ? list.slice(0, 5) : []);
        setLoadError(false);
      })
      .catch(() => {
        setProducts([]);
        setLoadError(true);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="w-full max-w-md rounded-xl bg-white shadow-md p-5 border border-slate-100 hover:shadow-lg transition-shadow">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-brand-500 text-white grid place-items-center font-semibold">
            M
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">QwertyHub</h3>
            <p className="text-slate-500 text-sm">Buy from verified suppliers</p>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : loadError ? (
          <div className="flex items-center gap-2 text-red-600 text-sm">
            <AlertCircle className="h-4 w-4 shrink-0" />
            Products temporarily unavailable. Try again later.
          </div>
        ) : products.length > 0 ? (
          <div className="space-y-3">
            {products.map((p) => (
              <Link
                key={p._id}
                href={`/marketplace/product/${p._id}`}
                className="flex items-center gap-3 p-2 rounded-md hover:bg-slate-50 transition"
              >
                <div className="h-14 w-14 rounded-md border border-slate-200 shrink-0 overflow-hidden bg-slate-100 flex items-center justify-center">
                  {p.images?.[0] ? (
                    <img src={getImageUrl(p.images[0])} alt={p.title} className="h-full w-full object-cover" />
                  ) : (
                    <Package className="h-6 w-6 text-slate-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-800 line-clamp-1">{p.title}</p>
                  {priceLine(p)}
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-slate-500 text-sm">
            Browse products from verified suppliers. Delivery by runners.
          </p>
        )}

        <Link
          href="/marketplace"
          className="mt-4 inline-flex items-center gap-2 text-brand-600 hover:text-brand-700 font-semibold transition"
        >
          View QwertyHub <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
