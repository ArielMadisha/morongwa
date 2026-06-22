import mongoose from "mongoose";
import Store, { IStore } from "../data/models/Store";
import Supplier, { ISupplier } from "../data/models/Supplier";
import { userCanOwnMultipleStores } from "./multiStoreAccess";

export type EnsureSupplierResult = {
  supplier: ISupplier;
  created: boolean;
  approved: boolean;
};

async function supplierStoreCountForUser(userId: mongoose.Types.ObjectId | string): Promise<number> {
  return Store.countDocuments({ userId, type: "supplier" });
}

/** True when this owner should get a separate Supplier record per supplier-type store. */
export async function userNeedsPerStoreSuppliers(
  userId: mongoose.Types.ObjectId | string
): Promise<boolean> {
  if (await userCanOwnMultipleStores(userId)) return true;
  return (await supplierStoreCountForUser(userId)) > 1;
}

/**
 * Ensure an approved Supplier for marketplace products.
 * Multi-store owners: one Supplier per store (linkedStoreId), without reusing another store's supplier.
 */
export async function ensureApprovedSupplierForStore(params: {
  store: Pick<IStore, "_id" | "userId" | "name">;
  reviewedBy?: mongoose.Types.ObjectId;
}): Promise<EnsureSupplierResult> {
  const { store, reviewedBy } = params;
  const storeName = store.name?.trim() || "My Store";
  const now = new Date();
  const perStore = await userNeedsPerStoreSuppliers(store.userId);

  if (perStore) {
    let supplier = await Supplier.findOne({ linkedStoreId: store._id });
    if (supplier) {
      if (supplier.status !== "approved") {
        supplier.status = "approved";
        supplier.reviewedAt = now;
        if (reviewedBy) supplier.reviewedBy = reviewedBy;
        supplier.rejectionReason = undefined;
        await supplier.save();
      }
      if (supplier.storeName !== storeName) {
        supplier.storeName = storeName;
        await supplier.save();
      }
      return { supplier, created: false, approved: true };
    }

    supplier = await Supplier.create({
      userId: store.userId,
      linkedStoreId: store._id,
      status: "approved",
      type: "individual",
      storeName,
      reviewedAt: now,
      reviewedBy,
    });
    return { supplier, created: true, approved: true };
  }

  let supplier = await Supplier.findOne({ userId: store.userId, status: "approved" });
  if (supplier) {
    if (supplier.storeName !== storeName) {
      supplier.storeName = storeName;
      await supplier.save();
    }
    return { supplier, created: false, approved: true };
  }

  const existing = await Supplier.findOne({ userId: store.userId });
  if (existing) {
    existing.status = "approved";
    existing.storeName = storeName;
    existing.reviewedAt = now;
    if (reviewedBy) existing.reviewedBy = reviewedBy;
    existing.rejectionReason = undefined;
    await existing.save();
    return { supplier: existing, created: false, approved: true };
  }

  supplier = await Supplier.create({
    userId: store.userId,
    status: "approved",
    type: "individual",
    storeName,
    reviewedAt: now,
    reviewedBy,
  });
  return { supplier, created: true, approved: true };
}

/** @deprecated Prefer ensureApprovedSupplierForStore */
export async function ensureApprovedSupplierForUser(params: {
  userId: mongoose.Types.ObjectId | string;
  storeName?: string;
  reviewedBy?: mongoose.Types.ObjectId;
}): Promise<EnsureSupplierResult> {
  const store = await Store.findOne({ userId: params.userId, type: "supplier" }).sort({ createdAt: 1 });
  if (store) {
    return ensureApprovedSupplierForStore({
      store,
      reviewedBy: params.reviewedBy,
    });
  }
  const storeName = params.storeName?.trim() || "My Store";
  const now = new Date();
  let supplier = await Supplier.findOne({ userId: params.userId, status: "approved" });
  if (supplier) {
    if (storeName && supplier.storeName !== storeName) {
      supplier.storeName = storeName;
      await supplier.save();
    }
    return { supplier, created: false, approved: true };
  }
  const existing = await Supplier.findOne({ userId: params.userId });
  if (existing) {
    existing.status = "approved";
    if (storeName) existing.storeName = storeName;
    existing.reviewedAt = now;
    if (params.reviewedBy) existing.reviewedBy = params.reviewedBy;
    existing.rejectionReason = undefined;
    await existing.save();
    return { supplier: existing, created: false, approved: true };
  }
  supplier = await Supplier.create({
    userId: params.userId,
    status: "approved",
    type: "individual",
    storeName,
    reviewedAt: now,
    reviewedBy: params.reviewedBy,
  });
  return { supplier, created: true, approved: true };
}

/** Link a supplier-type Store to its approved Supplier; does not move products between suppliers. */
export async function linkSupplierStore(
  store: IStore,
  reviewedBy?: mongoose.Types.ObjectId
): Promise<{ store: IStore; supplier: ISupplier }> {
  if (store.type !== "supplier") {
    store.type = "supplier";
  }
  const { supplier } = await ensureApprovedSupplierForStore({ store, reviewedBy });
  if (!store.supplierId || String(store.supplierId) !== String(supplier._id)) {
    store.supplierId = supplier._id;
  }
  await store.save();
  return { store, supplier };
}

/** Backfill supplier stores missing supplierId. Never merges two stores onto one supplier for multi-store owners. */
export async function backfillSupplierStoresMissingLink(
  reviewedBy?: mongoose.Types.ObjectId
): Promise<{ linked: number }> {
  let linked = 0;
  const missing = await Store.find({
    type: "supplier",
    $or: [{ supplierId: { $exists: false } }, { supplierId: null }],
  });
  for (const row of missing) {
    const store = await Store.findById(row._id);
    if (!store) continue;
    await linkSupplierStore(store, reviewedBy);
    linked += 1;
  }
  return { linked };
}
