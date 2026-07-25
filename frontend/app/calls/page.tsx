'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { Loader2, Phone, Search, Users, Video } from 'lucide-react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { AppShellHeader } from '@/components/AppShellHeader';
import { AppSidebar } from '@/components/AppSidebar';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { ProfileHeaderButton } from '@/components/ProfileHeaderButton';
import { SearchButton } from '@/components/SearchButton';
import { useAuth } from '@/contexts/AuthContext';
import { useWebRTCCall } from '@/contexts/WebRTCCallContext';
import { useCartAndStores } from '@/lib/useCartAndStores';
import { directCallRoomId, groupCallRoomId } from '@/lib/callRoom';
import { messengerAPI } from '@/lib/api';

function CallsPageContent() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [menuOpen, setMenuOpen] = useState(false);
  const { cartCount, hasStore } = useCartAndStores(!!user);
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState<any[]>([]);
  const [searchHits, setSearchHits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Map<string, any>>(new Map());

  const uid = user?._id || user?.id || '';
  const { startOutgoingCall } = useWebRTCCall();

  useEffect(() => {
    if (!uid) return;
    messengerAPI
      .getConversations()
      .then((res) => {
        const list = res.data?.conversations ?? [];
        setRecent(Array.isArray(list) ? list : []);
      })
      .catch(() => setRecent([]))
      .finally(() => setLoading(false));
  }, [uid]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('morongwa.groupParticipants');
      if (!raw) return;
      sessionStorage.removeItem('morongwa.groupParticipants');
      const participants = JSON.parse(raw) as Array<{ _id?: string; id?: string; name?: string; username?: string }>;
      const next = new Map<string, any>();
      for (const u of participants) {
        const id = String(u._id ?? u.id ?? '');
        if (id && id !== uid) next.set(id, u);
      }
      if (next.size > 0) {
        setSelected(next);
        toast.success(`Group ready — ${next.size} participant(s) selected. Choose video or voice to start.`);
      }
    } catch {
      /* ignore */
    }
  }, [uid]);

  useEffect(() => {
    const mode = searchParams.get('mode');
    if (mode === 'video' || mode === 'voice') {
      toast('Select a contact, then tap Video or Voice to call.', { icon: '📞' });
    }
    if (searchParams.get('meeting') === '1') {
      toast('Group meeting — select participants and start a video or voice call.', { icon: '👥' });
    }
  }, [searchParams]);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setSearchHits([]);
      return;
    }
    const id = setTimeout(() => {
      messengerAPI
        .searchUsers(q)
        .then((res) => setSearchHits(res.data?.data ?? []))
        .catch(() => setSearchHits([]));
    }, 220);
    return () => clearTimeout(id);
  }, [query]);

  const list = query.trim()
    ? searchHits.filter((u) => String(u._id ?? u.id) !== uid)
    : recent.map((c) => c.user).filter((u) => u && String(u._id ?? u.id) !== uid);

  const toggleUser = (u: any) => {
    const id = String(u._id ?? u.id ?? '');
    if (!id) return;
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(id)) next.delete(id);
      else next.set(id, u);
      return next;
    });
  };

  const startDirectCall = (u: any, mode: 'voice' | 'video') => {
    const peerId = String(u._id ?? u.id ?? '');
    if (!peerId) return;
    const roomId = directCallRoomId(uid, peerId);
    startOutgoingCall({
      roomId,
      peerUserId: peerId,
      peerUserName: u.name || u.username || 'Contact',
      audioOnly: mode === 'voice',
    });
  };

  const startSelectedCall = (mode: 'voice' | 'video') => {
    const picked = Array.from(selected.values());
    if (picked.length === 0) {
      toast.error('Select at least one person to call');
      return;
    }
    const primary = picked[0];
    const primaryId = String(primary._id ?? primary.id ?? '');
    const ids = picked.map((u) => String(u._id ?? u.id ?? '')).filter(Boolean);
    const roomId =
      ids.length === 1 ? directCallRoomId(uid, primaryId) : groupCallRoomId(uid, ids);
    startOutgoingCall({
      roomId,
      peerUserId: primaryId,
      peerUserName: primary.name || 'Contact',
      audioOnly: mode === 'voice',
    });
  };

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  const selectedCount = selected.size;

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-sky-50 via-blue-50 to-white text-slate-900">
      <AppShellHeader
        onMenuClick={() => setMenuOpen((v) => !v)}
        center={
          <div className="inline-flex cursor-pointer items-center gap-2 select-none" aria-label="Calls">
            <Phone className="h-5 w-5 text-sky-600" />
            <h1 className="text-base sm:text-lg font-semibold">Calls</h1>
          </div>
        }
        actions={
          <>
            <SearchButton />
            <ProfileHeaderButton />
          </>
        }
      />

      <div className="flex min-h-0 flex-1">
        <AppSidebar
          variant="client"
          userName={user?.name}
          userAvatar={(user as any)?.avatar}
          userId={uid}
          cartCount={cartCount}
          hasStore={hasStore}
          onLogout={handleLogout}
          menuOpen={menuOpen}
          setMenuOpen={setMenuOpen}
          hideLogo
          belowHeader
        />

        <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-6 pb-24 md:pb-8">
          <p className="text-sm text-slate-600 mb-4">
            Start a free in-app voice or video call with people from your chats.
          </p>

          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name…"
              className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 py-2.5 text-sm"
            />
          </div>

          {selectedCount > 0 ? (
            <div className="mb-4 flex flex-wrap gap-2 items-center">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                {selectedCount} selected
              </span>
              <button
                type="button"
                onClick={() => startSelectedCall('voice')}
                className="inline-flex cursor-pointer items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700"
              >
                <Phone className="h-4 w-4" /> Voice call
              </button>
              <button
                type="button"
                onClick={() => startSelectedCall('video')}
                className="inline-flex cursor-pointer items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 text-white text-sm font-semibold hover:bg-sky-700"
              >
                <Video className="h-4 w-4" /> Video call
              </button>
            </div>
          ) : null}

          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
            </div>
          ) : list.length === 0 ? (
            <div className="rounded-2xl border border-slate-100 bg-white p-10 text-center">
              <Users className="h-10 w-10 text-slate-300 mx-auto mb-3" />
              <p className="font-semibold text-slate-900">No contacts yet</p>
              <p className="text-sm text-slate-600 mt-1">
                Message someone first, or search by name above.
              </p>
              <Link href="/messages" className="inline-block mt-4 text-sky-600 font-semibold text-sm hover:underline">
                Open Messages →
              </Link>
            </div>
          ) : (
            <ul className="space-y-2">
              {list.map((u: any) => {
                const id = String(u._id ?? u.id ?? '');
                const active = selected.has(id);
                return (
                  <li key={id}>
                    <div
                      className={`flex items-center gap-2 p-3 sm:p-4 rounded-xl border transition ${
                        active ? 'border-sky-400 bg-sky-50' : 'border-slate-100 bg-white hover:border-slate-200'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => toggleUser(u)}
                        className="flex flex-1 min-w-0 cursor-pointer items-center gap-3 text-left"
                      >
                        <div className="w-10 h-10 shrink-0 rounded-full bg-sky-100 flex items-center justify-center text-sky-700 font-bold">
                          {(u.name || '?').slice(0, 1).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-slate-900 truncate">{u.name || 'User'}</p>
                          {u.username ? <p className="text-xs text-slate-500">@{u.username}</p> : null}
                        </div>
                        {active ? <span className="shrink-0 text-sky-600 font-bold pr-1">✓</span> : null}
                      </button>
                      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
                        <button
                          type="button"
                          onClick={() => startDirectCall(u, 'video')}
                          className="cursor-pointer rounded-lg p-2.5 text-sky-600 transition hover:bg-sky-100"
                          aria-label={`Video call ${u.name || 'contact'}`}
                          title="Video call"
                        >
                          <Video className="h-5 w-5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => startDirectCall(u, 'voice')}
                          className="cursor-pointer rounded-lg p-2.5 text-indigo-600 transition hover:bg-indigo-50"
                          aria-label={`Voice call ${u.name || 'contact'}`}
                          title="Voice call"
                        >
                          <Phone className="h-5 w-5" />
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </main>
      </div>

      <MobileBottomNav cartCount={cartCount} />
    </div>
  );
}

export default function CallsPage() {
  return (
    <ProtectedRoute>
      <Suspense
        fallback={
          <div className="min-h-screen flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
          </div>
        }
      >
        <CallsPageContent />
      </Suspense>
    </ProtectedRoute>
  );
}
