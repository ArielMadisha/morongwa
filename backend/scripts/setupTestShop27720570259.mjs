#!/usr/bin/env node
/**
 * Create / refresh QwertyHub Test Shop as Order Food/Restaurant for +27720570259 (Ariel Madisha).
 * 4 bunny chow / kota items under R30 with food images.
 *
 *   node scripts/setupTestShop27720570259.mjs --apply
 */
import "dotenv/config";
import mongoose from "mongoose";

const apply = process.argv.includes("--apply");

const PHONE = "27720570259";
const USER_ID = "69d4bd1642ec816dcc09e708"; // Ariel Madisha
const STORE_NAME = "QwertyHub Test Shop";
const FOOD_CATEGORY = "Food & Restaurant";

const MENU = [
  { n: 1, title: "Bunny Chow — Beans", price: 24, image: "/uploads/food/calibas-kota-1.png" },
  { n: 2, title: "Bunny Chow — Chicken", price: 28, image: "/uploads/food/calibas-kota-2.png" },
  { n: 3, title: "Kota — Chips & Atchaar", price: 22, image: "/uploads/food/calibas-kota-3.png" },
  { n: 4, title: "Bunny Chow — Veg Curry", price: 26, image: "/uploads/food/mmoja-lerato-kota.png" },
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
const users = db.collection("users");
const stores = db.collection("stores");
const suppliers = db.collection("suppliers");
const products = db.collection("products");

const user = await users.findOne({ _id: new mongoose.Types.ObjectId(USER_ID) });
if (!user) {
  console.error("User not found:", USER_ID);
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      dryRun: !apply,
      userId: String(user._id),
      name: user.name,
      username: user.username,
      phone: user.phone,
      storeName: STORE_NAME,
      products: MENU.length,
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

const now = new Date();
const phone = String(user.phone || PHONE).replace(/\D/g, "") || PHONE;

await users.updateOne(
  { _id: user._id },
  {
    $set: {
      phone,
      "notificationPreferences.orderMessenger": true,
      "notificationPreferences.orderEmail": true,
      "notificationPreferences.orderSms": true,
      "notificationPreferences.orderWhatsapp": true,
      updatedAt: now,
    },
  }
);

let store = await stores.findOne({ userId: user._id, type: "supplier", name: STORE_NAME });
if (!store) {
  let slug = slugify(STORE_NAME);
  if (await stores.findOne({ slug })) slug = `${slug}-${String(user._id).slice(-6)}`;
  const ins = await stores.insertOne({
    userId: user._id,
    name: STORE_NAME,
    type: "supplier",
    country: "South Africa",
    countryCode: "ZA",
    cellphone: phone,
    whatsapp: `+${phone}`,
    email: user.email || "",
    address: "Customer collection — Order Food/Restaurant",
    slug,
    createdAt: now,
    updatedAt: now,
  });
  store = await stores.findOne({ _id: ins.insertedId });
  console.log("Created store", String(store._id));
} else {
  await stores.updateOne(
    { _id: store._id },
    {
      $set: {
        cellphone: phone,
        whatsapp: `+${phone}`,
        address: "Customer collection — Order Food/Restaurant",
        updatedAt: now,
      },
    }
  );
  store = await stores.findOne({ _id: store._id });
  console.log("Updated store", String(store._id));
}

let supplier = await suppliers.findOne({
  $or: [{ linkedStoreId: store._id }, { userId: user._id, storeName: STORE_NAME }],
});
if (!supplier) {
  const ins = await suppliers.insertOne({
    userId: user._id,
    linkedStoreId: store._id,
    status: "approved",
    type: "individual",
    storeName: STORE_NAME,
    contactPhone: phone,
    reviewedAt: now,
    createdAt: now,
    updatedAt: now,
  });
  supplier = await suppliers.findOne({ _id: ins.insertedId });
  console.log("Created supplier", String(supplier._id));
} else {
  await suppliers.updateOne(
    { _id: supplier._id },
    {
      $set: {
        status: "approved",
        linkedStoreId: store._id,
        storeName: STORE_NAME,
        contactPhone: phone,
        reviewedAt: now,
        updatedAt: now,
      },
    }
  );
  supplier = await suppliers.findOne({ _id: supplier._id });
  console.log("Updated supplier", String(supplier._id));
}

await stores.updateOne({ _id: store._id }, { $set: { supplierId: supplier._id, updatedAt: now } });

await products.updateMany(
  { supplierId: supplier._id },
  { $set: { active: false, updatedAt: now } }
);

const created = [];
for (const item of MENU) {
  const slug = `qh-food-test-${item.n}-${slugify(item.title)}-${Date.now().toString(36)}`;
  const doc = {
    supplierId: supplier._id,
    supplierSource: "internal",
    title: `#${item.n} ${item.title}`,
    slug,
    description: `${item.title} — kota / bunny chow from ${STORE_NAME}. Customer collects.`,
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
  created.push({ id: String(ins.insertedId), title: doc.title, price: doc.price });
}

console.log(
  JSON.stringify(
    {
      userId: String(user._id),
      username: user.username,
      phone,
      storeId: String(store._id),
      storeName: STORE_NAME,
      supplierId: String(supplier._id),
      products: created,
      section: "Order Food/Restaurant",
    },
    null,
    2
  )
);

await mongoose.disconnect();
console.log("Done.");
