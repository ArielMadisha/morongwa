#!/usr/bin/env node
/**
 * Permanently delete invented GRANLUX priced products (never invent prices again).
 * Keep wall photos as plain image posts with no product/price linkage.
 *
 *   node scripts/deleteGranluxInventedProducts.mjs --apply
 */
import "dotenv/config";
import mongoose from "mongoose";

const apply = process.argv.includes("--apply");

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  const user = await db.collection("users").findOne({ username: "lazwellest" });
  const supplier = await db.collection("suppliers").findOne({ storeName: /granlux/i });
  const products = await db
    .collection("products")
    .find({
      $or: [
        supplier ? { supplierId: supplier._id } : { _id: null },
        { sku: { $regex: /^GRANLUX-/i } },
      ],
    })
    .toArray();

  console.log(
    JSON.stringify(
      {
        dryRun: !apply,
        willDeleteProducts: products.map((p) => ({
          id: String(p._id),
          title: p.title,
          price: p.price,
          active: p.active,
        })),
        note: "Wall image posts stay; captions cleared so they are plain photo uploads only.",
      },
      null,
      2
    )
  );

  if (!apply) {
    console.log("Re-run with --apply");
    await mongoose.disconnect();
    return;
  }

  if (products.length) {
    const ids = products.map((p) => p._id);
    const r = await db.collection("products").deleteMany({ _id: { $in: ids } });
    console.log("deleted products", r.deletedCount);
  }

  if (user) {
    const cap = await db.collection("tvposts").updateMany(
      { creatorId: user._id, type: "image" },
      { $set: { caption: "", hashtags: [], updatedAt: new Date() }, $unset: { productId: "" } }
    );
    console.log("cleared wall captions", cap.modifiedCount);
  }

  const left = await db.collection("products").countDocuments({
    $or: [supplier ? { supplierId: supplier._id } : { _id: null }, { sku: { $regex: /^GRANLUX-/i } }],
  });
  console.log(JSON.stringify({ ok: true, remainingGranluxProducts: left }, null, 2));
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
