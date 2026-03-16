/**
 * Product import from external suppliers (CJ, Spocket, EPROLO)
 * Uses 2-tier pricing: Supplier Cost → Platform Price → Reseller Final Price
 */

import Product from "../data/models/Product";
import ExternalSupplier from "../data/models/ExternalSupplier";
import { getSupplierAdapter } from "./suppliers/supplierService";
import {
  platformPrice,
  recommendedResellerPrice,
  minResalePrice,
  platformMarginPct,
  getPricingRule,
} from "../config/twoTierPricing";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function importProductFromCJ(
  cjProductId: string,
  options?: { category?: string; forceUpdate?: boolean }
): Promise<{ product: any; created: boolean } | null> {
  const adapter = await getSupplierAdapter("cj");
  if (!adapter) return null;

  const ext = await ExternalSupplier.findOne({ source: "cj", status: "active" }).lean();
  if (!ext) return null;

  const sp = await adapter.getProduct(cjProductId);
  if (!sp) return null;

  const categoryName = options?.category || sp.categories?.[0];
  const platformPriceVal = platformPrice(sp.supplierCost, categoryName);
  const markupPct = platformMarginPct(categoryName);
  const rule = getPricingRule(categoryName);
  const recPrice = recommendedResellerPrice(platformPriceVal, rule.resellerDefaultMarginPct, categoryName);
  const minPrice = minResalePrice(platformPriceVal, categoryName);

  const baseSlug = slugify(sp.name || sp.sku || cjProductId).slice(0, 40);
  const uniqueSuffix = `-cj-${cjProductId.replace(/-/g, "").slice(0, 8)}`;
  let slug = `${baseSlug}${uniqueSuffix}`;
  let n = 1;
  while (await Product.findOne({ slug })) {
    slug = `${baseSlug}-${n}${uniqueSuffix}`;
    n++;
  }
  const existing = await Product.findOne({
    supplierSource: "cj",
    externalProductId: cjProductId,
    externalSupplierId: ext._id,
  });

  const doc = {
    supplierSource: "cj" as const,
    externalSupplierId: ext._id,
    externalProductId: cjProductId,
    externalData: sp.raw,
    supplierCost: sp.supplierCost,
    qwertymatesMarkupPct: markupPct,
    recommendedResellerPrice: Math.round(recPrice * 100) / 100,
    minResalePrice: Math.round(minPrice * 100) / 100,
    resellerMarginPct: rule.resellerDefaultMarginPct,
    title: sp.name,
    slug,
    description: sp.description || "",
    images: sp.images || [],
    price: Math.round(platformPriceVal * 100) / 100,
    currency: "ZAR",
    stock: 999,
    outOfStock: false,
    allowResell: true,
    categories: sp.categories || ["Imported"],
    tags: [],
    active: true,
  };

  if (existing) {
    if (!options?.forceUpdate) return { product: existing, created: false };
    await Product.updateOne({ _id: existing._id }, { $set: doc });
    const updated = await Product.findById(existing._id).lean();
    return { product: updated, created: false };
  }

  const product = await Product.create(doc);
  return { product, created: true };
}

export async function searchAndImportFromCJ(
  query: string,
  limit = 10
): Promise<Array<{ product: any; created: boolean } | null>> {
  const adapter = await getSupplierAdapter("cj");
  if (!adapter) return [];

  const results = await adapter.searchProducts(query, { page: 1, size: limit });
  const imported: Array<{ product: any; created: boolean } | null> = [];

  for (const sp of results) {
    const r = await importProductFromCJ(sp.id, { forceUpdate: false });
    imported.push(r);
  }
  return imported;
}
