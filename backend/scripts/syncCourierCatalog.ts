/**
 * Sync courier providers + tariffs from courierSeed.ts (updates ZA checkout options).
 * Run: npm run sync:courier-catalog
 */
import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";
import { ensureCourierCatalogSeed } from "../src/services/courierSeed";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error("MONGO_URI not set");
    process.exit(1);
  }
  await mongoose.connect(uri);
  await ensureCourierCatalogSeed();
  console.log("Courier catalog synced (ZA: PAXI, The Courier Guy, Pudo).");
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
