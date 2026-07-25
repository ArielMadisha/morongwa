'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, Radio, Video } from 'lucide-react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import { livekitAPI, tvAPI, usersAPI } from '@/lib/api';
import { userPublicDisplayName } from '@/lib/userDisplayLabel';

type LiveUser = {
  _id?: string;
  id?: string;
  name?: string;
  username?: string;
  isLive?: boolean;
  avatar?: string;
};

function LiveRoomsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [liveUsers, setLiveUsers] = useState<LiveUser[]>([]);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [goingLive, setGoingLive] = useState(false);

  const myId = user?._id || user?.id ? String(user._id || user.id) : '';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [cfg, statuses] = await Promise.all([
          livekitAPI.getConfig().catch(() => null),
          tvAPI.getStatuses().catch(() => null),
        ]);
        if (cancelled) return;
        setConfigured(Boolean(cfg?.data?.data?.configured));
        const rows = (statuses?.data?.data || statuses?.data || []) as Array<{
          user?: LiveUser;
          isLive?: boolean;
        }>;
        const fromStatuses = rows
          .map((r) => r.user)
          .filter((u): u is LiveUser => Boolean(u && (u.isLive || r.isLive)));
        // Also include explicit isLive from status items themselves when nested differently
        setLiveUsers(fromStatuses.length ? fromStatuses : []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const goLive = async () => {
    if (!myId) return;
    setGoingLive(true);
    try {
      await usersAPI.toggleLive(myId);
      router.push(`/live/${myId}?host=1`);
    } catch (e) {
      console.error(e);
      setGoingLive(false);
    }
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-3xl px-4 py-8">
          <div className="flex items-center justify-between gap-4 mb-8">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                <Radio className="h-7 w-7 text-rose-500" />
                Live Rooms
              </h1>
              <p className="text-slate-600 mt-1">Host a live video room or watch someone who is live.</p>
            </div>
            <button
              type="button"
              onClick={() => void goLive()}
              disabled={goingLive || configured === false}
              className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-white font-semibold hover:bg-rose-500 disabled:opacity-50"
            >
              {goingLive ? <Loader2 className="h-5 w-5 animate-spin" /> : <Video className="h-5 w-5" />}
              Go Live
            </button>
          </div>

          {configured === false ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900 text-sm mb-6">
              LiveKit is not configured on the API yet. Deploy backend env (`LIVEKIT_*`) and restart.
            </div>
          ) : null}

          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
            </div>
          ) : liveUsers.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
              Nobody is live right now. Be the first — hit Go Live.
            </div>
          ) : (
            <ul className="space-y-3">
              {liveUsers.map((u) => {
                const id = String(u._id || u.id || '');
                if (!id) return null;
                return (
                  <li key={id}>
                    <Link
                      href={`/live/${id}`}
                      className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 hover:border-sky-300 hover:shadow-sm"
                    >
                      <span className="font-medium text-slate-900">{userPublicDisplayName(u)}</span>
                      <span className="text-xs font-bold uppercase tracking-wide text-rose-600">Live</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}

export default LiveRoomsPage;
