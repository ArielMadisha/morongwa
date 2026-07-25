#!/usr/bin/env node
/**
 * Convert QwertyHub Test Shop → Order Food/Restaurant (4 bunny chow / kota items under R30).
 *   node scripts/convertTestShopToFood.mjs --apply
 */
import "dotenv/config";
import mongoose from "mongoose";

const apply = process.argv.includes("--apply");
const SUPPLIER_ID = "6a6264d138377d1da374bcac";
const STORE_ID = "6a6264d138377d1da374bcab";
const STORE_NAME = "QwertyHub Test Shop";
const FOOD_CATEGORY = "Food & Restaurant";

const MENU = [
  {
    n: 1,
    title: "Bunny Chow — Beans",
    price: 24,
    image: "/uploads/food/calibas-kota-1.png",
  },
  {
    n: 2,
    title: "Bunny Chow — Chicken",
    price: 28,
    image: "/uploads/food/calibas-kota-2.png",
  },
  {
    n: 3,
    title: "Kota — Chips & Atchaar",
    price: 22,
    image: "/uploads/food/calibas-kota-3.png",
  },
  {
    n: 4,
    title: "Bunny Chow — Veg Curry",
    price: 26,
    image: "/uploads/food/mmoja-lerato-kota.png",
  },
];

function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

await mongoose.connect(process.env.MONGO_URI);
const db = mongoose.connection.db;
const products = db.collection("products");
const stores = db.collection("stores");
const suppliers = db.collection("suppliers");
const supplierId = new mongoose.Types.ObjectId(SUPPLIER_ID);
const storeId = new mongoose.Types.ObjectId(STORE_ID);
const now = new Date();

const supplier = await suppliers.findOne({ _id: supplierId });
const store = await stores.findOne({ _id: storeId });
if (!supplier || !store) {
  console.error("Store/supplier missing");
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      dryRun: !apply,
      store: store.name,
      supplierId: String(supplierId),
      menu: MENU.map((m) => ({ title: m.title, price: m.price })),
    },
    null,
    2
  )
);

if (!apply) {
  console.log("Re-run with --apply");
  await mongoose.disconnect();
  process.exit(0);
}

await stores.updateOne(
  { _id: storeId },
  {
    $set: {
      name: STORE_NAME,
      address: "Customer collection — Order Food/Restaurant test shop",
      updatedAt: now,
    },
  }
);
await suppliers.updateOne(
  { _id: supplierId },
  { $set: { storeName: STORE_NAME, status: "approved", updatedAt: now } }
);

// Deactivate all previous products for this supplier
await products.updateMany(
  { supplierId },
  { $set: { active: false, updatedAt: now } }
);

const created = [];
for (const item of MENU) {
  const slug = `qh-food-test-${item.n}-${slugify(item.title)}-${Date.now().toString(36)}`;
  const doc = {
    supplierId,
    supplierSource: "internal",
    title: `#${item.n} ${item.title}`,
    slug,
    description: `${item.title} — kota / bunny chow from ${STORE_NAME}. Customer collects. Test listing for Order Food/Restaurant.`,
    images: [item.image],
    price: item.price,
    currency: "ZAR",
    stock: 9999,
    outOfStock: false,
    allowResell: false,
    categories: [FOOD_CATEGORY, "Kota / Bunny Chow"],
    tags: ["food-menu", "food-pickup", "kota", "bunny-chow", "qwertyhub-test-shop"],
    availableCountries: ["South Africa"],
    colors: [{ name: "Standard", hex: "#f59e0b", imageIndex: 0 }],
    colorsManual: true,
    active: true,
    sku: `QH-FOOD-TEST-${item.n}`,
    createdAt: now,
    updatedAt: now,
  };
  const ins = await products.insertOne(doc);
  created.push({ id: String(ins.insertedId), title: doc.title, price: doc.price, image: item.image });
}

console.log(JSON.stringify({ productsCreated: created }, null, 2));
await mongoose.disconnect();
console.log("Done.");
