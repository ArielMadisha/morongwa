/**
 * Country → currency mapping for frontend FX conversion
 * EU countries use EUR; SA region uses ZAR; East/West Africa have local currencies.
 */

export const COUNTRY_TO_CURRENCY: Record<string, string> = {
  // Southern Africa
  ZA: "ZAR",
  BW: "BWP",
  NA: "NAD",
  LS: "LSL",
  SZ: "SZL",
  ZW: "ZWL",
  ZM: "ZMW",
  MZ: "MZN",
  // East Africa
  KE: "KES",
  TZ: "TZS",
  UG: "UGX",
  RW: "RWF",
  ET: "ETB",
  MU: "MUR",
  SC: "SCR",
  // West Africa
  NG: "NGN",
  GH: "GHS",
  SN: "XOF",
  CI: "XOF",
  ML: "XOF",
  BF: "XOF",
  BJ: "XOF",
  TG: "XOF",
  NE: "XOF",
  GW: "XOF",
  GM: "GMD",
  LR: "LRD",
  SL: "SLL",
  // Other
  US: "USD",
  CA: "CAD",
  GB: "GBP",
  UK: "GBP",
  // EU countries (Eurozone + EU)
  AT: "EUR",
  BE: "EUR",
  BG: "EUR",
  HR: "EUR",
  CY: "EUR",
  CZ: "EUR",
  DK: "EUR",
  EE: "EUR",
  FI: "EUR",
  FR: "EUR",
  DE: "EUR",
  GR: "EUR",
  HU: "EUR",
  IE: "EUR",
  IT: "EUR",
  LV: "EUR",
  LT: "EUR",
  LU: "EUR",
  MT: "EUR",
  NL: "EUR",
  PL: "EUR",
  PT: "EUR",
  RO: "EUR",
  SK: "EUR",
  SI: "EUR",
  ES: "EUR",
  SE: "EUR",
  AU: "AUD",
  NZ: "NZD",
  IN: "INR",
};

export function getCurrencyForCountry(countryCode: string): string {
  const code = (countryCode || "").toUpperCase().trim();
  return COUNTRY_TO_CURRENCY[code] || "USD";
}
