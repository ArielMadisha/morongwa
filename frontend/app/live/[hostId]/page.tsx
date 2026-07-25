'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { Loader2, PhoneOff } from 'lucide-react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { LiveStage } from '@/components/livekit/LiveStage';
import { useAuth } from '@/contexts/AuthContext';
import { livekitAPI, usersAPI } from '@/lib/api';

function LiveRoomPage() {
  const { user } = useAuth();
  const params = useParams();
  const search = useSearchParams();
  const router = useRouter();
  const hostId = String(params?.hostId || '');
  const myId = user?._id || user?.id ? String(user._id || user.id) : '';
  const asHost = search.get('host') === '1' || hostId === myId;

  const [token, setToken] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!hostId || !myId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await livekitAPI.getLiveToken(
          asHost ? { asHost: true } : { hostUserId: hostId }
        );
        if (cancelled) return;
        setToken(res.data.data.token);
        setUrl(res.data.data.url);
      } catch (e) {
        console.error(e);
        toast.error('Could not join live room');
        router.push('/live');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [asHost, hostId, myId, router]);

  const leave = async () => {
    if (asHost && myId) {
      try {
        await usersAPI.toggleLive(myId);
      } catch {
        /* ignore */
      }
    }
    router.push('/live');
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-slate-950 text-white">
        <div className="mx-auto max-w-5xl px-4 py-6">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-lg font-semibold">{asHost ? 'You are live' : 'Watching live'}</h1>
            <button
              type="button"
              onClick={() => void leave()}
              className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold"
            >
              <PhoneOff className="h-4 w-4" />
              {asHost ? 'End' : 'Leave'}
            </button>
          </div>
          {loading || !token || !url ? (
            <div className="flex justify-center py-24">
              <Loader2 className="h-10 w-10 animate-spin text-sky-400" />
            </div>
          ) : (
            <LiveStage token={token} serverUrl={url} asHost={asHost} onDisconnected={() => void leave()} />
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}

export default LiveRoomPage;
