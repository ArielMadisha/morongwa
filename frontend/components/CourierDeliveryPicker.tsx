'use client';

import { BadgeDollarSign, Clock, Truck } from 'lucide-react';
import { formatCurrencyAmount } from '@/lib/formatCurrency';
import { buildCourierDisplayGroups } from '@/lib/groupCourierOptions';

export type CourierOption = {
  tariffId: string;
  providerName: string;
  providerSlug?: string;
  serviceLabel: string;
  zone?: string;
  priceZar: number;
  minDeliveryDays: number;
  maxDeliveryDays: number;
};

type Props = {
  options: CourierOption[];
  selectedTariffId?: string;
  onSelect: (tariffId: string) => void;
  sort: 'price' | 'speed';
  onSortChange: (sort: 'price' | 'speed') => void;
  courierDeliveryZar?: number;
  compact?: boolean;
  /** Display currency for prices (ZAR default; BWP for Botswana local checkout). */
  currency?: string;
};

function formatPrice(price: number, currency = 'ZAR') {
  return formatCurrencyAmount(price, currency || 'ZAR');
}

function CourierOptionRow({
  opt,
  selected,
  onSelect,
  showProviderName,
  currency = 'ZAR',
}: {
  opt: CourierOption;
  selected: boolean;
  onSelect: () => void;
  showProviderName: boolean;
  currency?: string;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 p-3 transition-colors ${
        selected
          ? 'border-sky-500 bg-sky-50 ring-1 ring-sky-200'
          : 'border-slate-200 hover:border-sky-200 hover:bg-slate-50/80'
      }`}
    >
      <input
        type="radio"
        name="courier"
        checked={selected}
        onChange={onSelect}
        className="mt-1.5 text-sky-600"
      />
      <span className="flex-1 min-w-0 text-sm">
        {showProviderName ? (
          <>
            <span className="font-semibold text-slate-900">{opt.providerName}</span>
            <span className="text-slate-600"> · {opt.serviceLabel}</span>
          </>
        ) : (
          <>
            <span className="font-medium text-slate-900">{opt.serviceLabel}</span>
            {opt.zone ? (
              <span className="block text-xs text-slate-500 mt-0.5">{opt.zone}</span>
            ) : null}
          </>
        )}
        <span className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-xs font-medium">
          <span className="text-slate-800">{formatPrice(opt.priceZar, currency)}</span>
          <span className="text-slate-500">
            Est. {opt.minDeliveryDays}–{opt.maxDeliveryDays} business days
          </span>
        </span>
      </span>
    </label>
  );
}

export function CourierDeliveryPicker({
  options,
  selectedTariffId,
  onSelect,
  sort,
  onSortChange,
  courierDeliveryZar,
  compact = false,
  currency = 'ZAR',
}: Props) {
  if (!options.length) return null;

  const groups = buildCourierDisplayGroups(options, sort);

  const selectedLabel = (() => {
    const c = options.find((o) => o.tariffId === selectedTariffId);
    return c ? `${c.providerName} — ${c.serviceLabel}` : null;
  })();

  return (
    <div
      className={`rounded-2xl border-2 border-sky-100 bg-white shadow-sm ${
        compact ? 'p-3 sm:p-4' : 'p-4 sm:p-5'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <Truck className="h-5 w-5 text-sky-600" />
            Delivery method
            <span className="text-red-500" aria-hidden>
              *
            </span>
          </h2>
          <p className="text-sm text-slate-600 mt-1">Select a PAXI service for your parcel size.</p>
        </div>
        <div className="flex rounded-lg border border-slate-200 p-0.5 text-xs font-semibold">
          <button
            type="button"
            onClick={() => onSortChange('price')}
            className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 ${
              sort === 'price' ? 'bg-sky-600 text-white' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <BadgeDollarSign className="h-3.5 w-3.5" /> Lowest price
          </button>
          <button
            type="button"
            onClick={() => onSortChange('speed')}
            className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 ${
              sort === 'speed' ? 'bg-sky-600 text-white' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Clock className="h-3.5 w-3.5" /> Fastest
          </button>
        </div>
      </div>

      <div
        className={`space-y-4 overflow-y-auto pr-1 ${compact ? 'max-h-64' : 'max-h-[min(520px,55vh)]'}`}
      >
        {groups.map((group) => (
          <section key={group.id} className="space-y-3">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-200 pb-1.5">
              {group.title}
            </h3>
            {group.subsections.map((sub, subIdx) => (
              <div key={`${group.id}-${subIdx}`} className="space-y-2 pl-1 sm:pl-2">
                {sub.title ? (
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                    {sub.title}
                  </p>
                ) : null}
                <div className="space-y-2">
                  {sub.options.map((opt) => (
                    <CourierOptionRow
                      key={opt.tariffId}
                      opt={opt}
                      selected={selectedTariffId === opt.tariffId}
                      onSelect={() => onSelect(opt.tariffId)}
                      showProviderName={group.id === 'other'}
                      currency={currency}
                    />
                  ))}
                </div>
              </div>
            ))}
          </section>
        ))}
      </div>

      {selectedTariffId && selectedLabel && (
        <p className="mt-3 text-sm text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
          Delivery: <span className="font-semibold">{selectedLabel}</span>
          {courierDeliveryZar != null && courierDeliveryZar > 0 ? (
            <span> — {formatPrice(courierDeliveryZar, currency)} included in your total.</span>
          ) : null}
        </p>
      )}
    </div>
  );
}
