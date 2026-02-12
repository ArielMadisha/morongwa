'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Package, ArrowRight } from 'lucide-react';
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

export default function LandingMarketplaceCard() {
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
    <Link
      href="/marketplace"
      className="block bg-white/80 backdrop-blur-lg border border-slate-100 rounded-3xl shadow-2xl p-10 relative overflow-hidden hover:shadow-xl hover:border-sky-200 transition-all group"
    >
      <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-blue-100 blur-3xl" />
      <div className="absolute -left-16 bottom-0 h-36 w-36 rounded-full bg-cyan-100 blur-3xl" />
      <div className="relative space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 text-xl font-bold group-hover:bg-blue-100 transition-colors">
            M
          </div>
          <div>
            <p className="text-sm text-slate-500">From verified suppliers</p>
            <p className="text-lg font-semibold text-slate-900 group-hover:text-sky-700 transition-colors">
              Morongwa Marketplace
            </p>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : products.length > 0 ? (
          <div className="space-y-3">
            {products.map((p) => (
              <div
                key={p._id}
                className="flex items-center gap-3 p-3 rounded-2xl bg-slate-50/80 border border-slate-100"
              >
                <div className="h-12 w-12 rounded-xl bg-slate-200 flex items-center justify-center shrink-0">
                  {p.images?.[0] ? (
                    <img
                      src={getImageUrl(p.images[0])}
                      alt=""
                      className="h-12 w-12 rounded-xl object-cover"
                    />
                  ) : (
                    <Package className="h-6 w-6 text-slate-400" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900 truncate">{p.title}</p>
                  <div className="text-sm">
                    {p.discountPrice != null && p.discountPrice < p.price ? (
                      <>
                        <span className="font-semibold text-sky-600">{formatPrice(p.discountPrice, p.currency)}</span>
                        <span className="ml-1 text-slate-400 line-through text-xs">{formatPrice(p.price, p.currency)}</span>
                      </>
                    ) : (
                      <p className="font-semibold text-sky-600">{formatPrice(p.price, p.currency)}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-100 bg-gradient-to-r from-sky-50 to-white p-4 shadow-inner">
            <p className="text-sm text-slate-600">
              Browse products from verified suppliers. Delivery by runners.
            </p>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 text-sky-600 font-medium text-sm group-hover:gap-3 transition-all">
          <span>View marketplace</span>
          <ArrowRight className="h-4 w-4" />
        </div>
      </div>
    </Link>
  );
}
