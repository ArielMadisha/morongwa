'use client';

import { ArrowLeft, X } from 'lucide-react';
import type { ReactNode } from 'react';

type Props = {
  open: boolean;
  title: string;
  onClose: () => void;
  onBack?: () => void;
  children: ReactNode;
  maxWidthClass?: string;
};

export function FlowModal({ open, title, onClose, onBack, children, maxWidthClass = 'max-w-lg' }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
      <div className={`w-full ${maxWidthClass} max-h-[92dvh] overflow-hidden rounded-t-2xl sm:rounded-2xl bg-white shadow-xl flex flex-col`}>
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
          {onBack ? (
            <button type="button" onClick={onBack} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100" aria-label="Back">
              <ArrowLeft className="h-5 w-5" />
            </button>
          ) : null}
          <h2 className="flex-1 text-lg font-semibold text-slate-900 truncate">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}
