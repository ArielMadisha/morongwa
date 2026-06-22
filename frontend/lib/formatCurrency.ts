/**
 * en-ZA currency strings with exactly two fraction digits (e.g. R 114,70).
 * Use for all customer-facing product and checkout amounts.
 * INR is never shown (en-ZA + INR renders ₹); coerce to ZAR using USD-base fallbacks.
 */
export function formatCurrencyAmount(price: number, currency = 'ZAR'): string {
  const raw = String(currency || 'ZAR')
    .trim()
    .toUpperCase();
  let amount = Number(price);
  if (!Number.isFinite(amount)) amount = 0;

  let code = raw === 'INR' ? 'ZAR' : raw;
  if (raw === 'INR') {
    const inrPerUsd = 83;
    const zarPerUsd = 18.5;
    amount = Math.round((amount / inrPerUsd) * zarPerUsd * 100) / 100;
  }

  const locale = code === 'BWP' ? 'en-BW' : code === 'ZMW' ? 'en-ZM' : 'en-ZA';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: code,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}
