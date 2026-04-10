/**
 * Product import from external suppliers (CJ, Spocket, EPROLO)
 * All prices stored in USD. Frontend converts to local currency based on user country.
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
): Promise<{ product: any; created: boolean; updated: boolean } | null> {
  const adapter = await getSupplierAdapter("cj");
  if (!adapter) return null;

  const ext = await ExternalSupplier.findOne({ source: "cj", status: "active" }).lean();
  if (!ext) return null;

  const normalizedCjProductId = String(cjProductId || "").trim().replace(/^["']|["']$/g, "");
  if (!normalizedCjProductId) return null;
  const sp = await adapter.getProduct(normalizedCjProductId);
  if (!sp) return null;

  const categoryName = options?.category || sp.categories?.[0];
  const platformPriceVal = platformPrice(sp.supplierCost, categoryName);
  const markupPct = platformMarginPct(categoryName);
  const rule = getPricingRule(categoryName);
  const recPrice = recommendedResellerPrice(platformPriceVal, rule.resellerDefaultMarginPct, categoryName);
  const minPrice = minResalePrice(platformPriceVal, categoryName);

  const baseSlug = slugify(sp.name || sp.sku || normalizedCjProductId).slice(0, 40);
  const uniqueSuffix = `-cj-${normalizedCjProductId.replace(/-/g, "").slice(0, 8)}`;
  let slug = `${baseSlug}${uniqueSuffix}`;
  let n = 1;
  while (await Product.findOne({ slug })) {
    slug = `${baseSlug}-${n}${uniqueSuffix}`;
    n++;
  }
  const existing = await Product.findOne({
    supplierSource: "cj",
    externalProductId: normalizedCjProductId,
  });

  let stock = 999;
  let outOfStock = false;
  if (adapter.getStockByVid && sp.defaultVariantId) {
    const cjStock = await adapter.getStockByVid(sp.defaultVariantId);
    if (cjStock !== null) {
      stock = cjStock;
      outOfStock = cjStock < 1;
    }
  }

  const doc = {
    supplierSource: "cj" as const,
    externalSupplierId: ext._id,
    externalProductId: normalizedCjProductId,
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
    currency: "USD",
    stock,
    outOfStock,
    allowResell: true,
    categories: sp.categories || ["Imported"],
    tags: [],
    active: true,
  };

  if (existing) {
    if (!options?.forceUpdate) return { product: existing, created: false, updated: false };
    await Product.updateOne({ _id: existing._id }, { $set: doc });
    const updated = await Product.findById(existing._id).lean();
    return { product: updated, created: false, updated: true };
  }

  try {
    const product = await Product.create(doc);
    return { product, created: true, updated: false };
  } catch {
    const duplicate = await Product.findOne({
      supplierSource: "cj",
      externalProductId: normalizedCjProductId,
    }).lean();
    if (duplicate) return { product: duplicate, created: false, updated: false };
    throw new Error("Failed to import CJ product");
  }
}

/** Search CJ products only (no import) – for admin browse/preview */
export async function searchCJProducts(
  query: string,
  options?: { page?: number; size?: number }
): Promise<Array<{ id: string; name: string; sku?: string; supplierCost: number; images: string[]; categories?: string[] }>> {
  const adapter = await getSupplierAdapter("cj");
  if (!adapter) return [];

  const page = options?.page ?? 1;
  const size = Math.min(options?.size ?? 20, 100);
  const results = await adapter.searchProducts(query, { page, size });
  return results.map((sp) => ({
    id: sp.id,
    name: sp.name,
    sku: sp.sku,
    supplierCost: sp.supplierCost,
    images: sp.images || [],
    categories: sp.categories,
  }));
}

export async function searchAndImportFromCJ(
  query: string,
  limit = 10
): Promise<Array<{ product: any; created: boolean; updated: boolean } | null>> {
  const adapter = await getSupplierAdapter("cj");
  if (!adapter) return [];

  const results = await adapter.searchProducts(query, { page: 1, size: limit });
  const imported: Array<{ product: any; created: boolean; updated: boolean } | null> = [];

  for (const sp of results) {
    const r = await importProductFromCJ(sp.id, { forceUpdate: false });
    imported.push(r);
  }
  return imported;
}

