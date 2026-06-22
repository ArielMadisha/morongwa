/**
 * SHEIN catalog pricing — pass-through (SHEIN prices already include their markup).
 * Qwertymates does not add a platform multiplier on import.
 */

export function sheinCatalogPrice(supplierCostUsd: number): number {
  const n = Number(supplierCostUsd);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100) / 100;
}

/** Platform markup % stored on Product — always 0 for SHEIN imports. */
export function sheinPlatformMarkupPct(): number {
  return 0;
}

/**
 * Resellers may still add their own wall markup at checkout.
 * MAP / recommended price hints use a modest default reseller margin on top of catalog price.
 */
export function sheinRecommendedResellerPrice(catalogPriceUsd: number, resellerMarginPct = 30): number {
  const margin = Math.max(0, Math.min(60, resellerMarginPct)) / 100;
  return Math.round((catalogPriceUsd / (1 - margin)) * 100) / 100;
}

export function sheinMinResalePrice(catalogPriceUsd: number, minResellerMarginPct = 15): number {
  const margin = Math.max(0, Math.min(60, minResellerMarginPct)) / 100;
  return Math.round((catalogPriceUsd / (1 - margin)) * 100) / 100;
}
