/**
 * Sync stock for all CJ products from CJ Dropshipping API
 * Run: npm run sync:cj-stock
 *
 * Fetches real inventory from CJ for each imported product and updates
 * Product.stock and Product.outOfStock. Run periodically (e.g. every 6–12 hours)
 * via cron to avoid selling out-of-stock items.
 *
 * Requires CJ_API_KEY in .env and seed:external-suppliers to have been run.
 */

import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import mongoose from "mongoose";
import { syncCjProductStock } from "../src/services/cjStockSyncService";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/morongwa";

async function main() {
  await mongoose.connect(MONGODB_URI);
  console.log("Connected to MongoDB");

  try {
    const result = await syncCjProductStock();
    console.log(`Found ${result.total} CJ products`);
    console.log(`Updated: ${result.updated}, Failed: ${result.failed}`);
    if (result.outOfStock.length > 0) {
      console.log(`Out of stock: ${result.outOfStock.join(", ")}`);
    }
  } catch (err: any) {
    console.error(err?.message || err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
  process.exit(0);
}

main();
