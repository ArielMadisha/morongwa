'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { Loader2, PhoneOff } from 'lucide-react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { LiveStage } from '@/components/livekit/LiveStage';
import { useAuth } from '@/contexts/AuthContext';
import { livekitAPI } from '@/lib/api';

function QwertzLiveRoomPage() {
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
        const res = await livekitAPI.getQwertzToken(
          asHost ? { asHost: true } : { hostUserId: hostId }
        );
        if (cancelled) return;
        setToken(res.data.data.token);
        setUrl(res.data.data.url);
      } catch (e) {
        console.error(e);
        toast.error('Could not join Qwertz Live');
        router.push('/qwertz/live');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [asHost, hostId, myId, router]);

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-black text-white">
        <div className="mx-auto max-w-md px-2 py-4">
          <div className="flex items-center justify-between mb-3 px-2">
            <h1 className="text-sm font-semibold tracking-wide uppercase text-fuchsia-300">
              Qwertz Live
            </h1>
            <button
              type="button"
              onClick={() => router.push('/qwertz/live')}
              className="inline-flex items-center gap-1.5 rounded-full bg-rose-600 px-3 py-1.5 text-xs font-semibold"
            >
              <PhoneOff className="h-3.5 w-3.5" />
              {asHost ? 'End' : 'Leave'}
            </button>
          </div>
          {loading || !token || !url ? (
            <div className="flex justify-center py-24">
              <Loader2 className="h-10 w-10 animate-spin text-fuchsia-400" />
            </div>
          ) : (
            <LiveStage
              token={token}
              serverUrl={url}
              asHost={asHost}
              portrait
              onDisconnected={() => router.push('/qwertz/live')}
            />
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}

export default QwertzLiveRoomPage;
