const FX_CACHE_KEY = 'qwertymates_fx_rates_v1';
const FX_CACHE_TTL_MS = 60 * 60 * 1000; // match backend hourly cache

type FxCachePayload = {
  rates: Record<string, number>;
  at: number;
};

export const FX_RATES_FALLBACK: Record<string, number> = {
  USD: 1,
  ZAR: 18.5,
  EUR: 0.92,
};

export function readCachedFxRates(): Record<string, number> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(FX_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FxCachePayload;
    if (!parsed?.rates || typeof parsed.at !== 'number') return null;
    if (Date.now() - parsed.at > FX_CACHE_TTL_MS) return null;
    return parsed.rates;
  } catch {
    return null;
  }
}

export function writeCachedFxRates(rates: Record<string, number>): void {
  if (typeof window === 'undefined') return;
  try {
    const payload: FxCachePayload = { rates, at: Date.now() };
    window.sessionStorage.setItem(FX_CACHE_KEY, JSON.stringify(payload));
  } catch {
    /* quota / private mode */
  }
}
