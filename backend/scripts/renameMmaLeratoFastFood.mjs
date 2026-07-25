#!/usr/bin/env node
/**
 * Rename Mmoja Lerato Fast Food → Mma Lerato Fast Food
 *   node scripts/renameMmaLeratoFastFood.mjs
 */
import "dotenv/config";
import mongoose from "mongoose";

const OLD = "Mmoja Lerato Fast Food";
const NEW = "Mma Lerato Fast Food";
const STORE_ID = "6a625f0dc47192cb4402e615";
const SUPPLIER_ID = "6a625f0ec47192cb4402e616";

await mongoose.connect(process.env.MONGO_URI);
const db = mongoose.connection.db;
const now = new Date();
const storeId = new mongoose.Types.ObjectId(STORE_ID);
const supplierId = new mongoose.Types.ObjectId(SUPPLIER_ID);

await db.collection("stores").updateOne(
  { _id: storeId },
  { $set: { name: NEW, slug: "mma-lerato-fast-food", updatedAt: now } }
);
await db.collection("suppliers").updateOne(
  { _id: supplierId },
  { $set: { storeName: NEW, updatedAt: now } }
);

const products = await db
  .collection("products")
  .find({ supplierId, $or: [{ active: true }, { "tags": "mmoja-lerato" }, { "tags": "mma-lerato" }] })
  .project({ _id: 1, description: 1, tags: 1 })
  .toArray();

let updated = 0;
for (const p of products) {
  const description = String(p.description || "").replaceAll(OLD, NEW);
  const tags = (p.tags || []).map((t) => (t === "mmoja-lerato" ? "mma-lerato" : t));
  await db.collection("products").updateOne(
    { _id: p._id },
    { $set: { description, tags, updatedAt: now } }
  );
  updated += 1;
}

const store = await db.collection("stores").findOne({ _id: storeId }, { projection: { name: 1, slug: 1 } });
const supplier = await db
  .collection("suppliers")
  .findOne({ _id: supplierId }, { projection: { storeName: 1 } });

console.log(JSON.stringify({ store, supplier, productsUpdated: updated }, null, 2));
await mongoose.disconnect();
