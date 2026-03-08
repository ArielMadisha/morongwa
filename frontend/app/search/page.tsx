'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Search, Package, Loader2, ShoppingCart, User, Video, Wrench } from 'lucide-react';
import { productsAPI, usersAPI, tvAPI, getImageUrl } from '@/lib/api';
import type { Product } from '@/lib/types';
import { useAuth } from '@/contexts/AuthContext';
import { useCartAndStores } from '@/lib/useCartAndStores';
import { AppSidebar, AppSidebarMenuButton } from '@/components/AppSidebar';
import { AdvertSlot } from '@/components/AdvertSlot';
import { MobileBottomNav } from '@/components/MobileBottomNav';

function formatPrice(price: number, currency: string) {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: currency || 'ZAR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);
}

function SearchContent() {
  const { user } = useAuth();
  const router = useRouter();
  const { cartCount, hasStore } = useCartAndStores(!!user);
  const [menuOpen, setMenuOpen] = useState(false);
  const searchParams = useSearchParams();
  const qParam = searchParams.get('q') || '';
  const [q, setQ] = useState(qParam);
  const [products, setProducts] = useState<Product[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [videos, setVideos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [mcgyverOpen, setMcgyverOpen] = useState(false);

  useEffect(() => {
    setQ(qParam);
  }, [qParam]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (q.trim()) {
      router.push(`/search?q=${encodeURIComponent(q.trim())}`);
    }
  };

  useEffect(() => {
    if (q.length >= 2) {
      setLoading(true);
      Promise.all([
        productsAPI.list({ limit: 20, q }).then((res) => {
          const list = res.data?.data ?? res.data ?? [];
          return Array.isArray(list) ? list : [];
        }).catch(() => []),
        user ? usersAPI.list({ limit: 15, q }).then((res) => {
          const list = res.data?.users ?? res.data ?? [];
          return Array.isArray(list) ? list : [];
        }).catch(() => []) : Promise.resolve([]),
        tvAPI.getFeed({ limit: 15, q, type: 'video' }).then((res) => {
          const list = res.data?.data ?? res.data ?? [];
          return Array.isArray(list) ? list : [];
        }).catch(() => []),
      ]).then(([prods, usrs, vids]) => {
        setProducts(prods);
        setUsers(usrs);
        setVideos(vids);
      }).finally(() => setLoading(false));
    } else {
      setProducts([]);
      setUsers([]);
      setVideos([]);
      setLoading(false);
    }
  }, [q, user]);

  const hasResults = products.length > 0 || users.length > 0 || videos.length > 0;
  const homeLink = user ? '/wall' : '/';

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-sky-50 via-blue-50 to-white text-slate-900">
      <header className="sticky top-0 z-40 w-full bg-white/95 backdrop-blur-md border-b border-slate-100 shadow-sm flex-shrink-0">
        <div className="px-4 sm:px-6 lg:px-8 py-3 sm:py-4">
          <div className="flex items-center justify-between gap-3 sm:gap-4 min-w-0">
            <Link href={homeLink} className="shrink-0 flex items-center" aria-label="Home">
              <img src="/qwertymates-logo-icon.png" alt="Qwertymates" className="h-9 w-9 object-contain lg:hidden" />
              <img src="/qwertymates-logo.png" alt="Qwertymates" className="h-9 w-auto object-contain hidden lg:block" />
            </Link>
            {user && <AppSidebarMenuButton onClick={() => setMenuOpen(true)} />}
            <form onSubmit={handleSearch} className="flex-1 flex items-center gap-2 min-w-0 max-w-md mx-2">
              <Search className="h-5 w-5 text-slate-400 shrink-0" />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Ask McGyver"
                className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
              />
              <button
                type="submit"
                className="shrink-0 p-2 rounded-lg bg-sky-500 text-white hover:bg-sky-600 transition-colors"
                aria-label="Search"
              >
                <Search className="h-5 w-5" />
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {user && (
          <AppSidebar
            variant="wall"
            userName={user?.name}
            userAvatar={(user as any)?.avatar}
            userId={user?._id || user?.id}
            cartCount={cartCount}
            hasStore={hasStore}
            onLogout={() => {}}
            menuOpen={menuOpen}
            setMenuOpen={setMenuOpen}
            hideLogo
            belowHeader
          />
        )}
        <div className="flex-1 flex gap-0 min-h-0 overflow-y-auto overflow-x-hidden">
          <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-6 pb-24 lg:pb-6">
            {q.length < 2 ? (
              <div className="rounded-2xl border border-slate-200 bg-white/90 p-12 text-center">
                <Search className="h-16 w-16 text-slate-300 mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-slate-700 mb-2">Ask McGyver Anything</h2>
                <p className="text-slate-600 mb-6">Search products, users, videos, and more on Qwertymates.</p>
                <Link
                  href="/marketplace"
                  className="inline-flex items-center gap-2 text-sky-600 hover:text-sky-700 font-medium"
                >
                  Browse marketplace
                </Link>
              </div>
            ) : loading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-10 w-10 text-sky-500 animate-spin" />
              </div>
            ) : !hasResults ? (
              <div className="rounded-2xl border border-slate-200 bg-white/90 p-12 text-center">
                <Package className="h-16 w-16 text-slate-300 mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-slate-700 mb-2">No results for &quot;{q}&quot;</h2>
                <p className="text-slate-600 mb-6">Try different keywords or ask McGyver for help finding what you need.</p>
                <button
                  onClick={() => setMcgyverOpen(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 text-white font-medium hover:bg-amber-600 transition-colors"
                >
                  <Wrench className="h-5 w-5" />
                  Ask McGyver
                </button>
              </div>
            ) : (
              <>
                <p className="text-slate-600 mb-6">
                  Results for &quot;{q}&quot;
                </p>

                {users.length > 0 && (
                  <section className="mb-8">
                    <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                      <User className="h-5 w-5" /> Users ({users.length})
                    </h3>
                    <div className="flex flex-wrap gap-3">
                      {users.map((u) => (
                        <Link
                          key={u._id}
                          href={`/user/${u._id}`}
                          className="flex items-center gap-3 p-3 rounded-xl bg-white border border-slate-100 hover:border-sky-200 hover:shadow-md transition-all"
                        >
                          <div className="h-12 w-12 rounded-full bg-slate-200 overflow-hidden flex-shrink-0">
                            {u.avatar ? (
                              <img src={getImageUrl(u.avatar)} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-slate-600 font-bold">
                                {(u.name || '?')[0]}
                              </div>
                            )}
                          </div>
                          <div>
                            <p className="font-medium text-slate-900">{u.name || 'Unknown'}</p>
                            {u.username && <p className="text-sm text-slate-500">@{u.username}</p>}
                          </div>
                        </Link>
                      ))}
                    </div>
                  </section>
                )}

                {videos.length > 0 && (
                  <section className="mb-8">
                    <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                      <Video className="h-5 w-5" /> Videos ({videos.length})
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                      {videos.map((v) => (
                        <Link
                          key={v._id}
                          href={`/morongwa-tv`}
                          className="block rounded-xl overflow-hidden bg-white border border-slate-100 hover:border-sky-200 hover:shadow-md transition-all"
                        >
                          <div className="aspect-video bg-slate-800">
                            {v.mediaUrls?.[0] ? (
                              <video src={getImageUrl(v.mediaUrls[0])} className="w-full h-full object-cover" muted />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Video className="h-12 w-12 text-slate-500" />
                              </div>
                            )}
                          </div>
                          <p className="p-2 text-sm text-slate-700 truncate">{v.caption || 'Video'}</p>
                        </Link>
                      ))}
                    </div>
                  </section>
                )}

                {products.length > 0 && (
                  <section>
                    <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                      <Package className="h-5 w-5" /> Products ({products.length})
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                      {products.map((p) => {
                        const outOfStock = (p as any).outOfStock || (p.stock != null && p.stock < 1);
                        const allowResell = (p as any).allowResell ?? false;
                        const cartHref = `/marketplace/product/${p._id}`;
                        const resellHref = `/marketplace/product/${p._id}?view=resell`;
                        const price = p.discountPrice != null && p.discountPrice < p.price ? p.discountPrice : p.price;
                        return (
                          <div
                            key={p._id}
                            className="group relative bg-white/90 backdrop-blur rounded-2xl border border-slate-100 overflow-hidden shadow-sm hover:shadow-lg hover:border-sky-200 transition-all"
                          >
                            {outOfStock && (
                              <span className="absolute top-2 right-2 z-10 px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
                                Out of stock
                              </span>
                            )}
                            <Link href={cartHref} className="block">
                              <div className="aspect-square bg-slate-100 flex items-center justify-center">
                                {p.images?.[0] ? (
                                  <img
                                    src={getImageUrl(p.images[0])}
                                    alt={p.title}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <Package className="h-16 w-16 text-slate-300" />
                                )}
                              </div>
                              <h3 className="px-4 pt-4 font-semibold text-slate-900 group-hover:text-sky-700 truncate">
                                {p.title}
                              </h3>
                            </Link>
                            <div className="px-4 pb-4 flex items-center justify-between gap-2">
                              <span className="text-lg font-bold text-sky-600">
                                {formatPrice(price, p.currency || 'ZAR')}
                              </span>
                              <div className="flex gap-2 shrink-0">
                                {allowResell && (
                                  <Link
                                    href={resellHref}
                                    className="px-2.5 py-1 rounded-lg text-sm font-medium bg-sky-100 text-sky-700 hover:bg-sky-600 hover:text-white transition-colors"
                                  >
                                    Resell
                                  </Link>
                                )}
                                <Link
                                  href={cartHref}
                                  className="p-1.5 rounded-lg text-slate-600 hover:bg-sky-100 hover:text-sky-700 transition-colors"
                                >
                                  <ShoppingCart className="h-5 w-5" />
                                </Link>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                )}

                {hasResults && (
                  <div className="mt-8 p-4 rounded-xl bg-amber-50 border border-amber-200">
                    <p className="text-sm text-amber-800 mb-2">Still can&apos;t find what you need?</p>
                    <button
                      onClick={() => setMcgyverOpen(true)}
                      className="inline-flex items-center gap-2 text-amber-700 font-medium hover:text-amber-900"
                    >
                      <Wrench className="h-4 w-4" /> Ask McGyver for help
                    </button>
                  </div>
                )}
              </>
            )}
          </main>
          <AdvertSlot belowHeader />
        </div>
      </div>
      {user && <MobileBottomNav cartCount={cartCount} hasStore={hasStore} />}

      {/* McGyver AI panel (placeholder - full implementation coming) */}
      {mcgyverOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMcgyverOpen(false)} aria-hidden="true" />
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[80vh] overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                <Wrench className="h-5 w-5 text-amber-500" /> Ask McGyver
              </h3>
              <button onClick={() => setMcgyverOpen(false)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-600">
                ×
              </button>
            </div>
            <div className="p-6 text-slate-600">
              <p className="mb-4">
                McGyver is your AI assistant for Qwertymates. When you can&apos;t find a product, user, or content on the site, McGyver will guide you.
              </p>
              <p className="text-sm text-slate-500">
                Full chat capabilities are coming soon. McGyver will help you discover alternatives, suggest where to look, and answer questions about the platform.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-10 w-10 text-sky-500 animate-spin" />
      </div>
    }>
      <SearchContent />
    </Suspense>
  );
}
