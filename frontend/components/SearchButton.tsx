'use client';

import Link from 'next/link';
import { Search } from 'lucide-react';

/** Consistent "Ask MacGyver" search button - pill shape, light border, used on every page */
export function SearchButton({ className = '' }: { className?: string }) {
  return (
    <Link
      href="/search"
      className={`flex items-center gap-2 shrink-0 px-4 py-2.5 rounded-full border border-slate-200 bg-white text-slate-400 hover:border-sky-300 hover:bg-sky-50/30 hover:text-slate-500 transition-colors min-w-0 max-w-[200px] sm:max-w-[240px] ${className}`}
      aria-label="Ask MacGyver - Search"
      title="Ask MacGyver - Search"
    >
      <Search className="h-4 w-4 sm:h-[18px] sm:w-[18px] shrink-0" />
      <span className="text-xs sm:text-sm truncate">Ask MacGyver</span>
    </Link>
  );
}
