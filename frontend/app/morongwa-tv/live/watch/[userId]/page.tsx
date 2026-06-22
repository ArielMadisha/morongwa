'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Radio, User } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import { AppSidebar, AppSidebarMenuButton } from '@/components/AppSidebar';
import { MobileHeaderLogo } from '@/components/MobileHeaderLogo';
import { SearchButton } from '@/components/SearchButton';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { useCartAndStores } from '@/lib/useCartAndStores';
import { liveAPI, getImageUrl } from '@/lib/api';
import { LiveHlsPlayer } from '@/components/tv/LiveHlsPlayer';

function WatchLiveContent() {
  const params = useParams();
  const userId = typeof params?.userId === 'string' ? params.userId : '';
  const router = useRouter();
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const { cartCount, hasStore } = useCartAndStores(!!user);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hlsUrl, setHlsUrl] = useState<string | null>(null);
  const [streamKey, setStreamKey] = useState<string | null>(null);
  const [broadcaster, setBroadcaster] = useState<{ name?: string; avatar?: string } | null>(null);
  const sessionId = useMemo(() => {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }
    return `lv_${Date.now()}_${Math.random().toString(36).slice(2, 14)}`;
  }, []);

  const load = useCallback(() => {
    if (!userId) return;
    setLoading(true);
    setError('');
    liveAPI
      .getPlayback(userId)
      .then((res) => {
        const d = res.data?.data;
        setBroadcaster(d?.user ?? null);
        setHlsUrl(d?.isLive && d?.hlsUrl ? d.hlsUrl : null);
        setStreamKey(d?.isLive && d?.streamKey ? String(d.streamKey) : null);
        if (!d?.isLive) setError('');
      })
      .catch((e: any) => {
        setError(e.response?.data?.message || e.message || 'Could not load stream');
        setHlsUrl(null);
      })
      .finally(() => setLoading(false));
  }, [userId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load]);

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-blue-50 to-white text-slate-900 flex">
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
      />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="bg-white/85 backdrop-blur-md border-b border-slate-100 shadow-sm flex-shrink-0">
          <div className="px-4 sm:px-6 lg:px-8 py-3 sm:py-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <MobileHeaderLogo />
              <AppSidebarMenuButton onClick={() => setMenuOpen((v) => !v)} />
              <Link
                href="/morongwa-tv/live"
                className="flex items-center gap-2 text-slate-600 hover:text-slate-900 text-sm font-medium shrink-0"
              >
                <ArrowLeft className="h-4 w-4" />
                Live TV
              </Link>
            </div>
            <SearchButton />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-8 pb-24 lg:pb-8 max-w-4xl mx-auto w-full">
          {loading && !hlsUrl ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-600">
              <Radio className="h-12 w-12 text-sky-500 animate-pulse mb-3" />
              Loading stream…
            </div>
          ) : error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 text-rose-800 p-4 text-sm">{error}</div>
          ) : !hlsUrl ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
              <Radio className="h-16 w-16 text-slate-300 mx-auto mb-4" />
              <h1 className="text-xl font-semibold text-slate-800 mb-2">This creator is not live</h1>
              <p className="text-slate-600 mb-6">They may have ended the stream. Check back later.</p>
              <Link
                href="/morongwa-tv/live"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-sky-500 text-white font-medium hover:bg-sky-600"
              >
                Browse Live TV
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-sky-100 border-2 border-red-400 flex items-center justify-center overflow-hidden shrink-0">
                  {broadcaster?.avatar ? (
                    <img src={getImageUrl(broadcaster.avatar)} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <User className="h-6 w-6 text-sky-600" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 truncate">{broadcaster?.name || 'Live'}</p>
                  <p className="text-xs text-red-600 font-bold flex items-center gap-1">
                    <span className="inline-flex h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                    LIVE
                  </p>
                </div>
              </div>
              <div className="rounded-xl overflow-hidden bg-black shadow-xl border border-slate-200">
                <LiveHlsPlayer
                  src={hlsUrl}
                  className="w-full aspect-video object-contain bg-black"
                  broadcasterUserId={userId}
                  streamKey={streamKey}
                  sessionId={sessionId}
                />
              </div>
              <p className="text-xs text-slate-500">
                If video does not play, the stream may still be starting, or your connection blocks the HLS URL. The
                server must expose HTTPS HLS when you use this site over HTTPS.
              </p>
            </div>
          )}
        </main>
      </div>
      <MobileBottomNav cartCount={cartCount} hasStore={hasStore} />
    </div>
  );
}

export default function WatchLivePage() {
  return (
    <ProtectedRoute>
      <WatchLiveContent />
    </ProtectedRoute>
  );
}
