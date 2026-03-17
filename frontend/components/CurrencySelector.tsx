'use client';

import { useState, useRef, useEffect } from 'react';
import { useCurrency } from '@/contexts/CurrencyContext';
import { Globe } from 'lucide-react';

const OPTIONS: { code: string; label: string; currency: string; region?: string }[] = [
  { code: 'ZA', label: 'South Africa', currency: 'ZAR', region: 'Southern Africa' },
  { code: 'BW', label: 'Botswana', currency: 'BWP', region: 'Southern Africa' },
  { code: 'NA', label: 'Namibia', currency: 'NAD', region: 'Southern Africa' },
  { code: 'ZM', label: 'Zambia', currency: 'ZMW', region: 'Southern Africa' },
  { code: 'ZW', label: 'Zimbabwe', currency: 'ZWL', region: 'Southern Africa' },
  { code: 'KE', label: 'Kenya', currency: 'KES', region: 'East Africa' },
  { code: 'TZ', label: 'Tanzania', currency: 'TZS', region: 'East Africa' },
  { code: 'UG', label: 'Uganda', currency: 'UGX', region: 'East Africa' },
  { code: 'RW', label: 'Rwanda', currency: 'RWF', region: 'East Africa' },
  { code: 'ET', label: 'Ethiopia', currency: 'ETB', region: 'East Africa' },
  { code: 'NG', label: 'Nigeria', currency: 'NGN', region: 'West Africa' },
  { code: 'GH', label: 'Ghana', currency: 'GHS', region: 'West Africa' },
  { code: 'SN', label: 'Senegal', currency: 'XOF', region: 'West Africa' },
  { code: 'CI', label: 'Ivory Coast', currency: 'XOF', region: 'West Africa' },
  { code: 'US', label: 'United States', currency: 'USD' },
  { code: 'GB', label: 'United Kingdom', currency: 'GBP' },
  { code: 'DE', label: 'Germany (EU)', currency: 'EUR' },
  { code: 'FR', label: 'France (EU)', currency: 'EUR' },
  { code: 'AU', label: 'Australia', currency: 'AUD' },
];

export function CurrencySelector() {
  const { countryCode, setCountry, currency } = useCurrency();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', h);
    return () => document.removeEventListener('click', h);
  }, []);

  const current = OPTIONS.find((o) => o.code === countryCode) || OPTIONS[0];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs text-slate-600 hover:bg-slate-100"
        title="Change currency / country"
      >
        <Globe className="h-3.5 w-3.5" />
        <span>{current.currency}</span>
      </button>
      {open && (
        <div className="absolute bottom-full left-0 mb-1 w-56 max-h-[70vh] overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg py-1 z-50">
          {['Southern Africa', 'East Africa', 'West Africa'].map((region) => {
            const items = OPTIONS.filter((o) => o.region === region);
            if (items.length === 0) return null;
            return (
              <div key={region}>
                <p className="px-3 py-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide sticky top-0 bg-slate-50">
                  {region}
                </p>
                {items.map((o) => (
                  <button
                    key={o.code}
                    type="button"
                    onClick={() => {
                      setCountry(o.code);
                      setOpen(false);
                    }}
                    className={`block w-full text-left px-3 py-2 text-sm hover:bg-slate-50 ${
                      o.code === countryCode ? 'bg-sky-50 text-sky-700 font-medium' : 'text-slate-700'
                    }`}
                  >
                    {o.label} ({o.currency})
                  </button>
                ))}
              </div>
            );
          })}
          <div>
            <p className="px-3 py-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide sticky top-0 bg-slate-50">
              Other
            </p>
            {OPTIONS.filter((o) => !o.region).map((o) => (
              <button
                key={o.code}
                type="button"
                onClick={() => {
                  setCountry(o.code);
                  setOpen(false);
                }}
                className={`block w-full text-left px-3 py-2 text-sm hover:bg-slate-50 ${
                  o.code === countryCode ? 'bg-sky-50 text-sky-700 font-medium' : 'text-slate-700'
                }`}
              >
                {o.label} ({o.currency})
              </button>
            ))}
          </div>
          <p className="px-3 py-2 text-xs text-slate-400 border-t border-slate-100 mt-1">
            <a href="https://www.exchangerate-api.com" target="_blank" rel="noopener noreferrer" className="hover:underline">
              Rates by Exchange Rate API
            </a>
          </p>
        </div>
      )}
    </div>
  );
}
