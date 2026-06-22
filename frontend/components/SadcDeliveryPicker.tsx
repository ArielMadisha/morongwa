'use client';

import { formatCurrencyAmount } from '@/lib/formatCurrency';
import type { ProgrammedSadcOption } from '@/lib/sadcDeliveryCatalog';
import { sadcOptionSelectId } from '@/lib/sadcDeliveryCatalog';

type Props = {
  options: ProgrammedSadcOption[];
  selectedId?: string;
  onSelect: (id: string, tariffId?: string) => void;
  scope: 'local' | 'crossborder';
  /** Checkout display currency (BWP for Botswana local store + local courier). */
  displayCurrency?: string;
  compact?: boolean;
};

function formatPrice(price: number, currency: string) {
  return formatCurrencyAmount(price, currency || 'ZAR');
}

export function SadcDeliveryPicker({
  options,
  selectedId,
  onSelect,
  scope,
  displayCurrency = 'ZAR',
  compact = false,
}: Props) {
  if (!options.length) return null;

  const title = scope === 'local' ? 'Local delivery' : 'Crossborder delivery';

  return (
    <div
      className={`rounded-2xl border-2 border-sky-100 bg-white shadow-sm ${
        compact ? 'p-3 sm:p-4' : 'p-4 sm:p-5'
      }`}
    >
      <h2 className="text-base font-bold text-slate-900 mb-3">{title}</h2>
      <div className={`space-y-2 overflow-y-auto pr-1 ${compact ? 'max-h-80' : 'max-h-[min(520px,55vh)]'}`}>
        {options.map((opt) => {
          const id = sadcOptionSelectId(opt);
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
                name={`sadc-courier-${scope}`}
                checked={selected}
                onChange={() => onSelect(id, opt.tariffId || undefined)}
                className="mt-1.5 text-sky-600 shrink-0"
              />
              <span className="flex-1 min-w-0 text-sm">
                <span className="font-semibold text-slate-900">{opt.providerName}</span>
                <span className="text-slate-600"> · {opt.serviceLabel}</span>
                {opt.zone ? (
                  <span className="block text-xs text-slate-500 mt-0.5">{opt.zone}</span>
                ) : null}
                <span className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-xs font-medium">
                  <span className="text-slate-800">{formatPrice(opt.priceZar, displayCurrency)}</span>
                  <span className="text-slate-500">
                    Est. {opt.minDeliveryDays}–{opt.maxDeliveryDays} business days
                  </span>
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
