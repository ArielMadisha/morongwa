/** Store location countries — keep in sync with backend/src/config/storeCountries.ts */
export const STORE_LOCATION_COUNTRIES = [
  { code: 'ZA', name: 'South Africa' },
  { code: 'BW', name: 'Botswana' },
  { code: 'NA', name: 'Namibia' },
  { code: 'ZW', name: 'Zimbabwe' },
  { code: 'ZM', name: 'Zambia' },
  { code: 'LS', name: 'Lesotho' },
  { code: 'SZ', name: 'Eswatini' },
  { code: 'MZ', name: 'Mozambique' },
  { code: 'MW', name: 'Malawi' },
  { code: 'AO', name: 'Angola' },
] as const;

export type StoreCountryCode = (typeof STORE_LOCATION_COUNTRIES)[number]['code'];

export function storeCountryLabel(code?: string | null, name?: string | null): string {
  if (name?.trim()) return name.trim();
  const hit = STORE_LOCATION_COUNTRIES.find((c) => c.code === String(code || '').toUpperCase());
  return hit?.name || '—';
}

/** WhatsApp QwertyHub menu 2 — countries where this store's products may appear. */
export function effectiveWhatsappMarketCountries(store: {
  whatsappMarketCountries?: string[] | null;
  countryCode?: string | null;
}): string[] {
  const explicit = (store.whatsappMarketCountries || [])
    .map((c) => String(c || '').trim().toUpperCase())
    .filter((c) => STORE_LOCATION_COUNTRIES.some((row) => row.code === c));
  if (explicit.length) return [...new Set(explicit)];
  const home = String(store.countryCode || '').trim().toUpperCase();
  return home && STORE_LOCATION_COUNTRIES.some((row) => row.code === home) ? [home] : [];
}

export function formatWhatsappMarketCountriesLabel(store: {
  whatsappMarketCountries?: string[] | null;
  countryCode?: string | null;
}): string {
  return effectiveWhatsappMarketCountries(store)
    .map((code) => storeCountryLabel(code))
    .join(', ');
}
