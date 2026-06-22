import { currencyFromCountryIso } from '@/lib/phoneCountryCurrency';

export function currencyForCountryCode(countryCode?: string | null): string {
  return currencyFromCountryIso(String(countryCode || 'ZA').trim() || 'ZA');
}

export function currencyLabel(code: string): string {
  const c = String(code || 'ZAR').toUpperCase();
  if (c === 'BWP') return 'Pula (BWP)';
  if (c === 'ZAR') return 'Rand (ZAR)';
  if (c === 'ZMW') return 'Zambian Kwacha (ZMW)';
  return c;
}

/** Store catalog currencies shown in native units; USD/INR use legacy conversion helpers. */
export function isStoreNativeCatalogCurrency(code: string | undefined): boolean {
  const c = String(code || 'ZAR').toUpperCase();
  return c !== 'USD' && c !== 'INR' && c.length === 3;
}
