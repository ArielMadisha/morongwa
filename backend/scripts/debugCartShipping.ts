import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";
import Product from "../src/data/models/Product";
import {
  buildInternalShippingStoreGroups,
  computeInternalCourierShipping,
} from "../src/services/checkoutShipping";
import { buildAggregatedCheckoutCourierOptions } from "../src/services/courierServiceCatalog";
import { ensureCourierCatalogSeed } from "../src/services/courierSeed";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function main() {
  const titleRe = process.argv[2] ? new RegExp(process.argv[2], "i") : /vest jacket/i;
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error("MONGODB_URI not set");
  await mongoose.connect(uri);
  await ensureCourierCatalogSeed();
  const products = await Product.find({ title: titleRe, active: true }).limit(5).lean();
  console.log("matches:", products.length);
  for (const p of products) {
    console.log("\n---", p.title);
    console.log("id", p._id, "source", p.supplierSource, "supplierId", p.supplierId);
    const productMap = new Map([[String(p._id), p as Record<string, unknown>]]);
    const cartItems = [{ productId: p._id, qty: 1 }];
    const groups = await buildInternalShippingStoreGroups(cartItems, productMap);
    console.log("storeGroups", groups);
    const opts = await buildAggregatedCheckoutCourierOptions("ZA", groups, cartItems, productMap);
    console.log("courierOptions", opts.length);
    const q = await computeInternalCourierShipping("ZA", groups, undefined, undefined, cartItems, productMap);
    console.log("quote", {
      internalShippingZar: q.internalShippingZar,
      requiresCourierSelection: q.requiresCourierSelection,
      availableOptions: q.availableOptions.length,
      courierUsed: q.courierUsed,
    });
  }
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
