/**
 * Smoke: product free-shipping area match for a town name.
 * Usage: node scripts/smokeProductFreeShippingMatch.mjs --title=duvet --city=Hammanskraal
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const titleArg = process.argv.find((a) => a.startsWith("--title="))?.split("=")[1] || "duvet";
const cityArg = process.argv.find((a) => a.startsWith("--city="))?.split("=")[1] || "Hammanskraal";

await mongoose.connect(process.env.MONGO_URI);
const { default: Product } = await import("../dist/src/data/models/Product.js");
const { deliveryMatchesProductFreeShipping } = await import(
  "../dist/src/services/productFreeShipping.js"
);
const { storeGroupQualifiesForWarehouseFreeLocal } = await import(
  "../dist/src/services/warehouseLocalDelivery.js"
);

const products = await Product.find({ title: new RegExp(titleArg, "i") })
  .populate("supplierId", "storeName")
  .lean();

console.log(`Found ${products.length} product(s) matching title "${titleArg}"`);
for (const p of products) {
  console.log("\n---", p.title, p._id);
  console.log({
    freeShippingEnabled: p.freeShippingEnabled,
    freeShippingAreas: p.freeShippingAreas,
    warehouseFreeLocalCity: p.warehouseFreeLocalCity,
    warehouseFreeLocalCountry: p.warehouseFreeLocalCountry,
    supplier: p.supplierId?.storeName,
  });
  const delivery = { deliveryCountry: "ZA", deliveryCity: cityArg, deliveryAddress: cityArg };
  const match = deliveryMatchesProductFreeShipping(p, delivery);
  console.log("deliveryMatchesProductFreeShipping:", match);
}

if (products[0]) {
  const productMap = new Map([[String(products[0]._id), products[0]]]);
  const group = {
    groupKey: "store:test",
    storeName: "Test",
    supplierIds: [String(products[0].supplierId?._id || products[0].supplierId)],
    originCountryCode: "ZA",
  };
  const qual = storeGroupQualifiesForWarehouseFreeLocal({
    group,
    cartItems: [{ productId: products[0]._id, qty: 1 }],
    productMap,
    storeBySupplier: new Map(),
    delivery: { deliveryCountry: "ZA", deliveryCity: cityArg, deliveryAddress: cityArg },
  });
  console.log("\nstoreGroupQualifiesForWarehouseFreeLocal:", qual);
}

await mongoose.disconnect();
