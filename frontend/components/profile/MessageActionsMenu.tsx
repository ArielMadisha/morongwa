'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, MessageCircle, Phone, Video } from 'lucide-react';

type Props = {
  userId: string;
  displayName: string;
  className?: string;
};

export function MessageActionsMenu({ userId, displayName, className = '' }: Props) {
  const router = useRouter();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hoverOpen, setHoverOpen] = useState(false);
  const [touchOpen, setTouchOpen] = useState(false);
  const [coarsePointer, setCoarsePointer] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(hover: none), (pointer: coarse)');
    const sync = () => setCoarsePointer(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (!touchOpen) return;
    const onDoc = (e: MouseEvent) => {
      const el = wrapRef.current;
      if (el && e.target instanceof Node && !el.contains(e.target)) setTouchOpen(false);
    };
    document.addEventListener('click', onDoc, true);
    return () => document.removeEventListener('click', onDoc, true);
  }, [touchOpen]);

  const open = hoverOpen || touchOpen;
  const go = (href: string) => {
    setHoverOpen(false);
    setTouchOpen(false);
    router.push(href);
  };

  return (
    <div
      ref={wrapRef}
      className={`relative inline-flex ${className}`}
      onMouseEnter={() => {
        if (!coarsePointer) setHoverOpen(true);
      }}
      onMouseLeave={() => setHoverOpen(false)}
    >
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (coarsePointer) setTouchOpen((v) => !v);
          else setHoverOpen((v) => !v);
        }}
        className="inline-flex max-w-[200px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:border-sky-300 hover:text-sky-700"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MessageCircle className="h-4 w-4 shrink-0" />
        <span className="truncate">Message {displayName}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" />
      </button>

      {open ? (
        <div className="absolute left-0 top-full z-[80] mt-1 min-w-[12rem]" role="menu" aria-label="Message actions">
          <div className="rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-slate-800 hover:bg-sky-50"
              onClick={() => go(`/messages?with=${encodeURIComponent(userId)}`)}
            >
              <MessageCircle className="h-4 w-4 shrink-0 text-sky-600" />
              Chat
            </button>
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-slate-800 hover:bg-sky-50"
              onClick={() => go('/calls?mode=voice')}
            >
              <Phone className="h-4 w-4 shrink-0 text-sky-600" />
              Voice Call
            </button>
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-slate-800 hover:bg-sky-50"
              onClick={() => go('/calls?mode=video')}
            >
              <Video className="h-4 w-4 shrink-0 text-sky-600" />
              Video Call
            </button>
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-slate-800 hover:bg-sky-50"
              onClick={() => go(`/messages?section=meet&with=${encodeURIComponent(userId)}`)}
            >
              <Video className="h-4 w-4 shrink-0 text-violet-600" />
              Invite to Meeting
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
