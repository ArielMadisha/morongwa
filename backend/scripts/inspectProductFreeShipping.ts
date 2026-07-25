import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";
import Product from "../src/data/models/Product";
import {
  buildInternalShippingStoreGroups,
  computeInternalCourierShipping,
} from "../src/services/checkoutShipping";
import { deliveryMatchesProductFreeShipping } from "../src/services/productFreeShipping";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function main() {
  const titleRe = new RegExp(process.argv[2] || "duvet", "i");
  const city = process.argv[3] || "Hammanskraal";
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error("MONGODB_URI not set");
  await mongoose.connect(uri);

  const products = await Product.find({ title: titleRe, active: true })
    .populate("supplierId", "storeName")
    .limit(10)
    .lean();

  console.log("matches:", products.length, "city:", city);
  for (const p of products) {
    console.log("\n---", p.title, p._id);
    console.log({
      price: p.price,
      freeShippingEnabled: p.freeShippingEnabled,
      freeShippingAreas: p.freeShippingAreas,
      warehouseFreeLocalCity: p.warehouseFreeLocalCity,
      warehouseFreeLocalCountry: p.warehouseFreeLocalCountry,
      supplier: (p.supplierId as { storeName?: string })?.storeName,
    });
    const delivery = { deliveryCountry: "ZA", deliveryCity: city, deliveryAddress: city };
    console.log("match:", deliveryMatchesProductFreeShipping(p as Record<string, unknown>, delivery));

    const productMap = new Map([[String(p._id), p as Record<string, unknown>]]);
    const cartItems = [{ productId: p._id, qty: 1 }];
    const groups = await buildInternalShippingStoreGroups(cartItems, productMap);
    const q = await computeInternalCourierShipping(
      "ZA",
      groups,
      undefined,
      undefined,
      cartItems,
      productMap,
      { deliveryCity: city, deliveryAddress: city }
    );
    console.log("quote:", {
      internalShippingZar: q.internalShippingZar,
      requiresCourierSelection: q.requiresCourierSelection,
      warehouseFreeLocalApplied: q.warehouseFreeLocalApplied,
      breakdown: q.storeGroupBreakdown,
    });
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
