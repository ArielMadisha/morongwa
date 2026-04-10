'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ShoppingCart, Minus, Plus, Trash2, ArrowRight, Package, Music2 } from 'lucide-react';
import { SearchButton } from '@/components/SearchButton';
import { cartAPI, checkoutAPI, getImageUrl } from '@/lib/api';
import { invalidateCartStoresCache, useCartAndStores } from '@/lib/useCartAndStores';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrency } from '@/contexts/CurrencyContext';
import { AppSidebar } from '@/components/AppSidebar';
import { AppShellHeader } from '@/components/AppShellHeader';
import { AdvertSlot } from '@/components/AdvertSlot';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { ProfileHeaderButton } from '@/components/ProfileHeaderButton';
import { formatCurrencyAmount } from '@/lib/formatCurrency';

interface CartItem {
  productId: string;
  qty: number;
  resellerId?: string;
  product: {
    _id: string;
    title: string;
    slug: string;
    images: string[];
    price: number;
    currency: string;
    stock: number;
  };
  lineTotal: number;
}

interface CartMusicItem {
  songId: string;
  qty: number;
  song: {
    _id: string;
    title: string;
    artist?: string;
    artworkUrl?: string;
    price: number;
    type?: string;
  };
  lineTotal: number;
}

function formatPriceLocal(price: number, currency: string) {
  return formatCurrencyAmount(price, currency || 'ZAR');
}

