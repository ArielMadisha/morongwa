#!/usr/bin/env node
/**
 * Create Caliba's Township Burger food store + menu (items 1–21 + extras).
 *
 *   node scripts/setupCalibasTownshipBurger.mjs --apply --push-remote
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { mergeDeployConfig, sshConnect, execSsh } from "./lib/deploySsh.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dirname, "..");
const repoRoot = path.join(backendRoot, "..");

const apply = process.argv.includes("--apply");
const pushRemote = process.argv.includes("--push-remote");

const PHONE = "27765340451";
const USERNAME = "calibastownshipburger";
const STORE_NAME = "Caliba's Township Burger";
const PASSWORD = "11111111";
const FOOD_CATEGORY = "Food & Restaurant";
const FOOD_KOTA_IMAGE = "/uploads/food/kota-icon.svg";
const FOOD_KOTA_PHOTOS = [
  "/uploads/food/calibas-kota-1.png",
  "/uploads/food/calibas-kota-2.png",
  "/uploads/food/calibas-kota-3.png",
  "/uploads/food/calibas-kota-4.png",
];
const MAPS_URL = "https://maps.app.goo.gl/NtygfjwHBQCRHDhB9";
const STORE_LAT = -(25 + 22 / 60 + 33.6 / 3600);
const STORE_LNG = 28 + 15 / 60 + 40.9 / 3600;
/** Reverse-geocoded from pin 25°22'33.6"S 28°15'40.9"E (Photon / OSM). */
const STORE_ADDRESS = "Mosimegi Street, Temba, Pretoria, Gauteng, 0407";

function pickFoodPhoto(seed) {
  const s = String(seed || "");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return FOOD_KOTA_PHOTOS[h % FOOD_KOTA_PHOTOS.length] || FOOD_KOTA_IMAGE;
}

const MENU = [
  { n: 1, title: "Atchaar, Chips, French", price: 24 },
  { n: 2, title: "Atchaar, Chips, Vienna", price: 26 },
  { n: 3, title: "Atchaar, Chips, Cheese", price: 26 },
  { n: 4, title: "Atchaar, Chips, Egg", price: 26 },
  { n: 5, title: "Atchaar, Chips, French, Vienna", price: 28 },
  { n: 6, title: "Atchaar, Chips, French, Cheese", price: 28 },
  { n: 7, title: "Atchaar, Chips, French, Egg", price: 28 },
  { n: 8, title: "Atchaar, Chips, French, Vienna, Cheese", price: 32 },
  { n: 9, title: "Atchaar, Chips, French, Cheese, Egg", price: 32 },
  { n: 10, title: "Atchaar, Chips, French, Vienna, Cheese, Egg", price: 36 },
  { n: 11, title: "Atchaar, Chips, Russian", price: 34 },
  { n: 12, title: "Atchaar, Chips, Polony, Russian", price: 37 },
  { n: 13, title: "Atchaar, Chips, Cheese, Russian", price: 38 },
  { n: 14, title: "Atchaar, Chips, Polony, Cheese, Russian", price: 41 },
  { n: 15, title: "Atchaar, Chips, Egg, Cheese, Russian", price: 42 },
  { n: 16, title: "Atchaar, Chips, Polony, Cheese, Egg, Russian", price: 46 },
  { n: 17, title: "Atchaar, Chips, Polony, Cheese, Vienna, Russian", price: 46 },
  { n: 18, title: "Atchaar, Chips, Polony, Cheese, Egg, Vienna, Russian", price: 50 },
  { n: 19, title: "Atchaar, Chips, Polony, Cheese, Egg, Burger", price: 40 },
  { n: 20, title: "Atchaar, Chips, Polony, Cheese, Egg, Vienna, Burger", price: 44 },
  { n: 21, title: "Atchaar, Chips, Polony, Cheese, Egg, Burger, Vienna, Russian", price: 57 },
];

const EXTRAS = [
  { title: "Small Chips", price: 30 },
  { title: "Medium Chips", price: 40 },
  { title: "Large Chips", price: 45 },
  { title: "Russian", price: 15 },
  { title: "Burger", price: 7 },
  { title: "French", price: 3 },
  { title: "Atchaar", price: 5 },
  { title: "Fried Eggs", price: 4 },
  { title: "Cheese", price: 4 },
  { title: "Vienna", price: 5 },
];

function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function sftpPut(conn, localPath, remotePath) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err);
      sftp.fastPut(localPath, remotePath, (e) => (e ? reject(e) : resolve()));
    });
  });
}

function resolveRemoteBackendRoot(cfg) {
  const explicit = (cfg.MORONGWA_BACKEND_HOST_PATH || "").trim().replace(/\/$/, "");
  if (explicit) return explicit;
  const live = (cfg.MORONGWA_LIVE_DIR || "").trim().replace(/\/$/, "");
  if (live) return `${live}/backend`;
  const deployPath = (cfg.DEPLOY_REMOTE_PATH || "").trim().replace(/\/$/, "");
  if (deployPath) return `${deployPath}/backend`;
  return "/home/zweppe/morongwa-live/backend";
}

