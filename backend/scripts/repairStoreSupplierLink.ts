/**
 * Link admin-created stores to approved Supplier profiles (marketplace product upload).
 *
 * Usage:
 *   npm run repair:store-supplier
 *   npm run repair:store-supplier -- --name="P100"
 */
import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.join(__dirname, "../.env") });

import { connectDB } from "../src/data/db";
import Store from "../src/data/models/Store";
import {
  backfillSupplierStoresMissingLink,
  linkSupplierStore,
} from "../src/utils/ensureSupplierForStore";

async function main() {
  await connectDB();
  const nameArg = process.argv.find((a) => a.startsWith("--name="));
  const nameNeedle = nameArg ? nameArg.slice("--name=".length).trim() : "";

  let promoted = 0;
  if (nameNeedle) {
    const re = new RegExp(nameNeedle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const stores = await Store.find({ name: re });
    if (!stores.length) {
      console.log(`No stores matched name /${nameNeedle}/i`);
    }
    for (const store of stores) {
      const beforeType = store.type;
      const { supplier } = await linkSupplierStore(store);
      if (beforeType !== "supplier") promoted += 1;
      console.log(
        `OK: ${store.name} (${store.slug}) -> supplier ${supplier._id} [${supplier.storeName}] status=${supplier.status}`
      );
    }
  }

  const { linked } = await backfillSupplierStoresMissingLink();
  console.log(`Backfill: linked ${linked} supplier store(s); promoted by name: ${promoted}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
