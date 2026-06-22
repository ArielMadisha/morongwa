/**
 * Platform policy: Indian rupee (INR) is not used as a stored or API-facing catalog currency.
 * Legacy rows may still have currency=INR; normalize to ZAR with USD-anchor fallbacks (same order of magnitude as frontend formatCurrency).
 */

import { sanitizeProductPricingForApi } from "./productPricing";

const INR_PER_USD = 83;
const ZAR_PER_USD = 18.5;

function inrToZarAmount(amount: number): number {
  if (!Number.isFinite(amount)) return 0;
  return Math.round((amount / INR_PER_USD) * ZAR_PER_USD * 100) / 100;
}

/** Lean / plain JSON product — returns a shallow clone when INR is converted. */
export function normalizeProductCurrencyInrToZarForApi<T extends Record<string, unknown>>(
  product: T | null | undefined
): T | null | undefined {
  if (!product || typeof product !== "object") return product;
  const cur = String((product as { currency?: unknown }).currency ?? "")
    .trim()
    .toUpperCase();
  if (cur !== "INR") return sanitizeProductPricingForApi(product) as T;
  const out = { ...product } as Record<string, unknown>;
  out.currency = "ZAR";
  out.price = inrToZarAmount(Number((product as { price?: unknown }).price));
  const disc = (product as { discountPrice?: unknown }).discountPrice;
  if (disc != null && disc !== "" && Number.isFinite(Number(disc))) {
    out.discountPrice = inrToZarAmount(Number(disc));
  }
  const tiers = (product as { bulkTiers?: unknown }).bulkTiers;
  if (Array.isArray(tiers)) {
    out.bulkTiers = tiers.map((t: any) => ({
      ...t,
      price: inrToZarAmount(Number(t?.price)),
    }));
  }
  return sanitizeProductPricingForApi(out) as T;
}

export function mapProductsStripInrForApi<T extends Record<string, unknown>>(products: T[]): T[] {
  return products.map((p) => normalizeProductCurrencyInrToZarForApi(p) as T);
}

export function normalizeTvPostProductCurrencyInResponse<T extends Record<string, unknown>>(post: T): T {
  const pid = post.productId as unknown;
  if (pid && typeof pid === "object" && !Array.isArray(pid) && (pid as { price?: unknown }).price != null) {
    return { ...post, productId: normalizeProductCurrencyInrToZarForApi(pid as Record<string, unknown>) } as T;
  }
  return post;
}

export function mapTvFeedStripInr<T extends Record<string, unknown>>(posts: T[]): T[] {
  return posts.map((p) => normalizeTvPostProductCurrencyInResponse(p));
}

export function coerceCreateProductCurrencyFields(input: {
  currency?: string;
  price: number;
  discountPrice?: number;
  bulkTiers?: Array<{ minQty: number; maxQty: number; price: number }>;
}): { currency: string; price: number; discountPrice?: number; bulkTiers?: typeof input.bulkTiers } {
  const cur = String(input.currency || "ZAR")
    .trim()
    .toUpperCase();
  if (cur !== "INR") {
    return {
      currency: cur || "ZAR",
      price: Number(input.price),
      ...(input.discountPrice != null ? { discountPrice: Number(input.discountPrice) } : {}),
      ...(input.bulkTiers ? { bulkTiers: input.bulkTiers } : {}),
    };
  }
  return {
    currency: "ZAR",
    price: inrToZarAmount(Number(input.price)),
    ...(input.discountPrice != null ? { discountPrice: inrToZarAmount(Number(input.discountPrice)) } : {}),
    ...(input.bulkTiers
      ? {
          bulkTiers: input.bulkTiers.map((t) => ({
            ...t,
            price: inrToZarAmount(Number(t.price)),
          })),
        }
      : {}),
  };
}

/** Mutates a Mongoose Product document before save when currency is INR. */
export function stripInrFromMongooseProductDoc(product: {
  currency?: string;
  price?: number;
  discountPrice?: number | null;
  bulkTiers?: Array<{ minQty: number; maxQty: number; price: number }>;
}): void {
  const cur = String(product.currency || "")
    .trim()
    .toUpperCase();
  if (cur !== "INR") return;
  (product as { currency?: string }).currency = "ZAR";
  (product as { price?: number }).price = inrToZarAmount(Number(product.price));
  if (product.discountPrice != null) {
    const d = Number(product.discountPrice);
    if (Number.isFinite(d)) (product as { discountPrice?: number }).discountPrice = inrToZarAmount(d);
  }
  if (Array.isArray(product.bulkTiers)) {
    (product as { bulkTiers?: typeof product.bulkTiers }).bulkTiers = product.bulkTiers.map((t) => ({
      ...t,
      price: inrToZarAmount(Number(t.price)),
    }));
  }
}
