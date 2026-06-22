'use client';

import { formatCurrencyAmount } from '@/lib/formatCurrency';
import { formatPaxiOptionTitle } from '@/lib/paxiDisplay';
import type { ProgrammedPaxiOption } from '@/lib/paxiCatalog';

type Props = {
  options: ProgrammedPaxiOption[];
  selectedId?: string;
  onSelect: (id: string, tariffId?: string) => void;
  compact?: boolean;
};

function formatPrice(price: number) {
  return formatCurrencyAmount(price, 'ZAR');
}

export function paxiOptionSelectId(opt: ProgrammedPaxiOption): string {
  return opt.tariffId || `key:${opt.key}`;
}

/** Six programmed PAXI choices — shown instantly; tariffId optional until API hydrates. */
export function PaxiDeliveryPicker({ options, selectedId, onSelect, compact = false }: Props) {
  if (!options.length) return null;

  return (
    <div
      className={`rounded-2xl border-2 border-sky-100 bg-white shadow-sm ${
        compact ? 'p-3 sm:p-4' : 'p-4 sm:p-5'
      }`}
    >
      <h2 className="text-base font-bold text-slate-900 mb-3">Paxi</h2>
      <div className={`space-y-2 overflow-y-auto pr-1 ${compact ? 'max-h-80' : 'max-h-[min(520px,55vh)]'}`}>
        {options.map((opt) => {
          const id = paxiOptionSelectId(opt);
          const selected = selectedId === id || (!!opt.tariffId && selectedId === opt.tariffId);
          return (
            <label
              key={opt.key}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 p-3 transition-colors ${
                selected
                  ? 'border-sky-500 bg-sky-50 ring-1 ring-sky-200'
                  : 'border-slate-200 hover:border-sky-200 hover:bg-slate-50/80'
              }`}
            >
              <input
                type="radio"
                name="paxi-courier"
                checked={selected}
                onChange={() => onSelect(id, opt.tariffId || undefined)}
                className="mt-1.5 text-sky-600 shrink-0"
              />
              <span className="flex-1 min-w-0 text-sm">
                <span className="font-medium text-slate-900 block leading-snug">
                  {formatPaxiOptionTitle(opt)}
                </span>
                <span className="mt-1.5 inline-block font-semibold text-slate-800 tabular-nums">
                  {formatPrice(opt.priceZar)}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
