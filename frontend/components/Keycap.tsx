import type { ReactNode } from 'react';

type KeycapProps = {
  children: ReactNode;
  className?: string;
  title?: string;
};

/** Keyboard-style chip for labels and step markers (QwertyHub / hub flows). */
export function Keycap({ children, className = '', title }: KeycapProps) {
  return (
    <kbd
      title={title}
      className={`inline-flex items-center justify-center rounded-md border border-slate-300 border-b-[3px] bg-gradient-to-b from-white to-slate-100 px-2 py-1 text-[11px] font-semibold leading-tight text-slate-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] ${className}`}
    >
      {children}
    </kbd>
  );
}
