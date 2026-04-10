'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Search, Package, Loader2, ShoppingCart, User, Video, Wrench, Music } from 'lucide-react';
import { productsAPI, usersAPI, tvAPI, musicAPI, followsAPI, macgyverAPI, getImageUrl } from '@/lib/api';
import type { Product } from '@/lib/types';
import { useAuth } from '@/contexts/AuthContext';
import { useCartAndStores } from '@/lib/useCartAndStores';
import { AppSidebar, AppSidebarMenuButton } from '@/components/AppSidebar';
import { AdvertSlot } from '@/components/AdvertSlot';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { ProfileHeaderButton } from '@/components/ProfileHeaderButton';
import { formatCurrencyAmount } from '@/lib/formatCurrency';

function formatPrice(price: number, currency: string) {
  return formatCurrencyAmount(price, currency || 'ZAR');
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
  const [tvPosts, setTvPosts] = useState<any[]>([]);
  const [musicResults, setMusicResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [macgyverOpen, setMacgyverOpen] = useState(false);
  const [macgyverQuery, setMacgyverQuery] = useState('');
  const [macgyverResponse, setMacgyverResponse] = useState<string | null>(null);
  const [macgyverLoading, setMacgyverLoading] = useState(false);

  useEffect(() => {
    setQ(qParam);
  }, [qParam]);

  useEffect(() => {
    if (searchParams.get('macgyver') === '1') {
      setMacgyverQuery(qParam || '');
      setQ(qParam || '');
      setMacgyverOpen(true);
    }
  }, [searchParams, qParam]);

  useEffect(() => {
    if (macgyverOpen) setMacgyverQuery(q);
  }, [q, macgyverOpen]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (q.trim()) {
      router.push(`/search?q=${encodeURIComponent(q.trim())}`);
    }
  };

  useEffect(() => {
    const search = q.trim().toLowerCase();
    if (search.length >= 1) {
      let cancelled = false;
      const timer = setTimeout(() => {
        setLoading(true);
        Promise.all([
          productsAPI
            .list({ limit: 40, q: search })
            .then((res) => {
              const list = res.data?.data ?? res.data ?? [];
              return Array.isArray(list) ? list : [];
            })
            .catch(() => []),
          Promise.all([
            usersAPI
              .list({ limit: 40, q: search })
              .then((res) => {
                const list = res.data?.data?.users ?? res.data?.users ?? res.data?.data ?? res.data ?? [];
                return Array.isArray(list) ? list : [];
              })
              .catch(() => []),
            user
              ? followsAPI
                  .getSuggested({ limit: 20, q: search })
                  .then((res) => res.data?.data ?? [])
                  .catch(() => [])
              : Promise.resolve([]),
          ]).then(([mainUsers, suggested]) => {
            const seen = new Set<string>();
            const merged: any[] = [];
            for (const u of mainUsers as any[]) {
              const id = u._id?._id ?? u._id ?? u.id;
              if (id && !seen.has(id)) {
                seen.add(id);
                merged.push(u);
              }
            }
            for (const u of suggested as any[]) {
              const id = u._id?._id ?? u._id ?? u.id;
              if (id && !seen.has(id)) {
                seen.add(id);
                merged.push(u);
              }
            }
            return merged;
          }),
          tvAPI
            .getFeed({ limit: 40, q: search, sort: 'newest' })
            .then((res) => {
              const list = res.data?.data ?? res.data ?? [];
              return Array.isArray(list) ? list : [];
            })
            .catch(() => []),
          musicAPI
            .getSongs()
            .then((res) => {
              const list = res.data?.data ?? [];
              if (!Array.isArray(list)) return [];
              const ranked = list
                .map((item) => {
                  const haystack = [
                    item?.title,
                    item?.artist,
                    item?.genre,
                    item?.lyrics,
                    item?.songwriters,
                    item?.producer,
                  ]
                    .filter(Boolean)
                    .join(' ')
                    .toLowerCase();
                  const starts = (
                    String(item?.title || '').toLowerCase().startsWith(search) ||
                    String(item?.artist || '').toLowerCase().startsWith(search) ||
                    String(item?.genre || '').toLowerCase().startsWith(search)
                  );
                  const includes = haystack.includes(search);
                  return { item, score: starts ? 2 : includes ? 1 : 0 };
                })
                .filter((entry) => entry.score > 0)
                .sort((a, b) => b.score - a.score)
                .map((entry) => entry.item);
              return ranked.slice(0, 40);
            })
            .catch(() => []),
        ])
          .then(([prods, usrs, posts, music]) => {
            if (cancelled) return;
            setProducts(prods);
            setUsers(usrs);
            setTvPosts(posts);
            setMusicResults(music);
          })
          .finally(() => {
            if (!cancelled) setLoading(false);
          });
      }, 180);
      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    } else {
      setProducts([]);
      setUsers([]);
      setTvPosts([]);
      setMusicResults([]);
      setLoading(false);
    }
  }, [q, user]);

  const hasResults = products.length > 0 || users.length > 0 || tvPosts.length > 0 || musicResults.length > 0;
  const homeLink = user ? '/wall' : '/';

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-sky-50 via-blue-50 to-white text-slate-900">
      <header className="sticky top-0 z-40 w-full bg-white/95 backdrop-blur-md border-b border-slate-100 shadow-sm flex-shrink-0">
        <div className="px-4 sm:px-6 lg:px-8 py-3 sm:py-4">
          <div className="flex items-center justify-between gap-3 sm:gap-4 min-w-0">
            <Link href={homeLink} className="shrink-0 flex items-center" aria-label="Home">
              <img src="/qwertymates-logo-icon.png" alt="Qwertymates" className="h-16 w-16 sm:h-[4.25rem] sm:w-[4.25rem] object-contain lg:hidden shrink-0" />
              <img src="/qwertymates-logo.png" alt="Qwertymates" className="h-9 w-auto object-contain hidden lg:block" />
            </Link>
            {user && <AppSidebarMenuButton onClick={() => setMenuOpen((v) => !v)} />}
            <form onSubmit={handleSearch} className="flex-1 flex items-center gap-2 min-w-0 max-w-md mx-2">
              <Search className="h-5 w-5 text-slate-400 shrink-0" />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Ask MacGyver"
                className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
              />
            </form>
            <div className="shrink-0 flex items-center gap-2">
              <ProfileHeaderButton />
            </div>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 min-w-0 w-full flex-1">
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
        <div className="flex-1 flex flex-col lg:flex-row gap-0 min-h-0 overflow-y-auto overflow-x-hidden">
          <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-6 pb-24 lg:pb-6 order-2 lg:order-none w-full">
            {q.trim().length < 1 ? (
              <div className="rounded-2xl border border-slate-200 bg-white/90 p-12 text-center">
                <Search className="h-16 w-16 text-slate-300 mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-slate-700 mb-2">Ask MacGyver Anything</h2>
                <p className="text-slate-600 mb-6">Before Internet… there was MacGyver.</p>
              </div>
            ) : loading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-10 w-10 text-sky-500 animate-spin" />
              </div>
            ) : !hasResults ? (
              <div className="rounded-2xl border border-slate-200 bg-white/90 p-12 text-center">
                <Package className="h-16 w-16 text-slate-300 mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-slate-700 mb-2">No results for &quot;{q}&quot;</h2>
                <p className="text-slate-600 mb-6">Try different keywords or ask MacGyver for help finding what you need.</p>
                <button
                  onClick={() => { setMacgyverQuery(q); setMacgyverOpen(true); }}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 text-white font-medium hover:bg-amber-600 transition-colors"
                >
                  <Wrench className="h-5 w-5" />
                  Ask MacGyver
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

                {tvPosts.length > 0 && (
                  <section className="mb-8">
                    <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                      <Video className="h-5 w-5" /> TV Posts & Videos ({tvPosts.length})
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                      {tvPosts.map((v) => (
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

                {musicResults.length > 0 && (
                  <section className="mb-8">
                    <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                      <Music className="h-5 w-5" /> Music & Albums ({musicResults.length})
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {musicResults.map((m) => (
                        <Link
                          key={m._id}
                          href="/qwerty-music"
                          className="rounded-xl border border-slate-100 bg-white p-4 hover:border-sky-200 hover:shadow-md transition-all"
                        >
                          <p className="font-semibold text-slate-900 truncate">{m.title || 'Untitled'}</p>
                          <p className="text-sm text-slate-600 truncate">{m.artist || 'Unknown artist'}</p>
                          <p className="text-xs text-slate-500 mt-1">
                            {(m.type || 'song') === 'album' ? 'Album' : 'Song'}{m.genre ? ` • ${m.genre}` : ''}
                          </p>
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
                      onClick={() => { setMacgyverQuery(q); setMacgyverOpen(true); }}
                      className="inline-flex items-center gap-2 text-amber-700 font-medium hover:text-amber-900"
                    >
                      <Wrench className="h-4 w-4" /> Ask MacGyver for help
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

      {/* MacGyver AI panel */}
      {macgyverOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => { setMacgyverOpen(false); setMacgyverResponse(null); setMacgyverQuery(''); }} aria-hidden="true" />
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between shrink-0">
              <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                <Wrench className="h-5 w-5 text-amber-500" /> Ask MacGyver
              </h3>
              <button onClick={() => { setMacgyverOpen(false); setMacgyverResponse(null); setMacgyverQuery(''); }} className="p-2 rounded-lg hover:bg-slate-100 text-slate-600">
                ×
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 min-h-0">
              {!user ? (
                <p className="text-slate-600">
                  <Link href="/login" className="text-sky-600 hover:underline font-medium">Sign in</Link> to use Ask MacGyver – your AI assistant for Qwertymates and beyond.
                </p>
              ) : (
                <>
                  <p className="text-sm text-slate-500 mb-4">
                    When there's no solution… MacGyver makes one.
                  </p>
                  {macgyverResponse !== null && (
                    <div className="mb-4 p-4 rounded-xl bg-slate-50 border border-slate-100 text-slate-700 whitespace-pre-wrap text-sm leading-relaxed">
                      {macgyverResponse}
                    </div>
                  )}
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const query = macgyverQuery.trim();
                      if (!query || macgyverLoading) return;
                      setMacgyverLoading(true);
                      setMacgyverResponse(null);
                      try {
                        const res = await macgyverAPI.ask(query);
                        const data: any = res.data?.data;
                        if (data?.type === 'search' && data?.query) {
                          setQ(data.query);
                          router.push(`/search?q=${encodeURIComponent(data.query)}`);
                          setMacgyverOpen(false);
                        } else {
                          setMacgyverResponse(data?.text ?? 'No response.');
                        }
                      } catch (err: any) {
                        setMacgyverResponse(err.response?.data?.message || err.message || 'Something went wrong. Try again.');
                      } finally {
                        setMacgyverLoading(false);
                      }
                    }}
                    className="flex gap-2"
                  >
                    <input
                      type="text"
                      value={macgyverQuery}
                      onChange={(e) => {
                        const v = e.target.value;
                        setMacgyverQuery(v);
                        setQ(v);
                        router.replace(`/search?q=${encodeURIComponent(v)}${macgyverOpen ? '&macgyver=1' : ''}`);
                      }}
                      placeholder="Search or ask anything..."
                      disabled={macgyverLoading}
                      className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 disabled:opacity-60"
                    />
                    <button
                      type="submit"
                      disabled={macgyverLoading || !macgyverQuery.trim()}
                      className="px-4 py-2 rounded-lg bg-amber-500 text-white font-medium hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                    >
                      {macgyverLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Ask'}
                    </button>
                  </form>
                  {macgyverQuery.trim().length >= 1 && loading && (
                    <div className="mt-4 flex justify-center py-4">
                      <Loader2 className="h-6 w-6 text-amber-500 animate-spin" />
                    </div>
                  )}
                  {macgyverQuery.trim().length >= 1 && !loading && hasResults && (
                    <div className="mt-4 space-y-4 max-h-64 overflow-y-auto">
                      <p className="text-sm font-medium text-slate-600">Results for &quot;{macgyverQuery.trim()}&quot;</p>
                      {users.length > 0 && (
                        <div>
                          <p className="text-xs text-slate-500 mb-2">Users</p>
                          <div className="space-y-1">
                            {users.slice(0, 5).map((u) => (
                              <Link
                                key={u._id}
                                href={`/user/${u._id}`}
                                onClick={() => setMacgyverOpen(false)}
                                className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors"
                              >
                                <div className="h-10 w-10 rounded-full bg-slate-200 overflow-hidden flex-shrink-0">
                                  {u.avatar ? (
                                    <img src={getImageUrl(u.avatar)} alt="" className="w-full h-full object-cover" />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center text-slate-600 font-bold text-sm">
                                      {(u.name || '?')[0]}
                                    </div>
                                  )}
                                </div>
                                <div>
                                  <p className="font-medium text-slate-900 text-sm">{u.name || 'Unknown'}</p>
                                  {u.username && <p className="text-xs text-slate-500">@{u.username}</p>}
                                </div>
                              </Link>
                            ))}
                          </div>
                        </div>
                      )}
                      {products.length > 0 && (
                        <div>
                          <p className="text-xs text-slate-500 mb-2">Products</p>
                          <div className="space-y-2">
                            {products.slice(0, 3).map((p) => (
                              <Link
                                key={p._id}
                                href={`/marketplace/product/${p._id}`}
                                onClick={() => setMacgyverOpen(false)}
                                className="block p-2 rounded-lg hover:bg-slate-50 transition-colors text-sm font-medium text-slate-700 truncate"
                              >
                                {p.title}
                              </Link>
                            ))}
                          </div>
                        </div>
                      )}
                      {tvPosts.length > 0 && (
                        <div>
                          <p className="text-xs text-slate-500 mb-2">TV Posts</p>
                          <div className="space-y-2">
                            {tvPosts.slice(0, 3).map((v) => (
                              <Link
                                key={v._id}
                                href="/morongwa-tv"
                                onClick={() => setMacgyverOpen(false)}
                                className="block p-2 rounded-lg hover:bg-slate-50 transition-colors text-sm text-slate-700 truncate"
                              >
                                {v.caption || 'Video'}
                              </Link>
                            ))}
                          </div>
                        </div>
                      )}
                      {musicResults.length > 0 && (
                        <div>
                          <p className="text-xs text-slate-500 mb-2">Music</p>
                          <div className="space-y-2">
                            {musicResults.slice(0, 3).map((m) => (
                              <Link
                                key={m._id}
                                href="/qwerty-music"
                                onClick={() => setMacgyverOpen(false)}
                                className="block p-2 rounded-lg hover:bg-slate-50 transition-colors text-sm text-slate-700 truncate"
                              >
                                {m.title} – {m.artist}
                              </Link>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
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
