/** Keep in sync with `frontend/lib/bulkTierLimits.ts`. */

export const BULK_TIER_DEFAULT_MAX_QTY = 1000;
export const BULK_TIER_LEGACY_OPEN_MAX = 999999;

export function normalizeBulkTierMaxQty(maxQty: number, minQty: number): number {
  const max = Number(maxQty);
  const min = Number(minQty);
  if (!Number.isFinite(max) || max <= 0 || max >= BULK_TIER_LEGACY_OPEN_MAX) {
    return BULK_TIER_DEFAULT_MAX_QTY;
  }
  return max >= min ? max : BULK_TIER_DEFAULT_MAX_QTY;
}

export function normalizeBulkTiersForApi<T extends { minQty: number; maxQty: number; price: number }>(
  tiers: T[] | null | undefined
): T[] | undefined {
  if (!Array.isArray(tiers) || tiers.length === 0) return undefined;
  return tiers.map((t) => ({
    ...t,
    maxQty: normalizeBulkTierMaxQty(Number(t.maxQty), Number(t.minQty)),
  }));
}
