/** Store location countries (SADC-focused marketplace). */
export const STORE_LOCATION_COUNTRIES = [
  { code: "ZA", name: "South Africa" },
  { code: "BW", name: "Botswana" },
  { code: "NA", name: "Namibia" },
  { code: "ZW", name: "Zimbabwe" },
  { code: "ZM", name: "Zambia" },
  { code: "LS", name: "Lesotho" },
  { code: "SZ", name: "Eswatini" },
  { code: "MZ", name: "Mozambique" },
  { code: "MW", name: "Malawi" },
  { code: "AO", name: "Angola" },
] as const;

export type StoreCountryCode = (typeof STORE_LOCATION_COUNTRIES)[number]["code"];

const BY_CODE = new Map(STORE_LOCATION_COUNTRIES.map((c) => [c.code, c]));
const BY_NAME = new Map(STORE_LOCATION_COUNTRIES.map((c) => [c.name.toLowerCase(), c]));

/** Normalize admin/UI input to canonical { country, countryCode }. */
export function resolveStoreCountry(input: string): { country: string; countryCode: StoreCountryCode } | null {
  const raw = String(input || "").trim();
  if (!raw) return null;
  const upper = raw.toUpperCase();
  if (BY_CODE.has(upper as StoreCountryCode)) {
    const row = BY_CODE.get(upper as StoreCountryCode)!;
    return { country: row.name, countryCode: row.code };
  }
  const byName = BY_NAME.get(raw.toLowerCase());
  if (byName) return { country: byName.name, countryCode: byName.code };
  return null;
}

export function defaultStoreCountryFromUserCountryCode(countryCode?: string | null): {
  country: string;
  countryCode: StoreCountryCode;
} {
  const cc = String(countryCode || "ZA").trim().toUpperCase();
  const hit = BY_CODE.get(cc as StoreCountryCode);
  if (hit) return { country: hit.name, countryCode: hit.code };
  return { country: "South Africa", countryCode: "ZA" };
}

const ALLOWED_CODES = new Set(STORE_LOCATION_COUNTRIES.map((c) => c.code));

/** Admin-selected WhatsApp QwertyHub (menu 2) market countries — ISO codes only. */
export function normalizeWhatsappMarketCountries(
  raw: unknown,
  fallbackShopCountryCode?: string | null
): StoreCountryCode[] {
  const fromList = Array.isArray(raw)
    ? raw
        .map((c) => String(c || "").trim().toUpperCase())
        .filter((c): c is StoreCountryCode => ALLOWED_CODES.has(c as StoreCountryCode))
    : [];
  const unique = [...new Set(fromList)];
  if (unique.length) return unique;
  const home = String(fallbackShopCountryCode || "").trim().toUpperCase();
  if (home && ALLOWED_CODES.has(home as StoreCountryCode)) return [home as StoreCountryCode];
  return [];
}

/** Effective markets for display / filtering when whatsappMarketCountries unset. */
export function effectiveWhatsappMarketCountries(store: {
  whatsappMarketCountries?: string[] | null;
  countryCode?: string | null;
}): StoreCountryCode[] {
  const explicit = normalizeWhatsappMarketCountries(store.whatsappMarketCountries);
  if (explicit.length) return explicit;
  return normalizeWhatsappMarketCountries([], store.countryCode);
}
