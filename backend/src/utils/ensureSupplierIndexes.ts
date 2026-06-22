import Supplier from "../data/models/Supplier";

/** Drop legacy unique userId index so multi-store owners can have one Supplier per store. */
export async function ensureSupplierIndexes(): Promise<void> {
  const collection = Supplier.collection;
  const indexes = await collection.indexes();
  const legacy = indexes.find(
    (idx) =>
      idx.unique === true &&
      idx.key &&
      Object.keys(idx.key).length === 1 &&
      idx.key.userId === 1
  );
  if (legacy?.name) {
    try {
      await collection.dropIndex(legacy.name);
      console.log(`Dropped legacy Supplier unique index: ${legacy.name}`);
    } catch (err) {
      console.warn(
        "Could not drop legacy Supplier userId unique index:",
        (err as Error)?.message || err
      );
    }
  }
  const linkedIdx = indexes.find((idx) => idx.key?.linkedStoreId === 1);
  if (linkedIdx?.name && linkedIdx.unique !== true) {
    try {
      await collection.dropIndex(linkedIdx.name);
      console.log(`Dropped non-unique linkedStoreId index: ${linkedIdx.name}`);
    } catch (err) {
      console.warn("Could not drop linkedStoreId index:", (err as Error)?.message || err);
    }
  }
  await Supplier.syncIndexes();
}
