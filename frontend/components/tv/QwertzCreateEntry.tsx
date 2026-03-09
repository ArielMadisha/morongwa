'use client';

import Link from 'next/link';
import { Sparkles } from 'lucide-react';

export function QwertzCreateEntry({ onClick }: { onClick?: () => void }) {
  return (
    <Link
      href="/morongwa-tv?compose=qwertz"
      onClick={onClick}
      className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors text-slate-700 border-b border-slate-100"
    >
      <Sparkles className="h-4 w-4 text-fuchsia-600 shrink-0" />
      <div className="min-w-0">
        <span className="font-medium block">Create Qwertz</span>
        <span className="text-xs text-slate-500 block mt-0.5">Open short-form vertical video creator</span>
      </div>
    </Link>
  );
}
