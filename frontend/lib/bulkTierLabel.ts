import { formatBulkTierRange } from '@/lib/bulkTierLimits';

/** Human-readable bulk tier hint for product cards. */
export function bulkTierSummary(
  tiers: Array<{ minQty: number; maxQty: number; price: number }> | undefined | null,
  formatPrice: (n: number) => string
): string | null {
  if (!Array.isArray(tiers) || tiers.length === 0) return null;
  const sorted = [...tiers].sort((a, b) => a.minQty - b.minQty);
  return sorted
    .map((t) => `${formatBulkTierRange(t.minQty, t.maxQty)}: ${formatPrice(t.price)}`)
    .join(' · ');
}
