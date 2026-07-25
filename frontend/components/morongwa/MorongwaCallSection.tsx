'use client';

import { PstnCallPanel } from '@/components/PstnCallPanel';

type Props = {
  initialTo?: string;
  onCallEnded?: () => void;
};

export function MorongwaCallSection({ initialTo, onCallEnded }: Props) {
  return (
    <div className="flex w-full flex-1 flex-col overflow-y-auto bg-white p-4 sm:p-6 min-h-[min(70dvh,calc(100dvh-11rem))] lg:h-full lg:min-h-0">
      <div className="mx-auto w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3">
          <h1 className="text-lg font-semibold text-slate-900">Morongwa — call a number</h1>
        </div>
        <div className="p-4">
          <PstnCallPanel key={initialTo || 'inline'} initialTo={initialTo} onCallPlaced={onCallEnded} />
        </div>
      </div>
    </div>
  );
}
