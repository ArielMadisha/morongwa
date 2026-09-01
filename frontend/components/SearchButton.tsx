'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { MacGyverImagePicker } from '@/components/MacGyverImagePicker';
import { setPendingMacGyverImage } from '@/lib/macgyverPendingImage';

/** Consistent "Ask MacGyver" search pill — magnifying glass, label, then a small camera for image search. */
export function SearchButton({ className = '' }: { className?: string }) {
  const router = useRouter();

  return (
    <div
      className={`flex cursor-pointer items-center gap-1.5 shrink-0 px-3 py-2 sm:px-4 sm:py-2.5 rounded-full border border-slate-200 bg-white text-slate-400 hover:border-sky-300 hover:bg-sky-50/30 hover:text-slate-500 transition-colors min-w-0 max-w-[220px] sm:max-w-[280px] ${className}`}
    >
      <Link
        href="/search?macgyver=1"
        className="flex items-center gap-2 min-w-0 flex-1"
        aria-label="Ask MacGyver - Search"
        title="Ask MacGyver - Search"
      >
        <Search className="h-4 w-4 sm:h-[18px] sm:w-[18px] shrink-0" />
        <span className="text-xs sm:text-sm truncate">Ask MacGyver</span>
      </Link>
      <MacGyverImagePicker
        onPick={(file) => {
          setPendingMacGyverImage(file);
          router.push('/search?macgyver=1&image=1');
        }}
        className="p-0.5 rounded-full text-slate-400 hover:text-amber-600 hover:bg-amber-50 shrink-0 disabled:opacity-50"
        iconClassName="h-3.5 w-3.5 sm:h-4 sm:w-4"
      />
    </div>
  );
}
