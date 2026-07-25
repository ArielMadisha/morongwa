'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { Loader2, PhoneOff } from 'lucide-react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { AudioStage } from '@/components/livekit/AudioStage';
import { livekitAPI } from '@/lib/api';

function AudioRoomPage() {
  const params = useParams();
  const search = useSearchParams();
  const router = useRouter();
  const roomId = String(params?.roomId || '');
  const roleParam = String(search.get('role') || 'listener').toLowerCase();
  const role =
    roleParam === 'host' ? 'host' : roleParam === 'speaker' ? 'speaker' : 'listener';

  const [token, setToken] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!roomId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await livekitAPI.getAudioToken({ roomId, role });
        if (cancelled) return;
        setToken(res.data.data.token);
        setUrl(res.data.data.url);
      } catch (e) {
        console.error(e);
        toast.error('Could not join audio room');
        router.push('/audio-rooms');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [role, roomId, router]);

  const canSpeak = role === 'host' || role === 'speaker';

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-2xl px-4 py-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-lg font-semibold text-slate-900">Audio room</h1>
              <p className="text-sm text-slate-500">
                Code: <span className="font-mono">{roomId}</span> · {role}
              </p>
            </div>
            <button
              type="button"
              onClick={() => router.push('/audio-rooms')}
              className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white"
            >
              <PhoneOff className="h-4 w-4" />
              Leave
            </button>
          </div>
          {loading || !token || !url ? (
            <div className="flex justify-center py-24">
              <Loader2 className="h-10 w-10 animate-spin text-violet-600" />
            </div>
          ) : (
            <AudioStage
              token={token}
              serverUrl={url}
              canSpeak={canSpeak}
              onDisconnected={() => router.push('/audio-rooms')}
            />
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}

export default AudioRoomPage;
