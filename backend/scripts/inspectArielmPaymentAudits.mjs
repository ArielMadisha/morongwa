#!/usr/bin/env node
import "dotenv/config";
import mongoose from "mongoose";

const refs = [
  "ORDER-6a62b7f6fa002e570555ff02",
  "ORDER-6a62b700fa002e570555f63d",
  "ORDER-6a62b6ecfa002e570555f5cc",
  "ORDER-6a62b2d6fa002e570555dc0c",
  "ORDER-6a62b3eefa002e570555e117",
];

await mongoose.connect(process.env.MONGO_URI);
const db = mongoose.connection.db;

const audits = await db
  .collection("auditlogs")
  .find({
    $or: [
      { "meta.reference": { $in: refs } },
      { action: { $in: ["PAYMENT_WEBHOOK_RECEIVED", "PAYMENT_INITIATED", "CHECKOUT_PAY"] } },
    ],
    createdAt: {
      $gte: new Date("2026-07-23T22:00:00.000Z"),
      $lte: new Date("2026-07-24T04:00:00.000Z"),
    },
  })
  .sort({ createdAt: -1 })
  .limit(100)
  .toArray();

console.log("AUDITS", audits.length);
for (const a of audits) {
  if (
    refs.includes(String(a.meta?.reference || "")) ||
    String(a.user) === "69d4c475574fc61dbbeee390" ||
    String(a.meta?.buyerId || "") === "69d4c475574fc61dbbeee390"
  ) {
    console.log(
      JSON.stringify(
        {
          action: a.action,
          user: a.user ? String(a.user) : null,
          meta: a.meta,
          createdAt: a.createdAt,
        },
        null,
        2
      )
    );
  }
}

// product titles
const productIds = [
  new mongoose.Types.ObjectId("6a619a39e0c809664cea2f3c"),
  new mongoose.Types.ObjectId("6a626cdd4ba453dade7b78c6"),
  new mongoose.Types.ObjectId("6a626cdd4ba453dade7b78c4"),
];
const products = await db
  .collection("products")
  .find({ _id: { $in: productIds } })
  .project({ title: 1, price: 1, categories: 1, tags: 1 })
  .toArray();
console.log("PRODUCTS");
for (const p of products) {
  console.log(JSON.stringify({ id: String(p._id), title: p.title, price: p.price, categories: p.categories, tags: p.tags }));
}

await mongoose.disconnect();
