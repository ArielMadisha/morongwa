'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Headphones, Mic } from 'lucide-react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';

function randomRoomId(): string {
  return `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function AudioRoomsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [joinCode, setJoinCode] = useState('');
  const myId = user?._id || user?.id ? String(user._id || user.id) : '';

  const shareHint = useMemo(() => 'Share the room code — rooms are ephemeral (no directory yet).', []);

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-lg px-4 py-8">
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2 mb-2">
            <Headphones className="h-7 w-7 text-violet-600" />
            Audio Rooms
          </h1>
          <p className="text-slate-600 mb-8">{shareHint}</p>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4 mb-6">
            <h2 className="font-semibold text-slate-900">Start a room</h2>
            <button
              type="button"
              onClick={() => {
                const id = randomRoomId();
                router.push(`/audio-rooms/${id}?role=host`);
              }}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-white font-semibold hover:bg-violet-500"
            >
              <Mic className="h-5 w-5" />
              Start (host)
            </button>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
            <h2 className="font-semibold text-slate-900">Join with code</h2>
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.trim())}
              placeholder="Room code"
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={!joinCode}
                onClick={() => router.push(`/audio-rooms/${encodeURIComponent(joinCode)}?role=listener`)}
                className="flex-1 rounded-xl bg-slate-800 px-4 py-2.5 text-white font-semibold disabled:opacity-50"
              >
                Listen
              </button>
              <button
                type="button"
                disabled={!joinCode}
                onClick={() => router.push(`/audio-rooms/${encodeURIComponent(joinCode)}?role=speaker`)}
                className="flex-1 rounded-xl bg-sky-600 px-4 py-2.5 text-white font-semibold disabled:opacity-50"
              >
                Speak
              </button>
            </div>
            {myId ? (
              <p className="text-xs text-slate-500">Signed in as host id {myId.slice(0, 8)}…</p>
            ) : null}
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}

export default AudioRoomsPage;
