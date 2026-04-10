/**
 * Seed ExternalSupplier records from .env API keys
 * Run: npm run seed:external-suppliers
 *
 * Requires in .env:
 *   CJ_API_KEY, CJ_WEBHOOK_SECRET (optional)
 *   SPOCKET_API_KEY, SPOCKET_WEBHOOK_SECRET (optional)
 *   EPROLO_API_KEY, EPROLO_WEBHOOK_SECRET (optional)
 *
 * API keys are never logged.
 */

import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import mongoose from "mongoose";
import ExternalSupplier from "../src/data/models/ExternalSupplier";

const SUPPLIERS = [
  {
    source: "cj" as const,
    name: "CJ Dropshipping",
    apiKeyEnv: "CJ_API_KEY",
    webhookEnv: "CJ_WEBHOOK_SECRET",
    shippingEnv: "CJ_SHIPPING_COST",
    defaultShipping: 150,
  },
  {
    source: "spocket" as const,
    name: "Spocket",
    apiKeyEnv: "SPOCKET_API_KEY",
    webhookEnv: "SPOCKET_WEBHOOK_SECRET",
    shippingEnv: "SPOCKET_SHIPPING_COST",
    defaultShipping: 150,
  },
  {
    source: "eprolo" as const,
    name: "EPROLO",
    apiKeyEnv: "EPROLO_API_KEY",
    apiSecretEnv: "EPROLO_API_SECRET",
    webhookEnv: "EPROLO_WEBHOOK_SECRET",
    shippingEnv: "EPROLO_SHIPPING_COST",
    defaultShipping: 150,
  },
];

async function run() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error("❌ MONGO_URI not set");
    process.exit(1);
  }
  await mongoose.connect(mongoUri);
  console.log("✅ Connected to MongoDB");

  let count = 0;
  for (const s of SUPPLIERS) {
    const apiKey = process.env[s.apiKeyEnv];
    if (!apiKey || apiKey.trim() === "") {
      console.log(`⏭️  Skipping ${s.name} (${s.apiKeyEnv} not set)`);
      continue;
    }

    const apiSecret = (s as any).apiSecretEnv ? process.env[(s as any).apiSecretEnv]?.trim() : undefined;
    const webhookSecret = process.env[s.webhookEnv]?.trim() || undefined;
    const shippingCostRaw = (s as any).shippingEnv ? process.env[(s as any).shippingEnv] : undefined;
    const shippingCost = shippingCostRaw != null && shippingCostRaw !== "" ? parseInt(shippingCostRaw, 10) : (s as any).defaultShipping ?? 150;

    const update: Record<string, unknown> = {
      name: s.name,
      apiKey: apiKey.trim(),
      webhookSecret,
      status: "active",
      defaultMarkupPct: 25,
      shippingCost: Number.isNaN(shippingCost) ? 150 : shippingCost,
    };
    if (apiSecret) update.apiSecret = apiSecret;

    await ExternalSupplier.findOneAndUpdate(
      { source: s.source },
      { $set: update },
      { upsert: true, new: true }
    );
    console.log(`✅ ${s.name} (${s.source}) configured`);
    count++;
  }

  if (count === 0) {
    console.log("⚠️  No API keys found. Add CJ_API_KEY, EPROLO_API_KEY, or SPOCKET_API_KEY to .env");
  } else {
    console.log(`\n✅ Seeded ${count} external supplier(s)`);
  }

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
