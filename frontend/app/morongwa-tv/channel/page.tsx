'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { ArrowLeft, Tv } from 'lucide-react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { TvLinearChannelStrip } from '@/components/tv/TvLinearChannelStrip';

function ChannelPageContent() {
  return (
    <div className="min-h-screen bg-black text-white">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-white/10 bg-black/90 px-4 py-3 backdrop-blur">
        <Link
          href="/morongwa-tv"
          className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-sm font-medium text-white hover:bg-white/10"
        >
          <ArrowLeft className="h-4 w-4" />
          QwertyTV
        </Link>
        <div className="flex items-center gap-2 text-sm text-slate-300">
          <Tv className="h-4 w-4 text-sky-400" />
          Platform channel
        </div>
        <Link href="/admin/tv-channel" className="text-xs text-slate-500 hover:text-slate-300">
          Admin
        </Link>
      </header>
      <div className="mx-auto max-w-5xl px-3 py-6">
        <TvLinearChannelStrip />
        <p className="mt-4 text-center text-xs text-slate-500">
          This feed follows the admin linear schedule (VOD). User livestreams (RTMP) stay under Live streaming in admin.
        </p>
      </div>
    </div>
  );
}

export default function MorongwaTvChannelPage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={<div className="min-h-screen bg-black" />}>
        <ChannelPageContent />
      </Suspense>
    </ProtectedRoute>
  );
}
