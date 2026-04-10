import mongoose from "mongoose";
import Product from "../data/models/Product";
import Supplier from "../data/models/Supplier";

/** Dropship integrations that appear in the public catalog without a local approved supplier record. */
export const DROPSHIP_SOURCES = ["cj", "spocket", "eprolo"] as const;

export async function getApprovedSupplierIds(): Promise<mongoose.Types.ObjectId[]> {
  return Supplier.find({ status: "approved" })
    .select("_id")
    .lean()
    .then((docs) => docs.map((d) => d._id));
}

/**
 * Mongo filter for products shown on the landing page / marketplace (approved suppliers or dropship).
 * Returns null only if the $or branch would be empty (should not happen while dropship exists).
 */
export function buildPublicProductMatch(approvedSupplierIds: mongoose.Types.ObjectId[]): Record<string, unknown> | null {
  const or: Record<string, unknown>[] = [
    ...(approvedSupplierIds.length > 0 ? [{ supplierId: { $in: approvedSupplierIds } }] : []),
    { supplierSource: { $in: [...DROPSHIP_SOURCES] } },
  ];
  if (or.length === 0) return null;
  return { active: true, $or: or };
}

export async function countPublicListableProducts(): Promise<number> {
  const approvedSupplierIds = await getApprovedSupplierIds();
  const match = buildPublicProductMatch(approvedSupplierIds);
  if (!match) return 0;
  return Product.countDocuments(match);
}

/** True if this document would be returned by GET /api/products (same rules as the aggregate match). */
export async function isProductPubliclyListable(product: {
  active?: boolean;
  supplierId?: mongoose.Types.ObjectId | null;
  supplierSource?: string;
}): Promise<boolean> {
  if (!product.active) return false;
  const src = product.supplierSource;
  if (src && DROPSHIP_SOURCES.includes(src as (typeof DROPSHIP_SOURCES)[number])) return true;
  if (!product.supplierId) return false;
  const sup = await Supplier.findById(product.supplierId).select("status").lean();
  return sup?.status === "approved";
}
