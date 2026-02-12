'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Package, ArrowLeft, ShoppingCart, LayoutGrid, X } from 'lucide-react';
import { productsAPI, cartAPI, resellerAPI, getImageUrl, getEffectivePrice } from '@/lib/api';
import { invalidateCartStoresCache } from '@/lib/useCartAndStores';
import { useAuth } from '@/contexts/AuthContext';
import type { Product } from '@/lib/types';
import SiteHeader from '@/components/SiteHeader';
import toast from 'react-hot-toast';

function formatPrice(price: number, currency: string) {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: currency || 'ZAR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);
}

export default function ProductPage() {
  const params = useParams();
  const id = params.id as string;
  const { user } = useAuth();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [addingCart, setAddingCart] = useState(false);
  const [addingWall, setAddingWall] = useState(false);
  const [addToWallModal, setAddToWallModal] = useState(false);
  const [resellerCommissionPct, setResellerCommissionPct] = useState(5);

  useEffect(() => {
    if (!id) return;
    productsAPI
      .getByIdOrSlug(id)
      .then((res) => setProduct(res.data?.data ?? res.data ?? null))
      .catch(() => setProduct(null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sky-50 to-white flex items-center justify-center">
        <p className="text-slate-600">Loading...</p>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sky-50 to-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-600 mb-4">Product not found</p>
          <Link href="/marketplace" className="text-sky-600 hover:text-sky-700 font-medium">
            Back to marketplace
          </Link>
        </div>
      </div>
    );
  }

  const storeName = typeof product.supplierId === 'object' && product.supplierId?.storeName
    ? product.supplierId.storeName
    : null;
  const allowResell = 'allowResell' in product ? (product as any).allowResell : false;
  const isOutOfStock = (product as any).outOfStock || (product.stock != null && product.stock < 1);

  const addToCart = () => {
    if (isOutOfStock) { toast.error('Product is out of stock'); return; }
    if (!user) { toast.error('Sign in to add to cart'); return; }
    setAddingCart(true);
    cartAPI.add(product._id, 1).then(() => { toast.success('Added to cart'); invalidateCartStoresCache(); setAddingCart(false); }).catch(() => { toast.error('Failed'); setAddingCart(false); });
  };

  const openAddToWallModal = () => {
    if (!user) { toast.error('Sign in to add to your wall'); return; }
    setAddToWallModal(true);
  };

  const addToWall = () => {
    if (!user) return;
    setAddingWall(true);
    resellerAPI.addToWall(product._id, resellerCommissionPct)
      .then(() => {
        toast.success('Added to your reseller wall');
        setAddToWallModal(false);
        setAddingWall(false);
      })
      .catch((e) => {
        toast.error(e.response?.data?.message ?? 'Failed');
        setAddingWall(false);
      });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-blue-50 to-white text-slate-900">
      <SiteHeader />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link
          href="/marketplace"
          className="inline-flex items-center gap-2 text-sky-600 hover:text-sky-700 mb-6 text-sm font-medium"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to marketplace
        </Link>

        <div className="bg-white/90 backdrop-blur rounded-2xl border border-slate-100 overflow-hidden shadow-lg">
          <div className="grid md:grid-cols-2 gap-0">
            <div className="aspect-square bg-slate-100 flex items-center justify-center min-h-[280px]">
              {product.images?.[0] ? (
                <img
                  src={getImageUrl(product.images[0])}
                  alt={product.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Package className="h-24 w-24 text-slate-300" />
              )}
            </div>
            <div className="p-8 flex flex-col justify-center">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-slate-900">{product.title}</h1>
                {isOutOfStock && <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">Out of stock</span>}
              </div>
              <div className="mt-2">
                {product.discountPrice != null && product.discountPrice < product.price ? (
                  <>
                    <span className="text-2xl font-bold text-sky-600">{formatPrice(product.discountPrice, product.currency)}</span>
                    <span className="ml-2 text-base text-slate-400 line-through">{formatPrice(product.price, product.currency)}</span>
                  </>
                ) : (
                  <p className="text-2xl font-bold text-sky-600">{formatPrice(product.price, product.currency)}</p>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1">Manufacturer/Supplier pays 7.5% to Morongwa on successful sale.</p>
              {storeName && (
                <p className="text-sm text-slate-500 mt-1">Sold by {storeName}</p>
              )}
              {(product as any).sizes?.length > 0 && (
                <p className="text-sm text-slate-600 mt-2">Sizes: {(product as any).sizes.join(', ')}</p>
              )}
              {product.ratingAvg != null && (
                <p className="text-sm text-slate-600 mt-2">
                  {product.ratingAvg.toFixed(1)}★
                  {product.ratingCount != null && product.ratingCount > 0 && ` (${product.ratingCount} reviews)`}
                </p>
              )}
              {product.description && (
                <p className="text-slate-600 mt-4">{product.description}</p>
              )}
              <div className="flex flex-wrap gap-3 mt-6">
                <button
                  type="button"
                  onClick={addToCart}
                  disabled={addingCart || isOutOfStock}
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-sky-600 text-white font-medium hover:bg-sky-700 disabled:opacity-50"
                >
                  <ShoppingCart className="h-4 w-4" />
                  {isOutOfStock ? 'Out of stock' : addingCart ? 'Adding...' : 'Add to cart'}
                </button>
                {allowResell && (
                  <button
                    type="button"
                    onClick={openAddToWallModal}
                    disabled={addingWall}
                    className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-slate-100 text-slate-700 font-medium hover:bg-slate-200 disabled:opacity-50"
                  >
                    <LayoutGrid className="h-4 w-4" />
                    {addingWall ? 'Adding...' : 'Add to my reseller wall'}
                  </button>
                )}
              </div>
              <p className="text-sm text-slate-500 mt-4">
                <Link href="/cart" className="text-sky-600 hover:text-sky-700">View cart</Link>
                {' · '}
                <Link href="/marketplace" className="text-sky-600 hover:text-sky-700">Back to marketplace</Link>
              </p>
            </div>
          </div>
        </div>

        {/* Add to wall modal - set reseller commission 3-7% */}
        {addToWallModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => setAddToWallModal(false)} aria-hidden="true" />
            <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-900">Add to reseller wall</h3>
                <button onClick={() => setAddToWallModal(false)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
              </div>
              <p className="text-sm text-slate-600 mb-4">Set your commission (3–7%). This markup will be added to the price in your store.</p>
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-2">Your commission %</label>
                <input
                  type="range"
                  min="3"
                  max="7"
                  value={resellerCommissionPct}
                  onChange={(e) => setResellerCommissionPct(Number(e.target.value))}
                  className="w-full"
                />
                <p className="text-sm font-semibold text-sky-600 mt-1">{resellerCommissionPct}% — Selling price: {formatPrice(Math.round(getEffectivePrice(product) * (1 + resellerCommissionPct / 100) * 100) / 100, product.currency)}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={addToWall} disabled={addingWall} className="flex-1 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50">
                  {addingWall ? 'Adding...' : 'Add to my wall'}
                </button>
                <button onClick={() => setAddToWallModal(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
