'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Package, ShoppingBag, User } from 'lucide-react';
import { resellerAPI, cartAPI, getImageUrl, getEffectivePrice } from '@/lib/api';
import { invalidateCartStoresCache } from '@/lib/useCartAndStores';
import { useAuth } from '@/contexts/AuthContext';
import SiteHeader from '@/components/SiteHeader';
import toast from 'react-hot-toast';

function formatPrice(price: number, currency: string) {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: currency || 'ZAR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(price);
}

interface WallProduct {
  productId: string;
  product: { _id: string; title: string; slug: string; images: string[]; price: number; currency: string };
  resellerCommissionPct?: number;
  addedAt: string;
}

export default function ResellerWallPage() {
  const params = useParams();
  const userId = params.userId as string;
  const { user } = useAuth();
  const [data, setData] = useState<{ resellerId: string; products: WallProduct[]; reseller: { name: string; _id: string } | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    resellerAPI.getWall(userId).then((res) => {
      const d = res.data?.data ?? res.data;
      setData(d ?? null);
    }).catch(() => setData(null)).finally(() => setLoading(false));
  }, [userId]);

  const addToCart = (productId: string, resellerId?: string) => {
    if (!user) { toast.error('Sign in to add to cart'); return; }
    setAdding(productId);
    cartAPI.add(productId, 1, resellerId).then(() => { toast.success('Added to cart'); invalidateCartStoresCache(); setAdding(null); }).catch(() => { toast.error('Failed to add'); setAdding(null); });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sky-50 to-white flex items-center justify-center">
        <p className="text-slate-600">Loading...</p>
      </div>
    );
  }

  const products = data?.products ?? [];
  const reseller = data?.reseller;

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-blue-50 to-white text-slate-900">
      <SiteHeader />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex items-center gap-4 mb-8">
          <div className="h-14 w-14 rounded-2xl bg-blue-100 border border-blue-200 flex items-center justify-center">
            <User className="h-7 w-7 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Reseller wall</h1>
            <p className="text-slate-600">{reseller?.name ? `${reseller.name}'s picks` : 'Products from this reseller'}</p>
          </div>
        </div>

        {products.length === 0 ? (
          <div className="bg-white/90 rounded-2xl border border-slate-100 p-12 text-center">
            <ShoppingBag className="h-16 w-16 text-slate-300 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-slate-700 mb-2">No products yet</h2>
            <p className="text-slate-600 mb-6">This reseller has not added any products to their wall.</p>
            <Link href="/marketplace" className="text-sky-600 hover:text-sky-700 font-medium">Browse marketplace</Link>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {products.map((wp) => {
              const p = wp.product;
              if (!p) return null;
              const markup = wp.resellerCommissionPct ?? 5;
              const basePrice = getEffectivePrice(p);
              const resellerPrice = Math.round(basePrice * (1 + markup / 100) * 100) / 100;
              const isOutOfStock = (p as any).outOfStock || (p.stock != null && p.stock < 1);
              return (
                <div key={wp.productId} className="relative bg-white/90 backdrop-blur rounded-2xl border border-slate-100 overflow-hidden shadow-sm hover:shadow-lg transition-all">
                  {isOutOfStock && <span className="absolute top-2 right-2 z-10 px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">Out of stock</span>}
                  <Link href={`/marketplace/product/${p._id}`} className="block aspect-square bg-slate-100">
                    {p.images?.[0] ? <img src={getImageUrl(p.images[0])} alt={p.title} className="w-full h-full object-cover" /> : <Package className="h-16 w-16 text-slate-300 m-auto" />}
                  </Link>
                  <div className="p-4">
                    <Link href={`/marketplace/product/${p._id}`} className="font-semibold text-slate-900 hover:text-sky-700 truncate block">{p.title}</Link>
                    <p className="text-lg font-bold text-sky-600 mt-1">{formatPrice(resellerPrice, p.currency)}</p>
                    <button
                      type="button"
                      onClick={() => addToCart(p._id, userId)}
                      disabled={adding === p._id || isOutOfStock}
                      className="mt-3 w-full py-2 rounded-xl bg-sky-600 text-white text-sm font-medium hover:bg-sky-700 disabled:opacity-50"
                    >
                      {isOutOfStock ? 'Out of stock' : adding === p._id ? 'Adding...' : 'Add to cart'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
