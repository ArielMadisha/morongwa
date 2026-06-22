/**
 * SHEIN commission rules (Qwertymates marketplace):
 *
 * - Direct catalog purchase (not via a reseller store): platform retains 100% of margin
 *   (customer price minus SHEIN supplier cost).
 * - Purchase via reseller store: platform takes a flat website fee (~5%) on the line total;
 *   the reseller keeps their markup above catalog price.
 */

import { convertUsdTo } from "../services/fxService";

export const SHEIN_RESELLER_STORE_PLATFORM_FEE_PCT = Number(
  process.env.SHEIN_RESELLER_PLATFORM_FEE_PCT || "5"
);

export function sheinSupplierCostZar(
  supplierCostUsd: number | undefined,
  qty: number,
  rates: Record<string, number>
): number {
  const cost = Number(supplierCostUsd);
  if (!Number.isFinite(cost) || cost <= 0) return 0;
  const q = Math.max(1, qty || 1);
  return Math.round(convertUsdTo(cost * q, "ZAR", rates) * 100) / 100;
}

/**
 * Platform commission ZAR to accumulate on checkout for a SHEIN line.
 */
export function sheinPlatformCommissionZar(params: {
  lineTotalZar: number;
  supplierCostUsd?: number;
  qty: number;
  hasResellerStore: boolean;
  rates: Record<string, number>;
}): number {
  const line = Math.max(0, Number(params.lineTotalZar) || 0);
  if (line <= 0) return 0;

  if (params.hasResellerStore) {
    const feePct = Math.max(0, Math.min(100, SHEIN_RESELLER_STORE_PLATFORM_FEE_PCT));
    return Math.round(line * (feePct / 100) * 100) / 100;
  }

  const cogs = sheinSupplierCostZar(params.supplierCostUsd, params.qty, params.rates);
  return Math.round(Math.max(0, line - cogs) * 100) / 100;
}