async function main() {
  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI not set");
    process.exit(1);
  }

  const localIcon = path.join(backendRoot, "uploads", "food", "kota-icon.svg");
  if (!fs.existsSync(localIcon)) {
    console.error("Missing kota icon:", localIcon);
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

  console.log(
    JSON.stringify(
      {
        dryRun: !apply,
        existingUser: user
          ? { id: String(user._id), name: user.name, username: user.username, phone: user.phone }
          : null,
        menuCount: MENU.length,
        extrasCount: EXTRAS.length,
      },
      null,
      2
    )
  );

  if (!apply) {
    console.log("Re-run with --apply --push-remote");
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

  let store = await stores.findOne({ userId: user._id, type: "supplier", name: STORE_NAME });
  if (!store) {
    const ins = await stores.insertOne({
      userId: user._id,
      name: STORE_NAME,
      type: "supplier",
      country: "South Africa",
      countryCode: "ZA",
      cellphone: PHONE,
      whatsapp: `+${PHONE}`,
      email: "",
      address: STORE_ADDRESS,
      mapsUrl: MAPS_URL,
      latitude: STORE_LAT,
      longitude: STORE_LNG,
      slug: slugify(STORE_NAME),
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
          cellphone: PHONE,
          whatsapp: `+${PHONE}`,
          country: "South Africa",
          countryCode: "ZA",
          address: STORE_ADDRESS,
          mapsUrl: MAPS_URL,
          latitude: STORE_LAT,
          longitude: STORE_LNG,
          updatedAt: now,
        },
      }
    );
    store = await stores.findOne({ _id: store._id });
    console.log("Updated store", String(store._id));
  }

  await stores.updateOne(
    { _id: store._id },
    {
      $set: {
        address: STORE_ADDRESS,
        mapsUrl: MAPS_URL,
        latitude: STORE_LAT,
        longitude: STORE_LNG,
        updatedAt: now,
      },
    }
  );

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

  // Soft-deactivate old Caliba food products then recreate
  await products.updateMany(
    { supplierId: supplier._id, categories: FOOD_CATEGORY },
    { $set: { active: false, updatedAt: now } }
  );

  const created = [];
  for (const item of MENU) {
    const slug = `calibas-${item.n}-${slugify(item.title)}-${Date.now().toString(36)}`;
    const doc = {
      supplierId: supplier._id,
      supplierSource: "internal",
      title: `#${item.n} ${item.title}`,
      slug,
      description: `${item.title} — kota / bunny chow from ${STORE_NAME}. Customer collects.`,
      images: [pickFoodPhoto(`menu-${item.n}`)],
      price: item.price,
      currency: "ZAR",
      stock: 9999,
      outOfStock: false,
      allowResell: false,
      categories: [FOOD_CATEGORY, "Kota / Bunny Chow"],
      tags: ["food-menu", "food-pickup", "kota", "calibas"],
      availableCountries: ["South Africa"],
      colors: [{ name: "Standard", hex: "#f59e0b", imageIndex: 0 }],
      colorsManual: true,
      active: true,
      sku: `CALIBA-MENU-${item.n}`,
      createdAt: now,
      updatedAt: now,
    };
    const ins = await products.insertOne(doc);
    created.push({ id: String(ins.insertedId), title: doc.title, price: doc.price, kind: "menu" });
  }

  for (const [i, item] of EXTRAS.entries()) {
    const slug = `calibas-extra-${slugify(item.title)}-${Date.now().toString(36)}`;
    const doc = {
      supplierId: supplier._id,
      supplierSource: "internal",
      title: `Extra: ${item.title}`,
      slug,
      description: `Add-on: ${item.title} — recommended with your kota from ${STORE_NAME}.`,
      images: [pickFoodPhoto(`extra-${item.title}`)],
      price: item.price,
      currency: "ZAR",
      stock: 9999,
      outOfStock: false,
      allowResell: false,
      categories: [FOOD_CATEGORY, "Extras"],
      tags: ["food-extra", "food-pickup", "kota", "calibas"],
      availableCountries: ["South Africa"],
      colors: [{ name: "Standard", hex: "#f59e0b", imageIndex: 0 }],
      colorsManual: true,
      active: true,
      sku: `CALIBA-EXTRA-${i + 1}`,
      createdAt: now,
      updatedAt: now,
    };
    const ins = await products.insertOne(doc);
    created.push({ id: String(ins.insertedId), title: doc.title, price: doc.price, kind: "extra" });
  }

  console.log(
    JSON.stringify(
      {
        userId: String(user._id),
        username: USERNAME,
        phone: PHONE,
        storeId: String(store._id),
        supplierId: String(supplier._id),
        productsCreated: created.length,
        password: PASSWORD,
      },
      null,
      2
    )
  );

  if (pushRemote) {
    const cfg = mergeDeployConfig(repoRoot);
    const remoteRoot = resolveRemoteBackendRoot(cfg);
    const conn = await sshConnect(cfg, repoRoot);
    try {
      await execSsh(conn, `mkdir -p "${remoteRoot}/uploads/food"`);
      await sftpPut(conn, localIcon, `${remoteRoot}/uploads/food/kota-icon.svg`);
      for (const rel of FOOD_KOTA_PHOTOS) {
        const name = path.basename(rel);
        const local = path.join(backendRoot, "uploads", "food", name);
        if (fs.existsSync(local)) {
          await sftpPut(conn, local, `${remoteRoot}/uploads/food/${name}`);
          console.log("Pushed", name);
        }
      }
      console.log("Pushed kota assets to production uploads/food/");
    } finally {
      conn.end();
    }
  }

  await mongoose.disconnect();
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
