'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Package } from 'lucide-react';
import { productsAPI, getImageUrl } from '@/lib/api';
import type { Product } from '@/lib/types';

function formatPrice(price: number, currency: string) {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: currency || 'ZAR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);
}

function getDisplayPrice(p: Product) {
  if (p.discountPrice != null && p.discountPrice < p.price) return p.discountPrice;
  return p.price;
}

export default function MarketplacePreviewSection() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    productsAPI
      .list({ limit: 5, random: true })
      .then((res) => {
        const list = res.data?.data ?? res.data ?? [];
        setProducts(Array.isArray(list) ? list.slice(0, 5) : []);
      })
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <section className="pt-12 pb-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <h2 className="text-xl font-semibold text-slate-900">Buy from verified suppliers</h2>
        {!loading && products.length > 0 && (
          <Link
            href="/marketplace"
            className="text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            View all →
          </Link>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="rounded-2xl border border-slate-200/80 bg-white overflow-hidden shadow-sm">
              <div className="aspect-[4/5] bg-slate-100 animate-pulse" />
              <div className="p-3 space-y-2">
                <div className="h-4 bg-slate-100 rounded animate-pulse w-3/4" />
                <div className="h-4 bg-slate-100 rounded animate-pulse w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : products.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {products.map((p) => (
            <Link
              key={p._id}
              href={`/marketplace/${p.slug || p._id}`}
              className="group rounded-2xl border border-slate-200/80 bg-white overflow-hidden shadow-sm hover:shadow-md hover:border-slate-300/80 transition-all"
            >
              <div className="aspect-[4/5] bg-slate-50 flex items-center justify-center overflow-hidden">
                {p.images?.[0] ? (
                  <img
                    src={getImageUrl(p.images[0])}
                    alt=""
                    className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-200"
                  />
                ) : (
                  <Package className="h-12 w-12 text-slate-300" />
                )}
              </div>
              <div className="p-3">
                <p className="text-sm font-medium text-slate-900 truncate group-hover:text-blue-700">
                  {p.title}
                </p>
                <p className="text-sm font-semibold text-blue-600 mt-0.5">
                  {formatPrice(getDisplayPrice(p), p.currency)}
                </p>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200/80 bg-white p-8 text-center">
          <p className="text-sm text-slate-600">
            Browse the marketplace for verified suppliers.
          </p>
          <Link
            href="/marketplace"
            className="inline-flex items-center mt-3 text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            Go to Marketplace →
          </Link>
        </div>
      )}
    </section>
  );
}
