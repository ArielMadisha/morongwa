'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { ChevronDown, CreditCard, Wallet } from 'lucide-react';

type Props = {
  /** After top-up, return here (e.g. /messages). Defaults to current path. */
  returnTo?: string;
  /** Close parent modal before navigating (call dialer). */
  onNavigate?: () => void;
  className?: string;
};

export function AirtimeTopUpMenu({ returnTo, onNavigate, className = '' }: Props) {
  const router = useRouter();
  const pathname = usePathname() || '/';
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

  const menuOpen = hoverOpen || touchOpen;
  const back = (returnTo || pathname).trim() || '/';

  const go = (method: 'card' | 'wallet') => {
    setHoverOpen(false);
    setTouchOpen(false);
    onNavigate?.();
    const q = new URLSearchParams({ topup: method, returnTo: back });
    router.push(`/wallet?${q.toString()}`);
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
          else go('card');
        }}
        className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100/80 transition-colors"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
      >
        Top-up
        <ChevronDown className="h-3 w-3 opacity-70" aria-hidden />
      </button>

      {menuOpen ? (
        <div
          className="absolute right-0 top-full z-[80] pt-1 min-w-[11.5rem]"
          role="menu"
          aria-label="Top-up options"
          onMouseDown={(e) => e.preventDefault()}
        >
          <div className="rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-slate-800 hover:bg-indigo-50 transition-colors"
              onClick={() => go('card')}
            >
              <CreditCard className="h-4 w-4 shrink-0 text-indigo-600" />
              Top-up by Card
            </button>
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-slate-800 hover:bg-indigo-50 transition-colors"
              onClick={() => go('wallet')}
            >
              <Wallet className="h-4 w-4 shrink-0 text-indigo-600" />
              Top-up by Wallet
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
