'use client';

import Link from 'next/link';
import { ChevronDown } from 'lucide-react';

interface ProfileDropdownProps {
  userName?: string;
  className?: string;
}

export function ProfileDropdown({ userName, className }: ProfileDropdownProps) {
  return (
    <Link
      href="/profile"
      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-slate-700 hover:bg-slate-100 transition-colors ${className ?? ''}`}
    >
      <span className="w-8 h-8 rounded-full bg-sky-100 text-sky-700 flex items-center justify-center text-sm font-bold">
        {userName?.charAt(0)?.toUpperCase() || 'U'}
      </span>
      <span className="hidden sm:inline text-sm font-medium truncate max-w-[120px]">Profile</span>
      <ChevronDown className="h-4 w-4 text-slate-500 -rotate-90" />
    </Link>
  );
}