function CartPageContent() {
  const { user, logout } = useAuth();
  const { formatPrice: formatInLocal } = useCurrency();
  const router = useRouter();
  const [items, setItems] = useState<CartItem[]>([]);
  const [musicItems, setMusicItems] = useState<CartMusicItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [quote, setQuote] = useState<{ subtotal: number; shipping: number; total: number; shippingBreakdown?: Array<{ storeName?: string; shippingCost: number }> } | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const { cartCount, hasStore } = useCartAndStores(!!user);

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  const loadCart = () => {
    cartAPI
      .get()
      .then((res) => {
        const data = res.data?.data ?? res.data;
        setItems(Array.isArray(data?.items) ? data.items : []);
        setMusicItems(Array.isArray(data?.musicItems) ? data.musicItems : []);
      })
      .catch(() => {
        setItems([]);
        setMusicItems([]);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    invalidateCartStoresCache();
    loadCart();
  }, []);

  useEffect(() => {
    if (items.length === 0 && musicItems.length === 0) {
      setQuote(null);
      return;
    }
    setQuoteLoading(true);
    checkoutAPI
      .quote({ deliveryCountry: 'ZA' })
      .then((res) => {
        const d = res.data?.data ?? res.data;
        if (d) setQuote({ subtotal: d.subtotal ?? 0, shipping: d.shipping ?? 0, total: d.total ?? 0, shippingBreakdown: d.shippingBreakdown });
        else setQuote(null);
      })
      .catch(() => setQuote(null))
      .finally(() => setQuoteLoading(false));
  }, [items.length, musicItems.length, items, musicItems]);

  const updateQty = (productId: string, newQty: number) => {
    if (newQty < 1) return;
    setUpdating(productId);
    cartAPI
      .updateItem(productId, newQty)
      .then(() => { invalidateCartStoresCache(); loadCart(); })
      .finally(() => setUpdating(null));
  };

  const remove = (productId: string) => {
    setUpdating(productId);
    cartAPI
      .removeItem(productId)
      .then(() => { invalidateCartStoresCache(); loadCart(); })
      .finally(() => setUpdating(null));
  };

  const removeMusic = (songId: string) => {
    setUpdating(songId);
    cartAPI
      .removeMusicItem(songId)
      .then(() => { invalidateCartStoresCache(); loadCart(); })
      .finally(() => setUpdating(null));
  };

  const subtotal = items.reduce((sum, i) => sum + i.lineTotal, 0) + musicItems.reduce((sum, i) => sum + i.lineTotal, 0);
  const isEmpty = items.length === 0 && musicItems.length === 0;

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-sky-50 via-blue-50 to-white text-slate-900">
      <AppShellHeader
        onMenuClick={() => setMenuOpen((v) => !v)}
        center={
          <>
            <div className="h-8 w-8 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
              <ShoppingCart className="h-4 w-4 text-brand-600" />
            </div>
            <h1 className="text-base sm:text-lg font-semibold text-slate-900 min-w-0 break-words">Cart</h1>
          </>
        }
        actions={
          <>
            <SearchButton />
            <ProfileHeaderButton />
          </>
        }
      />
      <div className="flex min-h-0 min-w-0 w-full flex-1">
        <AppSidebar
          variant="wall"
          userName={user?.name}
          userAvatar={(user as any)?.avatar}
          userId={user?._id || user?.id}
          cartCount={cartCount}
          hasStore={hasStore}
          onLogout={handleLogout}
          menuOpen={menuOpen}
          setMenuOpen={setMenuOpen}
          hideLogo
          belowHeader
        />
        <div className="flex min-h-0 flex-1 flex-col gap-0 overflow-y-auto overflow-x-hidden lg:flex-row">
          <main className="relative z-0 order-2 box-border w-full min-w-0 max-w-4xl flex-1 mx-auto px-3 sm:px-6 lg:px-8 py-5 sm:py-6 pb-24 lg:pb-6 lg:order-none">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-8 min-w-0">
            <div className="h-12 w-12 rounded-2xl bg-blue-100 border border-blue-200 flex items-center justify-center shrink-0">
              <ShoppingCart className="h-6 w-6 text-blue-600" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 break-words">Your cart</h1>
              <p className="text-slate-600 text-sm sm:text-base leading-relaxed break-words">
                Review items and proceed to checkout
              </p>
            </div>
          </div>

          {loading ? (
            <div className="bg-white/90 rounded-2xl border border-slate-100 p-8 animate-pulse">
              <div className="h-24 bg-slate-100 rounded-xl mb-4" />
              <div className="h-24 bg-slate-100 rounded-xl mb-4" />
            </div>
          ) : isEmpty ? (
            <div className="bg-white/90 backdrop-blur rounded-2xl border border-slate-100 p-12 text-center">
              <Package className="h-16 w-16 text-slate-300 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-slate-700 mb-2">Cart is empty</h2>
              <p className="text-slate-600 mb-6">Add products from QwertyHub or music from QwertyMusic to get started.</p>
              <Link
                href="/marketplace"
                className="inline-flex items-center gap-2 bg-sky-600 text-white px-6 py-3 rounded-xl hover:bg-sky-700 font-medium"
              >
                Browse QwertyHub
                <ArrowRight className="h-4 w-4" />
              </Link>
              <p className="mt-6 text-sm text-slate-500">
                Need help? <Link href="/support?category=products:cart" className="text-sky-600 hover:underline">Contact support</Link>
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-4 mb-8">
                {items.map((item) => (
                  <div
                    key={item.productId}
                    className="bg-white/90 backdrop-blur rounded-2xl border border-slate-100 p-4 flex gap-4 items-center"
                  >
                    <div className="w-20 h-20 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 overflow-hidden">
                      {item.product?.images?.[0] ? (
                        <img src={getImageUrl(item.product.images[0])} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <Package className="h-8 w-8 text-slate-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <Link
                        href={`/marketplace/product/${item.productId}`}
                        className="font-semibold text-slate-900 hover:text-sky-600 truncate block"
                      >
                        {item.product?.title ?? 'Product'}
                      </Link>
                      <p className="text-sky-600 font-medium">{(item.product?.currency === 'USD' ? formatInLocal(item.product?.price ?? 0) : formatPriceLocal(item.product?.price ?? 0, item.product?.currency ?? 'ZAR'))} each</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => updateQty(item.productId, Math.max(1, item.qty - 1))}
                        disabled={updating === item.productId || item.qty <= 1}
                        className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-50"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="w-8 text-center font-medium">{item.qty}</span>
                      <button
                        type="button"
                        onClick={() => updateQty(item.productId, item.qty + 1)}
                        disabled={updating === item.productId || (item.product?.stock != null && item.qty >= item.product.stock)}
                        className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-50"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                    <p className="font-semibold text-slate-900 w-24 text-right">
                      {item.product?.currency === 'USD' ? formatInLocal(item.lineTotal) : formatPriceLocal(item.lineTotal, item.product?.currency ?? 'ZAR')}
                    </p>
                    <button
                      type="button"
                      onClick={() => remove(item.productId)}
                      disabled={updating === item.productId}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                      aria-label="Remove"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                {musicItems.map((item) => (
                  <div
                    key={item.songId}
                    className="bg-white/90 backdrop-blur rounded-2xl border border-slate-100 p-4 flex gap-4 items-center"
                  >
                    <div className="w-20 h-20 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 overflow-hidden">
                      {item.song?.artworkUrl ? (
                        <img src={getImageUrl(item.song.artworkUrl)} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <Music2 className="h-8 w-8 text-slate-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-900 truncate">{item.song?.title ?? 'Song'}</p>
                      {item.song?.artist && <p className="text-sm text-slate-600 truncate">{item.song.artist}</p>}
                      <p className="text-sky-600 font-medium">{formatPriceLocal(item.song?.price ?? 0, 'ZAR')} each</p>
                    </div>
                    <p className="font-semibold text-slate-900 w-24 text-right">
                      {formatPriceLocal(item.lineTotal, 'ZAR')}
                    </p>
                    <button
                      type="button"
                      onClick={() => removeMusic(item.songId)}
                      disabled={updating === item.songId}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                      aria-label="Remove"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="bg-white/90 backdrop-blur rounded-2xl border border-slate-100 p-6">
                <div className="flex flex-col gap-2 mb-4">
                  <div className="flex justify-between text-slate-600">
                    <span>Subtotal ({items.length + musicItems.length} item{(items.length + musicItems.length) !== 1 ? 's' : ''})</span>
                    <span className="font-medium text-slate-900">
                      {items.some((i) => i.product?.currency === 'USD') ? formatInLocal(subtotal) : formatPriceLocal(subtotal, 'ZAR')}
                    </span>
                  </div>
                  {quoteLoading ? (
                    <div className="flex justify-between text-slate-500 text-sm">Calculating shipping...</div>
                  ) : quote && quote.shipping > 0 ? (
                    <div className="flex justify-between text-slate-600">
                      <span>Shipping</span>
                      <span className="font-medium text-slate-900">{formatPriceLocal(quote.shipping, 'ZAR')}</span>
                    </div>
                  ) : quote && quote.shipping === 0 ? (
                    <div className="flex justify-between text-slate-600">
                      <span>Shipping</span>
                      <span className="font-medium text-slate-900">R 0</span>
                    </div>
                  ) : null}
                  {quote && (
                    <div className="flex justify-between text-base font-bold text-slate-900 pt-2 border-t border-slate-200">
                      <span>Total</span>
                      <span>{formatPriceLocal(quote.total, 'ZAR')}</span>
                    </div>
                  )}
                </div>
                <div className="flex flex-col sm:flex-row gap-2 items-center">
                  <Link
                    href="/checkout"
                    className="inline-flex items-center gap-2 bg-sky-600 text-white px-6 py-3 rounded-xl hover:bg-sky-700 font-medium"
                  >
                    Proceed to checkout
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
              <p className="mt-4 text-center text-sm text-slate-500">
                Need help? <Link href="/support?category=products:cart" className="text-sky-600 hover:underline">Contact support</Link>
              </p>
            </>
          )}
          </main>
          <AdvertSlot belowHeader />
        </div>
      </div>
      <MobileBottomNav cartCount={cartCount} hasStore={hasStore} />
    </div>
  );
}

export default function CartPage() {
  return (
    <ProtectedRoute>
      <CartPageContent />
    </ProtectedRoute>
  );
}
