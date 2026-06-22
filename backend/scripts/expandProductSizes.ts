/**
 * Expand product size ranges (e.g. ["S-4XL"] → ["S","M","L","XL","XXL","2XL","3XL","4XL"]).
 * Run: npx ts-node-dev --transpile-only --exit-child scripts/expandProductSizes.ts
 * Dry run: add --dry-run
 */

import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import mongoose from "mongoose";
import Product from "../src/data/models/Product";
import { normalizeProductSizes } from "../src/utils/productSizeTypes";

const dryRun = process.argv.includes("--dry-run");

async function migrate() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error("MONGO_URI not set");
    process.exit(1);
  }
  await mongoose.connect(mongoUri);
  console.log("Connected to MongoDB");

  const products = await Product.find({ sizes: { $exists: true, $ne: [] } })
    .select("_id title sizes")
    .lean();

  let updated = 0;
  for (const p of products) {
    const before = Array.isArray(p.sizes) ? p.sizes.map(String) : [];
    const after = normalizeProductSizes(before);
    if (before.join("|") === after.join("|")) continue;
    console.log(`${p._id} ${p.title}`);
    console.log(`  before: ${before.join(", ")}`);
    console.log(`  after:  ${after.join(", ")}`);
    if (!dryRun) {
      await Product.updateOne({ _id: p._id }, { $set: { sizes: after } });
    }
    updated++;
  }

  console.log(dryRun ? `Would update ${updated} products` : `Updated ${updated} products`);
  await mongoose.disconnect();
  process.exit(0);
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
