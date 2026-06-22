/**
 * Users who may own more than one store of the same type (supplier / reseller).
 * Also set `canOwnMultipleStores` on the User document (synced on DB connect).
 */
export const MULTI_STORE_OWNER_USERNAMES = new Set(
  ["francinahmadisha"].map((u) => u.trim().toLowerCase()).filter(Boolean)
);
