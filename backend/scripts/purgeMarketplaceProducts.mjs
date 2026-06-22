#!/usr/bin/env node
/**
 * Remove all marketplace products and related feed/cart/reseller references (fresh catalog).
 *
 * Dry-run (default):
 *   node scripts/purgeMarketplaceProducts.mjs
 *
 * Apply (destructive — requires explicit confirm env):
 *   CONFIRM_PURGE_ALL_PRODUCTS=yes node scripts/purgeMarketplaceProducts.mjs --apply
 *
 * Orders and payment history are NOT deleted.
 */
import "dotenv/config";
import mongoose from "mongoose";

async function main() {
  const apply = process.argv.includes("--apply");
  const mongo = process.env.MONGO_URI || "mongodb://localhost:27017/morongwa";
  await mongoose.connect(mongo);
  const db = mongoose.connection.db;

  const products = db.collection("products");
  const tvposts = db.collection("tvposts");
  const carts = db.collection("carts");
  const resellerWalls = db.collection("resellerwalls");
  const users = db.collection("users");

  const productCount = await products.countDocuments({});
  const tvProductPosts = await tvposts.countDocuments({
    $or: [{ type: "product" }, { productId: { $exists: true, $ne: null } }],
  });
  const cartsWithProducts = await carts.countDocuments({ "items.0": { $exists: true } });
  const wallsWithProducts = await resellerWalls.countDocuments({ "products.0": { $exists: true } });
  const usersWithExplore = await users.countDocuments({
    waExploreSeenProductIds: { $exists: true, $not: { $size: 0 } },
  });

  const summary = {
    mode: apply ? "apply" : "dry-run",
    products: productCount,
    tvProductPosts,
    cartsWithProductLines: cartsWithProducts,
    resellerWallsWithProducts: wallsWithProducts,
    usersWithWaExploreSeen: usersWithExplore,
    orders: "not modified (historical orders kept)",
  };
  console.log(JSON.stringify(summary, null, 2));

  if (!apply) {
    console.log("\nTo delete everything above, run:");
    console.log("  CONFIRM_PURGE_ALL_PRODUCTS=yes node scripts/purgeMarketplaceProducts.mjs --apply");
    await mongoose.disconnect();
    return;
  }

  if (String(process.env.CONFIRM_PURGE_ALL_PRODUCTS || "").trim().toLowerCase() !== "yes") {
    console.error("Set CONFIRM_PURGE_ALL_PRODUCTS=yes to run --apply");
    await mongoose.disconnect();
    process.exit(1);
  }

  const delProducts = await products.deleteMany({});
  const delTv = await tvposts.deleteMany({
    $or: [{ type: "product" }, { productId: { $exists: true, $ne: null } }],
  });
  const cartPull = await carts.updateMany({}, { $set: { items: [] } });
  const wallPull = await resellerWalls.updateMany({}, { $set: { products: [] } });
  const exploreClear = await users.updateMany(
    { waExploreSeenProductIds: { $exists: true } },
    { $set: { waExploreSeenProductIds: [] } }
  );

  console.log(
    JSON.stringify(
      {
        deletedProducts: delProducts.deletedCount,
        deletedTvProductPosts: delTv.deletedCount,
        cartsCleared: cartPull.modifiedCount,
        resellerWallsCleared: wallPull.modifiedCount,
        usersExploreCleared: exploreClear.modifiedCount,
      },
      null,
      2
    )
  );

  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error("ERR", e?.message || e);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
