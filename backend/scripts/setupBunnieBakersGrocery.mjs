#!/usr/bin/env node
/**
 * Create Bunnie Bakers as a Groceries (pickup) store + owner account.
 *
 *   node scripts/setupBunnieBakersGrocery.mjs --apply
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";

const apply = process.argv.includes("--apply");

const PHONE = "27677957679";
const USERNAME = "bunniebakers";
const STORE_NAME = "Bunnie Bakers";
const PASSWORD = "11111111";
const STORE_ADDRESS = "26402 Tilo Street Extension 6";
const STORE_AREA = "Soshanguve";
const GROCERY_CATEGORY = "Groceries";
const MAPS_QUERY = encodeURIComponent(`${STORE_ADDRESS}, ${STORE_AREA}, 0164`);
const MAPS_URL = `https://www.google.com/maps/search/?api=1&query=${MAPS_QUERY}`;

/** Starter bakery / grocery lines so WA Order Groceries is not empty. */
const MENU = [
  { n: 1, title: "Fresh White Bread Loaf", price: 18 },
  { n: 2, title: "Brown Bread Loaf", price: 20 },
  { n: 3, title: "Assorted Buns (6 pack)", price: 25 },
  { n: 4, title: "Vetkoek (each)", price: 8 },
  { n: 5, title: "Scones (4 pack)", price: 30 },
];

function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

async function geocodeSoshanguve() {
  // Approximate pin for Ext 6 Soshanguve (Photon). Fail soft → address text still used.
  try {
    const q = encodeURIComponent("Tilo Street, Soshanguve, Pretoria, South Africa");
    const res = await fetch(`https://photon.komoot.io/api/?q=${q}&limit=1`);
    if (!res.ok) return null;
    const data = await res.json();
    const f = data?.features?.[0];
    const coords = f?.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) return null;
    return { lng: Number(coords[0]), lat: Number(coords[1]) };
  } catch {
    return null;
  }
}

async function main() {
  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI not set");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  const users = db.collection("users");
  const stores = db.collection("stores");
  const suppliers = db.collection("suppliers");
  const products = db.collection("products");

  let user = await users.findOne({
    $or: [{ phone: PHONE }, { phone: `+${PHONE}` }, { username: USERNAME }],
  });

  const geo = await geocodeSoshanguve();

  console.log(
    JSON.stringify(
      {
        dryRun: !apply,
        existingUser: user
          ? { id: String(user._id), name: user.name, username: user.username, phone: user.phone }
          : null,
        storeName: STORE_NAME,
        address: STORE_ADDRESS,
        phone: PHONE,
        vertical: "grocery",
        starterProducts: MENU.length,
        geo,
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

  const now = new Date();
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  if (!user) {
    const ins = await users.insertOne({
      name: STORE_NAME,
      username: USERNAME,
      phone: PHONE,
      email: `wa_${PHONE}@morongwa.local`,
      passwordHash,
      role: "user",
      isVerified: true,
      notificationPreferences: {
        orderMessenger: true,
        orderEmail: true,
        orderSms: false,
        orderWhatsapp: true,
      },
      createdAt: now,
      updatedAt: now,
    });
    user = await users.findOne({ _id: ins.insertedId });
    console.log("Created user", String(user._id));
  } else {
    await users.updateOne(
      { _id: user._id },
      {
        $set: {
          name: STORE_NAME,
          username: USERNAME,
          phone: PHONE,
          email: `wa_${PHONE}@morongwa.local`,
          passwordHash,
          "notificationPreferences.orderWhatsapp": true,
          "notificationPreferences.orderMessenger": true,
          updatedAt: now,
        },
      }
    );
    user = await users.findOne({ _id: user._id });
    console.log("Updated user", String(user._id));
  }

  let store = await stores.findOne({
    userId: user._id,
    type: "supplier",
    $or: [{ name: STORE_NAME }, { slug: slugify(STORE_NAME) }],
  });

  const storeFields = {
    name: STORE_NAME,
    type: "supplier",
    vertical: "grocery",
    country: "South Africa",
    countryCode: "ZA",
    cellphone: PHONE,
    whatsapp: `+${PHONE}`,
    email: "",
    address: STORE_ADDRESS,
    area: STORE_AREA,
    mapsUrl: MAPS_URL,
    ...(geo ? { latitude: geo.lat, longitude: geo.lng } : {}),
    slug: slugify(STORE_NAME),
    updatedAt: now,
  };

  if (!store) {
    const ins = await stores.insertOne({
      userId: user._id,
      ...storeFields,
      createdAt: now,
    });
    store = await stores.findOne({ _id: ins.insertedId });
    console.log("Created store", String(store._id));
  } else {
    await stores.updateOne({ _id: store._id }, { $set: storeFields });
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
      contactPhone: PHONE,
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
          contactPhone: PHONE,
          reviewedAt: now,
          updatedAt: now,
        },
      }
    );
    supplier = await suppliers.findOne({ _id: supplier._id });
    console.log("Updated supplier", String(supplier._id));
  }

  await stores.updateOne({ _id: store._id }, { $set: { supplierId: supplier._id, updatedAt: now } });

  // Replace prior Bunnie grocery products if re-run
  await products.updateMany(
    { supplierId: supplier._id, categories: GROCERY_CATEGORY },
    { $set: { active: false, updatedAt: now } }
  );

  const created = [];
  for (const item of MENU) {
    const slug = `bunnie-bakers-${item.n}-${slugify(item.title)}-${Date.now().toString(36)}`;
    const doc = {
      supplierId: supplier._id,
      supplierSource: "internal",
      title: `#${item.n} ${item.title}`,
      slug,
      description: `${item.title} — bakery / grocery from ${STORE_NAME}. Customer collects at ${STORE_ADDRESS}.`,
      images: ["/qwertymates-q-mark-official.png"],
      price: item.price,
      currency: "ZAR",
      stock: 9999,
      outOfStock: false,
      allowResell: false,
      categories: [GROCERY_CATEGORY],
      tags: ["grocery-pickup", "grocery", "bakery", "bunnie-bakers"],
      availableCountries: ["South Africa"],
      colors: [{ name: "Standard", hex: "#f59e0b", imageIndex: 0 }],
      colorsManual: true,
      active: true,
      sku: `BUNNIE-G-${item.n}`,
      createdAt: now,
      updatedAt: now,
    };
    const ins = await products.insertOne(doc);
    created.push({ id: String(ins.insertedId), title: doc.title, price: doc.price });
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        userId: String(user._id),
        username: USERNAME,
        phone: `+${PHONE}`,
        password: PASSWORD,
        storeId: String(store._id),
        supplierId: String(supplier._id),
        vertical: "grocery",
        address: STORE_ADDRESS,
        productsCreated: created.length,
        products: created,
        waPath: "WhatsApp menu 8 → 2 Order Groceries → Bunnie Bakers",
      },
      null,
      2
    )
  );

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
