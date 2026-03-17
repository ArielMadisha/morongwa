'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Tv } from 'lucide-react';

export const GENRES = [
  { id: 'comedy', label: 'Comedy', desc: 'Sitcoms, sketches, dark comedy, mockumentary' },
  { id: 'drama', label: 'Drama', desc: 'Emotional, character-driven storytelling' },
  { id: 'qwertz', label: 'Qwertz', desc: 'Short-form, vertical, full-screen video for entertaining, fast-paced content, often set to music or trending audio' },
  { id: 'action', label: 'Action/Adventure', desc: 'Superhero, spy, or high-stakes action' },
  { id: 'scifi', label: 'Science Fiction & Fantasy', desc: 'Dystopian, space opera, magical, or supernatural' },
  { id: 'thriller', label: 'Thriller & Mystery', desc: 'True crime, detective, or suspenseful shows' },
  { id: 'reality', label: 'Reality TV', desc: 'Competition, lifestyle, or documentary-style' },
  { id: 'family', label: 'Children & Family', desc: 'Animation or educational' },
] as const;

interface GenresDropdownProps {
  selectedGenre?: string;
  onSelect?: (genreId: string) => void;
  className?: string;
}

export function GenresDropdown({ selectedGenre, onSelect, className = '' }: GenresDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selected = GENRES.find((g) => g.id === selectedGenre) ?? GENRES[0];

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onMouseEnter={() => setOpen(true)}
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium transition-colors"
      >
        <Tv className="h-4 w-4" />
        <span>{selected.label}</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-1 py-2 bg-white rounded-xl border border-slate-200 shadow-xl z-[120] min-w-[240px] max-w-[320px]"
        >
          {GENRES.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => {
                onSelect?.(g.id);
                setOpen(false);
              }}
              className={`w-full px-4 py-2.5 text-left hover:bg-slate-50 transition-colors ${
                selectedGenre === g.id ? 'bg-sky-50 text-sky-700' : 'text-slate-700'
              }`}
            >
              <span className="font-medium block">{g.label}</span>
              <span className="text-xs text-slate-500 block mt-0.5">{g.desc}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