/** Import product from EPROLO by product ID */
export async function importProductFromEprolo(
  eproloProductId: string,
  options?: { category?: string; forceUpdate?: boolean }
): Promise<{ product: any; created: boolean; updated: boolean } | null> {
  const adapter = await getSupplierAdapter("eprolo");
  if (!adapter) return null;

  const ext = await ExternalSupplier.findOne({ source: "eprolo", status: "active" }).lean();
  if (!ext) return null;

  const id = String(eproloProductId || "").trim().replace(/^["']|["']$/g, "");
  const sp = await adapter.getProduct(id);
  if (!sp) return null;

  const categoryName = options?.category || sp.categories?.[0];
  const platformPriceVal = platformPrice(sp.supplierCost, categoryName);
  const markupPct = platformMarginPct(categoryName);
  const rule = getPricingRule(categoryName);
  const recPrice = recommendedResellerPrice(platformPriceVal, rule.resellerDefaultMarginPct, categoryName);
  const minPrice = minResalePrice(platformPriceVal, categoryName);

  const baseSlug = slugify(sp.name || sp.sku || id).slice(0, 40);
  const uniqueSuffix = `-eprolo-${id.replace(/-/g, "").slice(0, 8)}`;
  let slug = `${baseSlug}${uniqueSuffix}`;
  let n = 1;
  while (await Product.findOne({ slug })) {
    slug = `${baseSlug}-${n}${uniqueSuffix}`;
    n++;
  }
  const existing = await Product.findOne({
    supplierSource: "eprolo",
    externalProductId: id,
  });

  let stock = 999;
  let outOfStock = false;
  // Prefer variantlist inventory from add_product response (most reliable)
  const raw = sp.raw as any;
  const variants = raw?.variantlist || raw?.variants;
  if (Array.isArray(variants) && variants.length > 0) {
    const total = variants.reduce((sum: number, v: any) => sum + (Number(v.inventory_quantity) || 0), 0);
    if (total >= 0) {
      stock = total;
      outOfStock = total < 1;
    }
  }
  // Fallback: product_inventory API when variantlist has no inventory
  if (stock === 999 && adapter.getStockByVid && sp.defaultVariantId) {
    const eproloStock = await adapter.getStockByVid(sp.defaultVariantId);
    if (eproloStock !== null) {
      stock = eproloStock;
      outOfStock = eproloStock < 1;
    }
  }

  const doc = {
    supplierSource: "eprolo" as const,
    externalSupplierId: ext._id,
    externalProductId: id,
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
    currency: "USD",
    stock,
    outOfStock,
    allowResell: true,
    categories: sp.categories || ["Imported"],
    tags: [],
    active: true,
  };

  if (existing) {
    if (!options?.forceUpdate) return { product: existing, created: false, updated: false };
    await Product.updateOne({ _id: existing._id }, { $set: doc });
    const updated = await Product.findById(existing._id).lean();
    return { product: updated, created: false, updated: true };
  }

  try {
    const product = await Product.create(doc);
    return { product, created: true, updated: false };
  } catch {
    const duplicate = await Product.findOne({
      supplierSource: "eprolo",
      externalProductId: id,
    }).lean();
    if (duplicate) return { product: duplicate, created: false, updated: false };
    throw new Error("Failed to import EPROLO product");
  }
}

/** Search EPROLO products only (browse) */
export async function searchEproloProducts(
  query: string,
  options?: { page?: number; size?: number }
): Promise<Array<{ id: string; name: string; sku?: string; supplierCost: number; images: string[]; categories?: string[] }>> {
  const adapter = await getSupplierAdapter("eprolo");
  if (!adapter) return [];

  const page = options?.page ?? 1;
  const size = Math.min(options?.size ?? 20, 100);
  const results = await adapter.searchProducts(query, { page, size });
  return results.map((sp) => ({
    id: sp.id,
    name: sp.name,
    sku: sp.sku,
    supplierCost: sp.supplierCost,
    images: sp.images || [],
    categories: sp.categories,
  }));
}

export async function searchAndImportFromEprolo(
  query: string,
  limit = 10
): Promise<Array<{ product: any; created: boolean; updated: boolean } | null>> {
  const adapter = await getSupplierAdapter("eprolo");
  if (!adapter) return [];

  const results = await adapter.searchProducts(query, { page: 1, size: limit });
  const imported: Array<{ product: any; created: boolean; updated: boolean } | null> = [];

  for (const sp of results) {
    const r = await importProductFromEprolo(sp.id, { forceUpdate: false });
    imported.push(r);
  }
  return imported;
}
