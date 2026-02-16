'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Tv, Radio, User } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useCartAndStores } from '@/lib/useCartAndStores';
import { AppSidebar, AppSidebarMenuButton } from '@/components/AppSidebar';
import { ProfileDropdown } from '@/components/ProfileDropdown';
import { FollowButton } from '@/components/FollowButton';
import { AdvertSlot } from '@/components/AdvertSlot';
import { tvAPI } from '@/lib/api';
import { getImageUrl } from '@/lib/api';

function LiveTVPageContent() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [liveUsers, setLiveUsers] = useState<Array<{ userId: string; name?: string; avatar?: string }>>([]);
  const [loading, setLoading] = useState(true);
  const { cartCount, hasStore } = useCartAndStores(!!user);

  const loadLiveUsers = useCallback(() => {
    setLoading(true);
    tvAPI
      .getStatuses()
      .then((res) => {
        const statuses = res.data?.data ?? res.data ?? [];
        const live = Array.isArray(statuses)
          ? statuses.filter((s: any) => s.isLive).map((s: any) => ({
              userId: String(s.userId?._id ?? s.userId),
              name: s.name,
              avatar: s.avatar,
            }))
          : [];
        setLiveUsers(live);
      })
      .catch(() => setLiveUsers([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadLiveUsers();
  }, [loadLiveUsers]);

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-blue-50 to-white text-slate-900 flex">
      <AppSidebar
        variant="wall"
        userName={user?.name}
        cartCount={cartCount}
        hasStore={hasStore}
        onLogout={handleLogout}
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
      />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="bg-white/85 backdrop-blur-md border-b border-slate-100 shadow-sm flex-shrink-0">
          <div className="px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <AppSidebarMenuButton onClick={() => setMenuOpen(true)} />
                <Link href="/morongwa-tv" className="flex items-center gap-2 text-slate-600 hover:text-slate-900">
                  <Tv className="h-5 w-5" />
                  <span className="text-sm font-medium">Back to MorongwaTV</span>
                </Link>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-100 text-sky-700 font-medium">
                <Radio className="h-5 w-5" />
                Live TV
              </div>
              <ProfileDropdown userName={user?.name} />
            </div>
          </div>
        </header>

        <div className="flex-1 flex gap-6 min-h-0 overflow-hidden">
          <main className="flex-1 min-w-0 overflow-y-auto px-4 sm:px-6 lg:px-8 py-8">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-24">
                <Radio className="h-12 w-12 text-sky-500 animate-pulse mb-4" />
                <p className="text-slate-600">Checking for live streams...</p>
              </div>
            ) : liveUsers.length > 0 ? (
              <div>
                <h2 className="text-xl font-semibold text-slate-800 mb-4 flex items-center gap-2">
                  <span className="inline-flex h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                  Live now ({liveUsers.length})
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {liveUsers.map((u) => (
                    <div
                      key={u.userId}
                      className="rounded-2xl border-2 border-red-200 bg-white shadow-lg overflow-hidden hover:border-red-400 hover:shadow-xl transition-all"
                    >
                      <Link href="/morongwa-tv" className="block">
                        <div className="aspect-video bg-slate-900 relative flex items-center justify-center">
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="h-24 w-24 rounded-full bg-sky-100 border-4 border-red-400 flex items-center justify-center overflow-hidden">
                              {u.avatar ? (
                                <img src={getImageUrl(u.avatar)} alt="" className="h-full w-full object-cover" />
                              ) : (
                                <User className="h-12 w-12 text-sky-600" />
                              )}
                            </div>
                          </div>
                          <span className="absolute top-3 left-3 px-2 py-1 rounded-lg bg-red-500 text-white text-xs font-bold flex items-center gap-1">
                            <span className="inline-flex h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                            LIVE
                          </span>
                        </div>
                        <div className="p-4">
                          <p className="font-semibold text-slate-900 truncate">{u.name || 'User'}</p>
                          <p className="text-sm text-slate-500">Click to view</p>
                        </div>
                      </Link>
                      <div className="px-4 pb-4">
                        <FollowButton targetUserId={u.userId} currentUserId={user?._id || user?.id} className="w-full justify-center" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-100 bg-white/90 backdrop-blur p-16 text-center max-w-lg mx-auto">
                <Radio className="h-20 w-20 text-slate-300 mx-auto mb-6" />
                <h2 className="text-2xl font-semibold text-slate-700 mb-2">No live streams at the moment</h2>
                <p className="text-slate-600 mb-8">
                  When someone goes live, they will appear here. Be the first to go live from the Create menu.
                </p>
                <Link
                  href="/morongwa-tv"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-sky-500 text-white font-medium hover:bg-sky-600 transition-colors"
                >
                  <Tv className="h-5 w-5" />
                  Back to MorongwaTV
                </Link>
              </div>
            )}
          </main>
          <AdvertSlot />
        </div>
      </div>
    </div>
  );
}

export default function LiveTVPage() {
  return (
    <ProtectedRoute>
      <LiveTVPageContent />
    </ProtectedRoute>
  );
}
