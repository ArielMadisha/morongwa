#!/usr/bin/env node
/**
 * Open Mma Lerato Fast Food on QwertyHub for existing user Thabo Jerry Ngwenya.
 * Menu from printed Kota board (12 items + extras). Same kota photo on every item.
 * Order notifications → his WhatsApp/SMS on 27790389966.
 *
 *   node scripts/setupMmojaLeratoFastFood.mjs --apply --push-remote
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import { mergeDeployConfig, sshConnect, execSsh } from "./lib/deploySsh.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dirname, "..");
const repoRoot = path.join(backendRoot, "..");

const apply = process.argv.includes("--apply");
const pushRemote = process.argv.includes("--push-remote");

const USER_ID = "69e101f921557314ccd282e5";
const USERNAME = "thabojerryngwenya";
const OWNER_NAME = "Thabo Jerry Ngwenya";
const PHONE = "27790389966";
const STORE_NAME = "Mma Lerato Fast Food";
const FOOD_CATEGORY = "Food & Restaurant";
const FOOD_IMAGE = "/uploads/food/mmoja-lerato-kota.png";
const FOOD_IMAGE_FILE = "mmoja-lerato-kota.png";
const TAG_STORE = "mma-lerato";

/** Printed board — keep ingredient names as on the menu (incl. Atchar / Vianna). */
const MENU = [
  { n: 1, title: "Kota, Atchar, French Polony, Chips", price: 18 },
  { n: 2, title: "Kota, Atchar, Cheese, Chips", price: 21 },
  { n: 3, title: "Kota, Atchar, French Polony, Egg, Chips", price: 21 },
  { n: 4, title: "Kota, Atchar, French Polony, Vianna, Chips", price: 22 },
  { n: 5, title: "Kota, Atchar, French Polony, Cheese, Vianna, Chips", price: 26 },
  { n: 6, title: "Kota, Atchar, French Polony, Cheese, Egg, Chips", price: 25 },
  { n: 7, title: "Kota, Atchar, French Polony, Egg, Vianna, Chips", price: 26 },
  { n: 8, title: "Kota, Atchar, French Polony, Egg, Cheese, Vianna, Chips", price: 28 },
  { n: 9, title: "Kota, Atchar, French Polony, Egg, Cheese, Russian, Chips", price: 30 },
  { n: 10, title: "Kota, Atchar, French Polony, Vianna, Russian, Chips", price: 31 },
  { n: 11, title: "Kota, Atchar, Egg, Double Cheese, Chips", price: 29 },
  { n: 12, title: "Kota, Atchar, French Polony, Egg, Cheese, Vianna, Russian, Chips", price: 44 },
];

const EXTRAS = [
  { title: "Small Chips", price: 23 },
  { title: "Large Chips", price: 33 },
  { title: "Extra Large Chips", price: 53 },
  { title: "French Polony", price: 2.5 },
  { title: "Egg", price: 4 },
  { title: "Cheese", price: 4 },
  { title: "Vianna", price: 7 },
  { title: "Russian", price: 15 },
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

  const localFood = path.join(backendRoot, "uploads", "food", FOOD_IMAGE_FILE);
  if (!fs.existsSync(localFood)) {
    console.error("Missing food image:", localFood);
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  const users = db.collection("users");
  const stores = db.collection("stores");
  const suppliers = db.collection("suppliers");
  const products = db.collection("products");

  const user = await users.findOne({
    $or: [{ _id: new mongoose.Types.ObjectId(USER_ID) }, { username: USERNAME }, { phone: PHONE }],
  });
  if (!user) {
    console.error("User not found:", OWNER_NAME, USERNAME, PHONE);
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        dryRun: !apply,
        userId: String(user._id),
        name: user.name,
        username: user.username,
        phone: user.phone || PHONE,
        menuCount: MENU.length,
        extrasCount: EXTRAS.length,
        storeName: STORE_NAME,
        foodImage: FOOD_IMAGE,
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
  const phone = String(user.phone || PHONE).replace(/\D/g, "") || PHONE;

  // Keep owner display name; enable order alerts to his number (WhatsApp + SMS).
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
    // Avoid slug clash
    let slug = slugify(STORE_NAME);
    const slugTaken = await stores.findOne({ slug });
    if (slugTaken) slug = `${slug}-${String(user._id).slice(-6)}`;

    const ins = await stores.insertOne({
      userId: user._id,
      name: STORE_NAME,
      type: "supplier",
      country: "South Africa",
      countryCode: "ZA",
      cellphone: phone,
      whatsapp: `+${phone}`,
      email: user.email || "",
      address: "Customer collection — contact store for pickup",
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
          country: "South Africa",
          countryCode: "ZA",
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

  // Soft-deactivate previous food products for this supplier, then recreate from board.
  await products.updateMany(
    { supplierId: supplier._id, categories: FOOD_CATEGORY },
    { $set: { active: false, updatedAt: now } }
  );

  const created = [];
  for (const item of MENU) {
    const slug = `mmoja-${item.n}-${slugify(item.title)}-${Date.now().toString(36)}`;
    const doc = {
      supplierId: supplier._id,
      supplierSource: "internal",
      title: `#${item.n} ${item.title}`,
      slug,
      description: `${item.title} — kota from ${STORE_NAME}. Customer collects.`,
      images: [FOOD_IMAGE],
      price: item.price,
      currency: "ZAR",
      stock: 9999,
      outOfStock: false,
      allowResell: false,
      categories: [FOOD_CATEGORY, "Kota / Bunny Chow"],
      tags: ["food-menu", "food-pickup", "kota", TAG_STORE],
      availableCountries: ["South Africa"],
      colors: [{ name: "Standard", hex: "#f59e0b", imageIndex: 0 }],
      colorsManual: true,
      active: true,
      sku: `MMOJA-MENU-${item.n}`,
      createdAt: now,
      updatedAt: now,
    };
    const ins = await products.insertOne(doc);
    created.push({ id: String(ins.insertedId), title: doc.title, price: doc.price, kind: "menu" });
  }

  for (const [i, item] of EXTRAS.entries()) {
    const slug = `mmoja-extra-${slugify(item.title)}-${Date.now().toString(36)}`;
    const doc = {
      supplierId: supplier._id,
      supplierSource: "internal",
      title: `Extra: ${item.title}`,
      slug,
      description: `Add-on: ${item.title} — from ${STORE_NAME}.`,
      images: [FOOD_IMAGE],
      price: item.price,
      currency: "ZAR",
      stock: 9999,
      outOfStock: false,
      allowResell: false,
      categories: [FOOD_CATEGORY, "Extras"],
      tags: ["food-extra", "food-pickup", "kota", TAG_STORE],
      availableCountries: ["South Africa"],
      colors: [{ name: "Standard", hex: "#f59e0b", imageIndex: 0 }],
      colorsManual: true,
      active: true,
      sku: `MMOJA-EXTRA-${i + 1}`,
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
        username: user.username || USERNAME,
        ownerName: OWNER_NAME,
        phone,
        storeId: String(store._id),
        storeName: STORE_NAME,
        supplierId: String(supplier._id),
        productsCreated: created.length,
        orderNotifyWhatsapp: true,
        orderNotifySms: true,
        foodImage: FOOD_IMAGE,
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
      await sftpPut(conn, localFood, `${remoteRoot}/uploads/food/${FOOD_IMAGE_FILE}`);
      console.log("Pushed", FOOD_IMAGE_FILE, "to production uploads/food/");
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
