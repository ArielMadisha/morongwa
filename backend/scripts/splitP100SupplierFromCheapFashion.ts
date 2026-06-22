/**
 * Francinah Madisha: separate "The P100 Store" supplier from "Cheap Fashion".
 * Keeps all existing products on the Cheap Fashion supplier (no product updates).
 *
 *   npm run split:p100-supplier
 */
import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.join(__dirname, "../.env") });

import { connectDB } from "../src/data/db";
import Store from "../src/data/models/Store";
import Supplier from "../src/data/models/Supplier";
import Product from "../src/data/models/Product";
import { ensureSupplierIndexes } from "../src/utils/ensureSupplierIndexes";
import { linkSupplierStore } from "../src/utils/ensureSupplierForStore";

const CHEAP_SUPPLIER_ID = "6a05bd9cde52613893a80a71";

async function main() {
  await connectDB();
  await ensureSupplierIndexes();

  const cheapStore = await Store.findOne({ name: /cheap fashion/i, type: "supplier" });
  const p100Store = await Store.findOne({ name: /p100/i, type: "supplier" });
  if (!cheapStore || !p100Store) {
    console.error("Could not find Cheap Fashion and/or P100 supplier stores");
    process.exit(1);
  }

  const cheapSupplier = await Supplier.findById(CHEAP_SUPPLIER_ID);
  if (!cheapSupplier) {
    console.error("Cheap Fashion supplier record not found");
    process.exit(1);
  }

  cheapSupplier.storeName = cheapStore.name;
  cheapSupplier.linkedStoreId = cheapStore._id;
  await cheapSupplier.save();

  cheapStore.supplierId = cheapSupplier._id;
  await cheapStore.save();

  const productCount = await Product.countDocuments({ supplierId: cheapSupplier._id });
  console.log(`Cheap Fashion supplier ${cheapSupplier._id}: ${productCount} products (unchanged)`);

  const { supplier: p100Supplier } = await linkSupplierStore(p100Store);
  const p100Products = await Product.countDocuments({ supplierId: p100Supplier._id });
  console.log(`P100 supplier ${p100Supplier._id} (${p100Supplier.storeName}): ${p100Products} products`);

  const approved = await Supplier.find({ status: "approved" })
    .select("_id storeName linkedStoreId userId")
    .lean();
  console.log("\nApproved suppliers:");
  for (const s of approved) {
    const n = await Product.countDocuments({ supplierId: s._id });
    console.log(`  - ${s.storeName} (${s._id}) products=${n}`);
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
