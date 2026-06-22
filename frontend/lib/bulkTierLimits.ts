/** Keep in sync with `backend/src/config/bulkTierLimits.ts`. */

/** Default max quantity when admin leaves “Max” empty (open-ended bulk band). */
export const BULK_TIER_DEFAULT_MAX_QTY = 1000;

/** Legacy saves used this sentinel for “no max”; treat as {@link BULK_TIER_DEFAULT_MAX_QTY}. */
export const BULK_TIER_LEGACY_OPEN_MAX = 999999;

export function normalizeBulkTierMaxQty(maxQty: number, minQty: number): number {
  const max = Number(maxQty);
  const min = Number(minQty);
  if (!Number.isFinite(max) || max <= 0 || max >= BULK_TIER_LEGACY_OPEN_MAX) {
    return BULK_TIER_DEFAULT_MAX_QTY;
  }
  return max >= min ? max : BULK_TIER_DEFAULT_MAX_QTY;
}

/** Max qty for UI labels (e.g. `3–1000 units`). */
export function displayBulkTierMaxQty(maxQty: number): number {
  return normalizeBulkTierMaxQty(maxQty, 1);
}

export function formatBulkTierRange(minQty: number, maxQty: number): string {
  const min = Number(minQty);
  const max = displayBulkTierMaxQty(maxQty);
  if (!Number.isFinite(min) || min < 1) return `${max} units`;
  if (min === max) return `${min} units`;
  return `${min}–${max} units`;
}
