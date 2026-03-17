/**
 * Migration: Add supplierSource: "internal" to existing products
 * Run: npx ts-node scripts/migrateProductSupplierSource.ts
 */

import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import mongoose from "mongoose";

async function migrate() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error("❌ MONGO_URI not set");
    process.exit(1);
  }
  await mongoose.connect(mongoUri);
  console.log("✅ Connected to MongoDB");

  const result = await mongoose.connection.db
    ?.collection("products")
    ?.updateMany(
      { supplierSource: { $exists: false } },
      { $set: { supplierSource: "internal" } }
    );

  console.log(`✅ Updated ${result?.modifiedCount ?? 0} products with supplierSource: "internal"`);
  await mongoose.disconnect();
  process.exit(0);
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
