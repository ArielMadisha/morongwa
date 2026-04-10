/**
 * Mirrors backend/src/utils/phoneCountryCurrency.ts — keep rules in sync.
 * India → INR; US/CA & geographic Europe → USD; mapped regions use local FX tickers.
 */
import { parsePhoneNumberFromString } from 'libphonenumber-js';

const EUROPE_COUNTRY_ISO = new Set<string>([
  'AL', 'AD', 'AT', 'BY', 'BE', 'BA', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IS', 'IE', 'IT', 'XK', 'LV', 'LI', 'LT', 'LU', 'MT', 'MD', 'MC', 'ME', 'NL', 'MK', 'NO', 'PL', 'PT', 'RO', 'RU', 'SM', 'RS', 'SK', 'SI', 'ES', 'SE', 'CH', 'UA', 'GB', 'VA', 'GG', 'JE', 'IM', 'FO', 'GI', 'AX', 'SJ', 'GL',
]);

function fallbackCountryIsoFromPrefix(digits: string): string | null {
  const d = String(digits || '').replace(/\D/g, '');
  if (d.length < 8) return null;
  if (d.startsWith('91')) return 'IN';
  if (d.startsWith('27')) return 'ZA';
  if (d.startsWith('267')) return 'BW';
  if (d.startsWith('264')) return 'NA';
  if (d.startsWith('266')) return 'LS';
  if (d.startsWith('260')) return 'ZM';
  if (d.startsWith('263')) return 'ZW';
  if (d.startsWith('254')) return 'KE';
  if (d.startsWith('255')) return 'TZ';
  if (d.startsWith('256')) return 'UG';
  if (d.startsWith('250')) return 'RW';
  if (d.startsWith('251')) return 'ET';
  if (d.startsWith('234')) return 'NG';
  if (d.startsWith('233')) return 'GH';
  if (d.startsWith('1') && d.length >= 11) return 'US';
  return null;
}

export function detectCountryIsoFromPhoneDigits(digits: string): string | null {
  const d = String(digits || '').replace(/\D/g, '');
  if (d.length < 8) return null;
  try {
    const pn = parsePhoneNumberFromString(`+${d}`);
    if (pn?.country) return pn.country;
  } catch {
    /* ignore */
  }
  return fallbackCountryIsoFromPrefix(d);
}

const LEGACY_CURRENCY_BY_COUNTRY: Record<string, string> = {
  ZA: 'ZAR', BW: 'BWP', NA: 'NAD', LS: 'LSL', SZ: 'SZL', ZW: 'ZWL', ZM: 'ZMW', MZ: 'MZN',
  KE: 'KES', TZ: 'TZS', UG: 'UGX', RW: 'RWF', ET: 'ETB', MU: 'MUR', SC: 'SCR',
  NG: 'NGN', GH: 'GHS', SN: 'XOF', CI: 'XOF', ML: 'XOF', BF: 'XOF', BJ: 'XOF', TG: 'XOF', NE: 'XOF', GW: 'XOF',
  GM: 'GMD', LR: 'LRD', SL: 'SLL',
  AU: 'AUD', NZ: 'NZD', JP: 'JPY', KR: 'KRW', CN: 'CNY', SG: 'SGD', MY: 'MYR', TH: 'THB', PH: 'PHP', ID: 'IDR', VN: 'VND',
  AE: 'AED', SA: 'SAR', IL: 'ILS', TR: 'TRY', EG: 'EGP',
  BR: 'BRL', MX: 'MXN', AR: 'ARS', CL: 'CLP', CO: 'COP',
};

export function currencyFromCountryIso(iso: string): string {
  const c = String(iso || '').toUpperCase().trim();
  if (!c) return 'USD';
  if (c === 'IN') return 'INR';
  if (c === 'US') return 'USD';
  if (c === 'CA') return 'CAD';
  if (EUROPE_COUNTRY_ISO.has(c)) return 'EUR';
  return LEGACY_CURRENCY_BY_COUNTRY[c] || 'USD';
}

export function computePhoneLocale(phoneDigits: string | null | undefined): { countryCode?: string; preferredCurrency?: string } {
  const d = String(phoneDigits || '').replace(/\D/g, '');
  if (d.length < 8) return {};
  const iso = detectCountryIsoFromPhoneDigits(d);
  if (!iso) return {};
  return { countryCode: iso, preferredCurrency: currencyFromCountryIso(iso) };
}
