#!/usr/bin/env node
/**
 * Remove bulk tiers that are not discounts (tier.price >= effective catalog price).
 *   node scripts/fixInvalidBulkTiers.mjs --dry-run
 *   node scripts/fixInvalidBulkTiers.mjs --apply
 */
import "dotenv/config";
import mongoose from "mongoose";

const apply = process.argv.includes("--apply");

function effectivePrice(p) {
  const price = Number(p.price) || 0;
  const d = Number(p.discountPrice);
  if (Number.isFinite(d) && d > 0 && d < price) return d;
  return price;
}

async function main() {
  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI not set");
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI);
  const products = mongoose.connection.db.collection("products");
  const cursor = products.find(
    { "bulkTiers.0": { $exists: true } },
    { projection: { title: 1, price: 1, discountPrice: 1, bulkTiers: 1 } }
  );

  let scanned = 0;
  let touched = 0;
  const samples = [];

  for await (const p of cursor) {
    scanned += 1;
    const base = effectivePrice(p);
    const tiers = Array.isArray(p.bulkTiers) ? p.bulkTiers : [];
    const kept = tiers.filter((t) => {
      const tp = Number(t.price);
      return Number.isFinite(tp) && tp >= 0 && tp < base;
    });
    if (kept.length === tiers.length) continue;
    touched += 1;
    if (samples.length < 15) {
      samples.push({
        id: String(p._id),
        title: String(p.title || "").slice(0, 60),
        base,
        before: tiers.map((t) => ({ min: t.minQty, max: t.maxQty, price: t.price })),
        after: kept.map((t) => ({ min: t.minQty, max: t.maxQty, price: t.price })),
      });
    }
    if (apply) {
      if (kept.length === 0) {
        await products.updateOne({ _id: p._id }, { $unset: { bulkTiers: "" } });
      } else {
        await products.updateOne({ _id: p._id }, { $set: { bulkTiers: kept } });
      }
    }
  }

  console.log(JSON.stringify({ dryRun: !apply, scanned, touched, samples }, null, 2));
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
