/**
 * FX rates service – automated USD→ZAR, EUR, etc.
 * Uses ExchangeRate-API open access (no key): https://open.er-api.com/v6/latest/USD
 * Caches rates; refreshes hourly. Data updates once per day from provider.
 */

const FX_API = "https://open.er-api.com/v6/latest/USD";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

let cachedRates: Record<string, number> | null = null;
let cacheExpiry = 0;

export async function getFxRates(): Promise<{ base: string; rates: Record<string, number> }> {
  if (cachedRates && Date.now() < cacheExpiry) {
    return { base: "USD", rates: cachedRates };
  }

  try {
    const res = await fetch(FX_API);
    const json = await res.json();
    if (json.result !== "success" || !json.rates) {
      throw new Error(json["error-type"] || "FX API error");
    }
    cachedRates = json.rates as Record<string, number>;
    cacheExpiry = Date.now() + CACHE_TTL_MS;
    return { base: "USD", rates: cachedRates };
  } catch (err) {
    if (cachedRates) return { base: "USD", rates: cachedRates };
    // Fallback if API fails and no cache
    return {
      base: "USD",
      rates: {
        USD: 1,
        ZAR: 18.5,
        EUR: 0.92,
        GBP: 0.79,
        BWP: 13.5,
        NAD: 18.5,
        LSL: 18.5,
        ZMW: 27,
        KES: 130,
        TZS: 2650,
        UGX: 3750,
        RWF: 1300,
        ETB: 58,
        NGN: 1600,
        GHS: 15,
        XOF: 600,
      },
    };
  }
}

/** Convert amount from USD to target currency */
export function convertUsdTo(amountUsd: number, targetCurrency: string, rates: Record<string, number>): number {
  const rate = rates[targetCurrency] ?? rates[targetCurrency.toUpperCase()];
  if (!rate) return amountUsd;
  return Math.round(amountUsd * rate * 100) / 100;
}
