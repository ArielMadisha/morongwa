import mongoose from "mongoose";
import ResellerWall from "../data/models/ResellerWall";
import Product from "../data/models/Product";
import Supplier from "../data/models/Supplier";
import User from "../data/models/User";
import { effectiveResellerMarkupPctFromWall } from "../config/marketplaceCategoryMarkups";
import { normalizeProductImageUrls } from "../utils/uploadFilePath";

/** 24-char hex only — mongoose's ObjectId.isValid() wrongly accepts 12-char strings. */
function strictObjectIdHex(s: string | null | undefined): string | null {
  if (s == null || typeof s !== "string") return null;
  const t = s.trim();
  return /^[a-fA-F0-9]{24}$/.test(t) ? t : null;
}

function resellerWallFilter(resellerId: mongoose.Types.ObjectId | string) {
  const hex = strictObjectIdHex(String(resellerId));
  if (!hex) return { resellerId };
  const oid = new mongoose.Types.ObjectId(hex);
  return { $or: [{ resellerId: oid }, { resellerId: hex }] };
}

function wallProductIdToHex(pid: unknown): string | null {
  if (pid == null) return null;
  if (typeof pid === "string") return strictObjectIdHex(pid);
  if (typeof pid === "object") {
    const o = pid as { _id?: unknown };
    if (o._id != null) return strictObjectIdHex(String(o._id));
  }
  try {
    return strictObjectIdHex(String(pid));
  } catch {
    return null;
  }
}

function isPopulatedProductDoc(pid: unknown): pid is Record<string, unknown> {
  return (
    typeof pid === "object" &&
    pid != null &&
    "_id" in pid &&
    typeof (pid as { title?: unknown }).title === "string"
  );
}

