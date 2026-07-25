'use client';

import { useEffect, useRef, useState } from 'react';
import { Plus, Truck, X } from 'lucide-react';
import {
  areasToCountryGroups,
  countryGroupsToAreas,
  countryLabelForCode,
  emptyFreeShippingCountryGroup,
  FREE_SHIPPING_COUNTRY_OPTIONS,
  type FreeShippingAreaRow,
  type FreeShippingCountryGroup,
} from '@/lib/freeShippingAreas';

type Props = {
  enabled: boolean;
  areas: FreeShippingAreaRow[];
  defaultCountryCode?: string;
  onEnabledChange: (enabled: boolean) => void;
  onAreasChange: (areas: FreeShippingAreaRow[]) => void;
  className?: string;
};

function areasSignature(areas: FreeShippingAreaRow[]): string {
  return areas.map((a) => `${a.countryCode}:${a.locality}`).join('|');
}

export function FreeShippingFields({
  enabled,
  areas,
  defaultCountryCode = 'ZA',
  onEnabledChange,
  onAreasChange,
  className = '',
}: Props) {
  const [countryGroups, setCountryGroupsState] = useState<FreeShippingCountryGroup[]>(() =>
    areasToCountryGroups(areas)
  );
  const lastAreasSig = useRef(areasSignature(areas));

  /** Sync from parent when saved areas change (e.g. load product, reset form). */
  useEffect(() => {
    const sig = areasSignature(areas);
    if (sig === lastAreasSig.current) return;
    lastAreasSig.current = sig;
    const fromProps = areasToCountryGroups(areas);
    if (fromProps.length > 0) {
      setCountryGroupsState(fromProps);
    } else if (!enabled) {
      setCountryGroupsState([]);
    }
  }, [areas, enabled]);

  const commitGroups = (groups: FreeShippingCountryGroup[]) => {
    setCountryGroupsState(groups);
    const flat = countryGroupsToAreas(groups);
    lastAreasSig.current = areasSignature(flat);
    onAreasChange(flat);
  };

  const addCountry = () => {
    const used = new Set(countryGroups.map((g) => g.countryCode));
    const nextCode =
      FREE_SHIPPING_COUNTRY_OPTIONS.find((c) => !used.has(c.code))?.code || defaultCountryCode;
    commitGroups([...countryGroups, emptyFreeShippingCountryGroup(nextCode)]);
  };

  const removeCountry = (countryIndex: number) => {
    commitGroups(countryGroups.filter((_, i) => i !== countryIndex));
  };

  const updateCountryCode = (countryIndex: number, countryCode: string) => {
    commitGroups(
      countryGroups.map((g, i) => (i === countryIndex ? { ...g, countryCode } : g))
    );
  };

  const addTown = (countryIndex: number) => {
    commitGroups(
      countryGroups.map((g, i) =>
        i === countryIndex ? { ...g, localities: [...g.localities, ''] } : g
      )
    );
  };

  const updateTown = (countryIndex: number, townIndex: number, value: string) => {
    commitGroups(
      countryGroups.map((g, i) =>
        i === countryIndex
          ? {
              ...g,
              localities: g.localities.map((loc, j) => (j === townIndex ? value : loc)),
            }
          : g
      )
    );
  };

  const removeTown = (countryIndex: number, townIndex: number) => {
    commitGroups(
      countryGroups.map((g, i) => {
        if (i !== countryIndex) return g;
        const next = g.localities.filter((_, j) => j !== townIndex);
        return { ...g, localities: next.length > 0 ? next : [''] };
      })
    );
  };

  const handleToggle = (checked: boolean) => {
    onEnabledChange(checked);
    if (!checked) {
      setCountryGroupsState([]);
      lastAreasSig.current = '';
      onAreasChange([]);
      return;
    }
    if (countryGroups.length === 0) {
      commitGroups([emptyFreeShippingCountryGroup(defaultCountryCode)]);
    }
  };

  return (
    <div className={`rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-3 ${className}`}>
      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => handleToggle(e.target.checked)}
          className="mt-0.5 rounded border-slate-300 text-sky-600"
        />
        <span>
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-800">
            <Truck className="h-4 w-4 text-sky-600" />
            Offer free shipping
          </span>
          <span className="block text-xs text-slate-500 mt-0.5">
            Customers in the areas you list pay R 0 delivery for this product at checkout.
          </span>
        </span>
      </label>

      {enabled && (
        <div className="space-y-3 pl-6">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-slate-700">Free shipping areas</p>
            <button
              type="button"
              onClick={addCountry}
              className="inline-flex items-center gap-1 rounded-lg border border-sky-300 bg-white px-2.5 py-1 text-xs font-medium text-sky-700 hover:bg-sky-50 shrink-0"
            >
              <Plus className="h-3.5 w-3.5" /> Add country
            </button>
          </div>

          {countryGroups.length === 0 ? (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              Click <strong>Add country</strong> to choose a country and list towns where delivery is free.
            </p>
          ) : (
            countryGroups.map((group, countryIndex) => (
              <div
                key={`${group.countryCode}-${countryIndex}`}
                className="rounded-lg border border-slate-200 bg-white p-3 space-y-2"
              >
                <div className="flex flex-wrap gap-2 items-center justify-between">
                  <div className="flex flex-wrap gap-2 items-center min-w-0 flex-1">
                    <select
                      value={group.countryCode}
                      onChange={(e) => updateCountryCode(countryIndex, e.target.value)}
                      className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm bg-white min-w-[9rem]"
                      aria-label="Country"
                    >
                      {FREE_SHIPPING_COUNTRY_OPTIONS.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                    <span className="text-xs text-slate-500">
                      Towns in {countryLabelForCode(group.countryCode)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => addTown(countryIndex)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                    >
                      <Plus className="h-3.5 w-3.5" /> Add town
                    </button>
                    {countryGroups.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeCountry(countryIndex)}
                        className="p-1.5 rounded-lg text-red-600 hover:bg-red-50"
                        aria-label={`Remove ${countryLabelForCode(group.countryCode)}`}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  {group.localities.map((town, townIndex) => (
                    <div key={townIndex} className="flex gap-2 items-center">
                      <input
                        type="text"
                        required={enabled}
                        value={town}
                        onChange={(e) => updateTown(countryIndex, townIndex, e.target.value)}
                        placeholder="Town / suburb / area *"
                        className="flex-1 min-w-0 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => removeTown(countryIndex, townIndex)}
                        className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 shrink-0"
                        aria-label="Remove town"
                        disabled={group.localities.length === 1 && !town.trim()}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}

          <p className="text-xs text-slate-500">
            Example: under South Africa add Hammanskraal, Pretoria, and Soshanguve. Under Botswana add Kasane.
            Match is case-insensitive on city or street address.
          </p>
        </div>
      )}
    </div>
  );
}
