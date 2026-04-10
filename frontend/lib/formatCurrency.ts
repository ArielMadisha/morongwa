/**
 * en-ZA currency strings with exactly two fraction digits (e.g. R 114,70).
 * Use for all customer-facing product and checkout amounts.
 */
export function formatCurrencyAmount(price: number, currency = 'ZAR'): string {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: currency || 'ZAR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price);
}
