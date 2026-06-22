import mongoose from "mongoose";
import User from "../data/models/User";
import Store from "../data/models/Store";
import { MULTI_STORE_OWNER_USERNAMES } from "../config/multiStoreOwners";
import { AppError } from "../middleware/errorHandler";

export function usernameAllowsMultipleStores(username: string | undefined | null): boolean {
  const u = String(username || "").trim().toLowerCase();
  return u.length > 0 && MULTI_STORE_OWNER_USERNAMES.has(u);
}

export async function userCanOwnMultipleStores(
  userId: mongoose.Types.ObjectId | string
): Promise<boolean> {
  const id = String(userId || "").trim();
  if (!mongoose.Types.ObjectId.isValid(id)) return false;
  const user = await User.findById(id).select("username canOwnMultipleStores").lean();
  if (!user) return false;
  if ((user as { canOwnMultipleStores?: boolean }).canOwnMultipleStores === true) return true;
  return usernameAllowsMultipleStores((user as { username?: string }).username);
}

/** Drop legacy unique index; keep compound index for lookups. */
export async function ensureStoreIndexes(): Promise<void> {
  const collection = Store.collection;
  const indexes = await collection.indexes();
  const legacy = indexes.find(
    (idx) =>
      idx.unique === true &&
      idx.key &&
      Object.keys(idx.key).length === 2 &&
      idx.key.userId === 1 &&
      idx.key.type === 1
  );
  if (legacy?.name) {
    try {
      await collection.dropIndex(legacy.name);
      console.log(`Dropped legacy Store unique index: ${legacy.name}`);
    } catch (err) {
      console.warn("Could not drop legacy Store userId+type unique index:", (err as Error)?.message || err);
    }
  }
  await Store.syncIndexes();
}

export async function syncMultiStoreOwnerFlags(): Promise<void> {
  const usernames = [...MULTI_STORE_OWNER_USERNAMES];
  if (!usernames.length) return;
  const res = await User.updateMany(
    { username: { $in: usernames } },
    { $set: { canOwnMultipleStores: true } }
  );
  if (res.modifiedCount > 0) {
    console.log(`Multi-store flag set for ${res.modifiedCount} user(s)`);
  }
}

export async function assertCanCreateStoreForUser(
  userId: mongoose.Types.ObjectId | string,
  type: "supplier" | "reseller"
): Promise<void> {
  const existing = await Store.countDocuments({ userId, type });
  if (existing === 0) return;
  if (await userCanOwnMultipleStores(userId)) return;
  throw new AppError(
    `This user already has a ${type} store. Only one ${type} store per user is allowed.`,
    409
  );
}
