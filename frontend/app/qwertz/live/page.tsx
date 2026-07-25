'use client';

import { useRouter } from 'next/navigation';
import { Clapperboard, Loader2 } from 'lucide-react';
import { useState } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';

function QwertzLiveLandingPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const myId = user?._id || user?.id ? String(user._id || user.id) : '';

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-black text-white">
        <div className="mx-auto max-w-md px-4 py-16 text-center">
          <Clapperboard className="h-14 w-14 mx-auto mb-4 text-fuchsia-400" />
          <h1 className="text-3xl font-bold mb-2">Qwertz Live</h1>
          <p className="text-white/70 mb-10">Vertical live broadcast — TikTok-style portrait stage.</p>
          <button
            type="button"
            disabled={!myId || busy}
            onClick={() => {
              if (!myId) return;
              setBusy(true);
              router.push(`/qwertz/live/${myId}?host=1`);
            }}
            className="w-full rounded-2xl bg-fuchsia-600 py-3.5 font-semibold hover:bg-fuchsia-500 disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
            Go Qwertz Live
          </button>
          <p className="text-xs text-white/50 mt-6">
            Viewers open <code className="text-white/80">/qwertz/live/&lt;hostId&gt;</code>
          </p>
        </div>
      </div>
    </ProtectedRoute>
  );
}

export default QwertzLiveLandingPage;
