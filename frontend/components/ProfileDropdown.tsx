'use client';

import { useRef, useState, useEffect } from 'react';
import Link from 'next/link';
import { Home, LogOut, ChevronDown } from 'lucide-react';

interface ProfileDropdownProps {
  userName?: string;
  onLogout: () => void;
}

export function ProfileDropdown({ userName, onLogout }: ProfileDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        onMouseEnter={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-slate-700 hover:bg-slate-100 transition-colors"
        aria-expanded={open}
        aria-haspopup="true"
      >
        <span className="w-8 h-8 rounded-full bg-sky-100 text-sky-700 flex items-center justify-center text-sm font-bold">
          {userName?.charAt(0)?.toUpperCase() || 'U'}
        </span>
        <span className="hidden sm:inline text-sm font-medium truncate max-w-[120px]">Profile</span>
        <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1 py-1 w-48 bg-white rounded-lg border border-slate-200 shadow-xl z-[9999]"
          onMouseLeave={() => setOpen(false)}
        >
          <Link
            href="/wall"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50 rounded-t-lg transition-colors"
          >
            <Home className="h-4 w-4 text-slate-500" />
            Home
          </Link>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
            className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50 rounded-b-lg transition-colors text-left"
          >
            <LogOut className="h-4 w-4 text-slate-500" />
            Logout
          </button>
        </div>
      )}
    </div>
  );
}
