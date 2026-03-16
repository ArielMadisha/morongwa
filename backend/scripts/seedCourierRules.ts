/**
 * Seed courier rules for Southern Africa + EU
 * Run: npx ts-node scripts/seedCourierRules.ts
 */

import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import mongoose from "mongoose";
import { seedCourierRules } from "../src/data/seeds/courierRules";

async function run() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error("❌ MONGO_URI not set");
    process.exit(1);
  }
  await mongoose.connect(mongoUri);
  console.log("✅ Connected to MongoDB");

  const count = await seedCourierRules();
  console.log(`✅ Seeded ${count} courier rules`);

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
