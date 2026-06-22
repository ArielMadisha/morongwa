import mongoose from "mongoose";
import Supplier, { ISupplier } from "../data/models/Supplier";
import Store from "../data/models/Store";
import { AppError } from "../middleware/errorHandler";

export type SupplierProfileRow = {
  _id: mongoose.Types.ObjectId;
  storeName?: string;
  status: string;
  linkedStoreId?: mongoose.Types.ObjectId;
  country?: string;
  countryCode?: string;
};

type SupplierStoreLean = {
  country?: string;
  countryCode?: string;
  name?: string;
  address?: string;
};

/** Live supplier-type store for a profile (null after admin permanent store delete). */
export async function findLiveSupplierStoreForProfile(supplier: {
  _id: unknown;
  linkedStoreId?: unknown;
}): Promise<SupplierStoreLean | null> {
  const sid = supplier._id;
  if (supplier.linkedStoreId) {
    const byLink = await Store.findById(supplier.linkedStoreId)
      .select("country countryCode name address type")
      .lean();
    if (byLink && (byLink as { type?: string }).type === "supplier") {
      return byLink as SupplierStoreLean;
    }
  }
  const bySupplier = await Store.findOne({ supplierId: sid, type: "supplier" })
    .select("country countryCode name address type")
    .lean();
  return bySupplier ? (bySupplier as SupplierStoreLean) : null;
}

export async function listApprovedSupplierProfilesForUser(
  userId: mongoose.Types.ObjectId | string
): Promise<SupplierProfileRow[]> {
  const suppliers = await Supplier.find({ userId, status: "approved" })
    .sort({ storeName: 1 })
    .lean();
  const rows: SupplierProfileRow[] = [];
  for (const s of suppliers) {
    const store = await findLiveSupplierStoreForProfile(s);
    if (!store) continue;
    rows.push({
      _id: s._id,
      storeName: s.storeName || store.name,
      status: s.status,
      linkedStoreId: s.linkedStoreId,
      country: store.country,
      countryCode: store.countryCode,
    });
  }
  return rows;
}

/** Resolve which supplier profile a user is uploading under (multi-store owners must pass supplierId). */
export async function resolveSupplierForProductUpload(
  userId: mongoose.Types.ObjectId | string,
  supplierId?: string
): Promise<ISupplier> {
  const allApproved = await Supplier.find({ userId, status: "approved" });
  const approved: ISupplier[] = [];
  for (const s of allApproved) {
    if (await findLiveSupplierStoreForProfile(s)) approved.push(s);
  }
  if (!approved.length) {
    throw new AppError(
      "Only verified suppliers can add products. Apply to become a supplier first.",
      403
    );
  }
  const sid = String(supplierId || "").trim();
  if (sid) {
    const match = approved.find((s) => String(s._id) === sid);
    if (!match) {
      throw new AppError("Supplier profile not found or not approved for your account.", 403);
    }
    const liveStore = await findLiveSupplierStoreForProfile(match);
    if (!liveStore) {
      throw new AppError("That supplier store was removed. Choose another store profile.", 403);
    }
    return match;
  }
  if (approved.length === 1) return approved[0]!;
  throw new AppError(
    "Select which supplier store to load products under (The P100 Store, Cheap Cheap Store, etc.).",
    400
  );
}

/** Attach store country + address fields for admin supplier lists / dropdowns. */
export async function enrichSuppliersWithStoreCountry<T extends { _id: unknown; linkedStoreId?: unknown }>(
  suppliers: T[]
): Promise<(T & { country?: string; countryCode?: string; storeAddress?: string })[]> {
  return Promise.all(
    suppliers.map(async (s) => {
      const store = await findLiveSupplierStoreForProfile(s);
      return {
        ...s,
        country: store?.country,
        countryCode: store?.countryCode,
        storeAddress: store?.address,
      };
    })
  );
}

/** Drop supplier profiles whose marketplace store was permanently deleted. */
export async function filterSuppliersWithLiveStore<T extends { _id: unknown; linkedStoreId?: unknown }>(
  suppliers: T[]
): Promise<T[]> {
  const out: T[] = [];
  for (const s of suppliers) {
    if (await findLiveSupplierStoreForProfile(s)) out.push(s);
  }
  return out;
}