function coerceNumber(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (v != null && typeof v === "object" && typeof (v as { toString?: () => string }).toString === "function") {
    const n = parseFloat((v as { toString: () => string }).toString());
    if (Number.isFinite(n)) return n;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** JSON-safe product for storefront APIs. */
export function sanitizeStorefrontProduct(raw: any): any {
  if (!raw || typeof raw !== "object") return null;
  try {
    const id = raw._id != null ? String(raw._id) : undefined;
    let supplierId: unknown = raw.supplierId;
    if (supplierId && typeof supplierId === "object" && supplierId !== null && "storeName" in supplierId) {
      supplierId = { storeName: (supplierId as { storeName?: string }).storeName };
    } else if (supplierId != null && typeof supplierId === "object") {
      supplierId = { _id: String((supplierId as { _id?: unknown })._id ?? "") };
    }
    return {
      _id: id,
      title: String(raw.title ?? ""),
      slug: String(raw.slug ?? ""),
      images: normalizeProductImageUrls(raw.images),
      price: coerceNumber(raw.price),
      discountPrice:
        raw.discountPrice != null && raw.discountPrice !== ""
          ? coerceNumber(raw.discountPrice)
          : undefined,
      currency: String(raw.currency ?? "ZAR"),
      allowResell: !!raw.allowResell,
      categories: Array.isArray(raw.categories) ? raw.categories.map((x: unknown) => String(x)) : [],
      supplierId,
      supplierSource: raw.supplierSource,
      active: raw.active !== false,
    };
  } catch {
    return null;
  }
}

export type StorefrontProductRow = {
  productId: string;
  product: Record<string, unknown> | null;
  resellerCommissionPct?: number;
  addedAt?: string;
};

/** Reseller MyStore wall — include inactive products so storefronts stay in sync. */
export async function buildWallProductsResponse(resellerId: string) {
  try {
    const ridHex = strictObjectIdHex(resellerId);
    if (!ridHex) {
      return { resellerId, products: [] as StorefrontProductRow[], reseller: null as null | { name?: string; _id: unknown } };
    }
    const resellerOid = new mongoose.Types.ObjectId(ridHex);

    const wall = await ResellerWall.findOne(resellerWallFilter(resellerOid))
      .populate("products.productId")
      .lean();
    if (!wall) {
      return { resellerId, products: [] as StorefrontProductRow[], reseller: null as null | { name?: string; _id: unknown } };
    }

    const wallRows = wall.products as any[];
    const hexIds = [...new Set(wallRows.map((p) => wallProductIdToHex(p.productId)).filter(Boolean))] as string[];

    let products: any[] = [];
    try {
      products = await Product.find({ _id: { $in: hexIds } })
        .populate("supplierId", "storeName")
        .lean();
    } catch {
      for (const h of hexIds) {
        try {
          const one = await Product.findById(h).populate("supplierId", "storeName").lean();
          if (one) products.push(one);
        } catch {
          /* skip bad id */
        }
      }
    }

    const productMap = new Map<string, any>(products.map((p: any) => [String(p._id), p]));
    const missingHex = hexIds.filter((h) => !productMap.has(h));
    if (missingHex.length > 0) {
      await Promise.all(
        missingHex.map(async (h) => {
          try {
            const one = await Product.findById(h).populate("supplierId", "storeName").lean();
            if (one) productMap.set(String((one as any)._id), one);
          } catch {
            /* skip */
          }
        })
      );
    }

    const wallProducts = wallRows
      .map((wp) => {
        const pid = wp.productId;
        const hex = wallProductIdToHex(pid);
        const raw =
          (hex ? productMap.get(hex) : null) ?? (isPopulatedProductDoc(pid) ? pid : null);
        const product = raw != null ? sanitizeStorefrontProduct(raw) : null;
        const productIdOut = hex ?? (raw && (raw as any)._id != null ? String((raw as any)._id) : pid);
        const cats = (raw as any)?.categories;
        const resellerCommissionPct = effectiveResellerMarkupPctFromWall(wp.resellerCommissionPct, cats);
        return {
          productId: productIdOut != null ? String(productIdOut) : "",
          product,
          resellerCommissionPct,
          addedAt: wp.addedAt,
        };
      })
      .filter((wp) => wp.product != null);

    const reseller = await User.findById(resellerOid).select("name email").lean();
    return {
      resellerId: String(wall.resellerId),
      products: wallProducts.map((wp) => ({
        ...wp,
        addedAt:
          wp.addedAt instanceof Date
            ? wp.addedAt.toISOString()
            : wp.addedAt != null
              ? String(wp.addedAt)
              : undefined,
      })),
      reseller: reseller ? { name: reseller.name, _id: String((reseller as any)._id) } : null,
    };
  } catch (err) {
    console.error("[storefrontCatalog] buildWallProductsResponse", err);
    return {
      resellerId,
      products: [] as StorefrontProductRow[],
      reseller: null as null | { name?: string; _id: unknown },
    };
  }
}

async function resolveSupplierIdForStore(store: {
  _id?: unknown;
  supplierId?: unknown;
}): Promise<mongoose.Types.ObjectId | null> {
  const raw = store.supplierId;
  const hex = raw
    ? strictObjectIdHex(String((raw as { _id?: unknown })?._id ?? raw))
    : null;
  if (hex) return new mongoose.Types.ObjectId(hex);
  const storeId = store._id;
  if (!storeId) return null;
  const supplier = await Supplier.findOne({ linkedStoreId: storeId }).select("_id status").lean();
  if (!supplier || supplier.status !== "approved") return null;
  return supplier._id as mongoose.Types.ObjectId;
}

async function buildSupplierStoreProducts(supplierId: mongoose.Types.ObjectId): Promise<StorefrontProductRow[]> {
  const sup = await Supplier.findById(supplierId).select("status").lean();
  if (!sup || sup.status !== "approved") return [];

  const products = await Product.find({ supplierId, active: true })
    .select("title slug images price discountPrice currency categories active allowResell supplierId supplierSource")
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();

  const rows: StorefrontProductRow[] = [];
  for (const p of products) {
    const product = sanitizeStorefrontProduct(p);
    if (!product) continue;
    rows.push({
      productId: String((p as { _id: unknown })._id),
      product,
      resellerCommissionPct: 0,
    });
  }
  return rows;
}

/** Public catalog for /store/:slug — supplier inventory and/or reseller wall. */
export async function getPublicStoreCatalog(store: {
  _id?: unknown;
  userId?: unknown;
  type?: string;
  supplierId?: unknown;
}): Promise<{ storeType: "supplier" | "reseller"; products: StorefrontProductRow[] }> {
  const ownerId = String((store.userId as { _id?: unknown })?._id ?? store.userId ?? "");
  const storeType = store.type === "reseller" ? "reseller" : "supplier";

  if (storeType === "reseller") {
    const wall = await buildWallProductsResponse(ownerId);
    return { storeType: "reseller", products: wall.products ?? [] };
  }

  const supplierOid = await resolveSupplierIdForStore(store);
  if (supplierOid) {
    const products = await buildSupplierStoreProducts(supplierOid);
    if (products.length) return { storeType: "supplier", products };
  }

  // Same owner may have resell listings while viewing their supplier storefront slug.
  const wall = await buildWallProductsResponse(ownerId);
  if (wall.products?.length) {
    return { storeType: "reseller", products: wall.products };
  }

  return { storeType: "supplier", products: [] };
}
