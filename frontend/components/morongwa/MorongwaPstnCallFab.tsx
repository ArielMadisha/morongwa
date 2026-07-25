'use client';

import { useEffect, useState } from 'react';
import { PhoneCall, X } from 'lucide-react';
import { PstnCallPanel } from '@/components/PstnCallPanel';

type MorongwaPstnCallFabProps = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  initialTo?: string;
  onCallEnded?: () => void;
};

/** Bottom-right Morongwa PSTN dialer (Twilio Voice SDK / WebRTC in browser). */
export function MorongwaPstnCallFab({
  open: openProp,
  onOpenChange,
  initialTo,
  onCallEnded,
}: MorongwaPstnCallFabProps = {}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;

  const setOpen = (next: boolean) => {
    if (onOpenChange) onOpenChange(next);
    else setInternalOpen(next);
  };

  useEffect(() => {
    if (initialTo && open) {
      /* PstnCallPanel reads initialTo when modal opens */
    }
  }, [initialTo, open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed z-40 right-4 bottom-[5.5rem] md:bottom-8 inline-flex cursor-pointer items-center gap-2 rounded-full border border-indigo-200 bg-white px-4 py-3 text-sm font-semibold text-indigo-700 shadow-lg shadow-indigo-100/80 transition hover:border-indigo-300 hover:bg-indigo-50"
        aria-label="Call a phone number"
      >
        <PhoneCall className="h-5 w-5" />
        <span className="hidden sm:inline">Call phone</span>
      </button>

      {open ? (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            role="dialog"
            aria-labelledby="morongwa-pstn-title"
            className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 sticky top-0 bg-white z-10">
              <h2 id="morongwa-pstn-title" className="text-lg font-semibold text-slate-900">
                Morongwa — call a number
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4">
              <PstnCallPanel
                key={initialTo || 'default'}
                initialTo={initialTo}
                onTopUpNavigate={() => setOpen(false)}
                onCallPlaced={() => {
                  onCallEnded?.();
                }}
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
