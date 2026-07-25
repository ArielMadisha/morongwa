/** Catalog unit pricing — discount and bulk tiers. */
import { normalizeBulkTierMaxQty, normalizeBulkTiersForApi } from "../config/bulkTierLimits";

export function isValidCatalogDiscountPrice(discountPrice: unknown, listPrice: number): boolean {
  const d = Number(discountPrice);
  const p = Number(listPrice);
  if (!Number.isFinite(d) || !Number.isFinite(p) || p <= 0) return false;
  return d > 0 && d < p;
}

export function getEffectiveCatalogPrice(product: { price: number; discountPrice?: number | null }): number {
  const price = Number(product.price) || 0;
  if (isValidCatalogDiscountPrice(product.discountPrice, price)) {
    return Number(product.discountPrice);
  }
  return price;
}

export function getProductPriceForQty(
  product: {
    price: number;
    discountPrice?: number | null;
    bulkTiers?: Array<{ minQty: number; maxQty: number; price: number }> | null;
  },
  qty: number
): number {
  const base = getEffectiveCatalogPrice(product);
  const tiers = product?.bulkTiers;
  if (Array.isArray(tiers) && tiers.length > 0 && qty > 0) {
    const tier = tiers
      .filter(
        (t) =>
          qty >= t.minQty &&
          qty <= normalizeBulkTierMaxQty(Number(t.maxQty), Number(t.minQty))
      )
      .sort((a, b) => b.minQty - a.minQty)[0];
    const tierPrice = tier != null ? Number(tier.price) : NaN;
    // Bulk must be a discount — never raise unit price above catalog/discount.
    if (Number.isFinite(tierPrice) && tierPrice >= 0 && tierPrice < base) {
      return tierPrice;
    }
  }
  return base;
}

/** Keep only bulk tiers that discount below the effective catalog unit price. */
export function filterValidBulkDiscountTiers<
  T extends { minQty: number; maxQty: number; price: number },
>(
  tiers: T[] | null | undefined,
  product: { price: number; discountPrice?: number | null }
): T[] | undefined {
  const base = getEffectiveCatalogPrice(product);
  if (!Array.isArray(tiers) || tiers.length === 0 || !(base > 0)) return undefined;
  const kept = tiers.filter((t) => {
    const p = Number(t.price);
    return Number.isFinite(p) && p >= 0 && p < base;
  });
  return kept.length > 0 ? kept : undefined;
}

/** Strip invalid discountPrice before public API responses. */
export function sanitizeProductPricingForApi<T extends Record<string, unknown>>(product: T): T {
  if (!product || typeof product !== "object") return product;
  const out = { ...product } as Record<string, unknown>;
  const price = Number(out.price) || 0;
  if (!isValidCatalogDiscountPrice(out.discountPrice, price)) {
    delete out.discountPrice;
  }
  const tiers = out.bulkTiers;
  if (Array.isArray(tiers)) {
    const valid = filterValidBulkDiscountTiers(
      tiers as Array<{ minQty: number; maxQty: number; price: number }>,
      {
        price,
        discountPrice: out.discountPrice as number | null | undefined,
      }
    );
    if (!valid || valid.length === 0) {
      delete out.bulkTiers;
    } else {
      out.bulkTiers = normalizeBulkTiersForApi(valid);
    }
  }
  return out as T;
}
