'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { Tv, ChevronDown, Radio } from 'lucide-react';
import { GENRES } from './GenresDropdown';

interface QwertyTVWithGenresProps {
  selectedGenre?: string;
  onGenreSelect?: (genreId: string) => void;
}

export function QwertyTVWithGenres({ selectedGenre, onGenreSelect }: QwertyTVWithGenresProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={ref} className="relative flex items-center gap-2 min-w-0 shrink-0">
      <div
        className="flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors"
        onMouseEnter={() => setOpen(true)}
        onClick={() => setOpen(!open)}
      >
        <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-full bg-brand-500 flex items-center justify-center text-white font-bold text-xs shrink-0">
          <Tv className="h-4 w-4" />
        </div>
        <h1 className="text-base sm:text-lg font-semibold text-slate-900 truncate hidden sm:block">QwertyTV</h1>
        <ChevronDown className={`h-4 w-4 text-slate-500 shrink-0 hidden sm:block transition-transform ${open ? 'rotate-180' : ''}`} />
      </div>
      {open && (
        <div
          className="absolute right-0 top-full mt-1 py-2 bg-white rounded-xl border border-slate-200 shadow-xl z-[120] min-w-[240px] max-w-[320px]"
        >
          <Link
            href="/morongwa-tv/live"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors text-slate-700 border-b border-slate-100"
          >
            <Radio className="h-4 w-4 text-brand-600 shrink-0" />
            <span className="font-medium">Live TV</span>
          </Link>
          {GENRES.map((g) => (
            g.id === 'qwertz' ? (
              <Link
                key={g.id}
                href="/morongwa-tv?compose=qwertz"
                onClick={() => setOpen(false)}
                className={`block w-full px-4 py-2.5 text-left hover:bg-slate-50 transition-colors cursor-pointer ${
                  selectedGenre === g.id ? 'bg-sky-50 text-sky-700' : 'text-slate-700'
                }`}
              >
                <span className="font-medium block">{g.label}</span>
                <span className="text-xs text-slate-500 block mt-0.5">{g.desc}</span>
              </Link>
            ) : (
              <button
                key={g.id}
                type="button"
                onClick={() => {
                  onGenreSelect?.(g.id);
                  setOpen(false);
                }}
                className={`w-full px-4 py-2.5 text-left hover:bg-slate-50 transition-colors cursor-pointer ${
                  selectedGenre === g.id ? 'bg-sky-50 text-sky-700' : 'text-slate-700'
                }`}
              >
                <span className="font-medium block">{g.label}</span>
                <span className="text-xs text-slate-500 block mt-0.5">{g.desc}</span>
              </button>
            )
          ))}
        </div>
      )}
    </div>
  );
}
