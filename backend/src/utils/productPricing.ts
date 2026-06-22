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
  const tiers = product?.bulkTiers;
  if (Array.isArray(tiers) && tiers.length > 0 && qty > 0) {
    const tier = tiers
      .filter(
        (t) =>
          qty >= t.minQty &&
          qty <= normalizeBulkTierMaxQty(Number(t.maxQty), Number(t.minQty))
      )
      .sort((a, b) => b.minQty - a.minQty)[0];
    if (tier && Number(tier.price) >= 0) return Number(tier.price);
  }
  return getEffectiveCatalogPrice(product);
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
    out.bulkTiers = normalizeBulkTiersForApi(
      tiers as Array<{ minQty: number; maxQty: number; price: number }>
    );
  }
  return out as T;
}
