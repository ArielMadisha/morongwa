'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import {
  STORE_LOCATION_COUNTRIES,
  effectiveWhatsappMarketCountries,
  formatWhatsappMarketCountriesLabel,
} from '@/lib/storeCountries';

type StoreMarketShape = {
  countryCode?: string | null;
  whatsappMarketCountries?: string[] | null;
};

type Props = {
  store: StoreMarketShape;
  disabled?: boolean;
  compact?: boolean;
  onSave: (codes: string[]) => Promise<void>;
};

export function StoreWhatsappMarketsEditor({ store, disabled, compact, onSave }: Props) {
  const effective = effectiveWhatsappMarketCountries(store);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>(effective);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) setSelected(effectiveWhatsappMarketCountries(store));
  }, [store, open]);

  const toggle = (code: string) => {
    setSelected((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code].sort()
    );
  };

  const handleSave = async () => {
    if (!selected.length) return;
    setSaving(true);
    try {
      await onSave(selected);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const label = formatWhatsappMarketCountriesLabel(store);

  return (
    <details
      className="group relative"
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary
        className={`flex cursor-pointer list-none items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-left hover:border-sky-300 hover:bg-sky-50/50 [&::-webkit-details-marker]:hidden ${
          compact ? 'max-w-[11rem]' : 'max-w-md'
        } ${disabled ? 'pointer-events-none opacity-60' : ''}`}
      >
        <span className={`truncate text-slate-800 ${compact ? 'text-xs' : 'text-sm'}`} title={label}>
          {label || '—'}
        </span>
        <ChevronDown className="ml-auto h-3.5 w-3.5 shrink-0 text-slate-400 transition group-open:rotate-180" />
      </summary>
      <div className="absolute left-0 z-[120] mt-1 w-56 rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          WhatsApp markets
        </p>
        <p className="mb-2 text-[11px] leading-snug text-slate-500">
          QwertyHub menu 2 on each country&apos;s WhatsApp line. Shop country:{' '}
          {STORE_LOCATION_COUNTRIES.find((c) => c.code === store.countryCode)?.name || store.countryCode || '—'}
        </p>
        <ul className="max-h-48 space-y-1 overflow-y-auto">
          {STORE_LOCATION_COUNTRIES.map((c) => (
            <li key={c.code}>
              <label className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-sm hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={selected.includes(c.code)}
                  onChange={() => toggle(c.code)}
                  disabled={saving}
                  className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                <span>{c.name}</span>
                <span className="text-xs text-slate-400">{c.code}</span>
              </label>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            disabled={saving || !selected.length}
            onClick={() => void handleSave()}
            className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-sky-600 px-2 py-1.5 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Save
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              setSelected(effectiveWhatsappMarketCountries({ countryCode: store.countryCode }));
              setOpen(false);
            }}
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </details>
  );
}

export function StoreWhatsappMarketsCheckboxes({
  countryCode,
  value,
  onChange,
}: {
  countryCode: string;
  value: string[];
  onChange: (codes: string[]) => void;
}) {
  const toggle = (code: string) => {
    const next = value.includes(code) ? value.filter((c) => c !== code) : [...value, code].sort();
    if (next.length) onChange(next);
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
      <p className="text-sm font-medium text-slate-800">WhatsApp market countries</p>
      <p className="mt-1 text-xs text-slate-500">
        Products from this supplier store on WhatsApp QwertyHub (main menu option 2). Select every
        country line where shoppers should see these products. Defaults to the shop country (
        {STORE_LOCATION_COUNTRIES.find((c) => c.code === countryCode)?.name || countryCode}) when unset.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {STORE_LOCATION_COUNTRIES.map((c) => (
          <label
            key={c.code}
            className="flex cursor-pointer items-center gap-2 rounded-lg border border-white bg-white px-3 py-2 text-sm shadow-sm"
          >
            <input
              type="checkbox"
              checked={value.includes(c.code)}
              onChange={() => toggle(c.code)}
              className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
            />
            <span className="font-medium text-slate-800">{c.name}</span>
            <span className="text-xs text-slate-400">{c.code}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
