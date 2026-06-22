import { formatCurrencyAmount } from '@/lib/formatCurrency';
import { isStoreNativeCatalogCurrency } from '@/lib/storeProductCurrency';

/**
 * Marketplace catalog: show store-native currency (e.g. BWP Pula for Botswana stores).
 * USD/INR still convert to ZAR for display. Checkout converts to ZAR for PayGate.
 */
export function formatCatalogProductPrice(
  amount: number,
  sourceCurrency: string | undefined,
  rates: Record<string, number> | undefined
): string {
  const from = String(sourceCurrency || 'ZAR').trim().toUpperCase();
  if (isStoreNativeCatalogCurrency(from)) {
    return formatCurrencyAmount(amount, from);
  }
  return formatCatalogAmountInZar(amount, sourceCurrency, rates);
}

/**
 * Legacy: force ZAR display (dropship USD, etc.).
 * `rates` are USD-quoted like `/api/fx/rates` (units per 1 USD).
 */
export function formatCatalogAmountInZar(
  amount: number,
  sourceCurrency: string | undefined,
  rates: Record<string, number> | undefined
): string {
  const from = String(sourceCurrency || 'ZAR')
    .trim()
    .toUpperCase();
  if (!Number.isFinite(amount)) return formatCurrencyAmount(0, 'ZAR');
  if (from === 'ZAR') return formatCurrencyAmount(amount, 'ZAR');

  const r = rates || {};
  const fromRate = Number(r[from] ?? 0);
  const zarRate = Number(r.ZAR ?? 0);

  if (!(fromRate > 0) || !(zarRate > 0)) {
    if (from === 'USD') {
      const z = Number(r.ZAR ?? 18.5);
      return formatCurrencyAmount(Math.round(amount * z * 100) / 100, 'ZAR');
    }
    if (from === 'INR') {
      const inrPerUsd = 83;
      const z = Number(r.ZAR ?? 18.5);
      return formatCurrencyAmount(Math.round((amount / inrPerUsd) * z * 100) / 100, 'ZAR');
    }
    return formatCurrencyAmount(amount, 'ZAR');
  }
  const usd = amount / fromRate;
  const converted = Math.round(usd * zarRate * 100) / 100;
  return formatCurrencyAmount(converted, 'ZAR');
}
