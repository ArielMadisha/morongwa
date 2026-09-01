#!/usr/bin/env node
/**
 * Create GRANLUX GLOBAL (China → worldwide) essentials supplier store.
 *
 *   node scripts/setupGranluxGlobal.mjs --apply
 *   node scripts/setupGranluxGlobal.mjs --apply --skip-push
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import https from "https";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import sharp from "sharp";
import { mergeDeployConfig, sshConnect, execSsh } from "./lib/deploySsh.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..", "..");
const ROOT = path.join(__dirname, "..");
const apply = process.argv.includes("--apply");
const skipPush = process.argv.includes("--skip-push");

const PHONE = "8618640905065";
const USERNAME = "lazwellest";
const EMAIL = "lazwellest@outlook.com";
const OWNER_NAME = "Laz Wellest";
const STORE_NAME = "GRANLUX GLOBAL";
const PASSWORD = "11111111";
const COUNTRY = "China";
const COUNTRY_CODE = "CN";
const CATEGORY = "Home, Garden & Furniture";
const HOME_IMPROVEMENT = "Home Improvement";

const STORE_DESCRIPTION = `Luxury Stone & Bath Ware Made Affordable.
GRANLUX GLOBAL brings premium granite, luxury countertops, modern bathroom fixtures, bathtubs, basins, taps, and more—direct from trusted factories at competitive prices.

Why pay more when you can get luxury made affordable?

Whether you’re a homeowner, contractor, architect, interior designer, or property developer, we’ve got the products to bring your vision to life.

Based in China. Ships worldwide.`;

const ASSETS = path.join(
  "C:",
  "Users",
  "Dell",
  ".cursor",
  "projects",
  "c-Users-Dell-cursor-projects-morongwa",
  "assets"
);

const IMAGES = {
  basins: path.join(
    ASSETS,
    "c__Users_Dell_AppData_Roaming_Cursor_User_workspaceStorage_8cbbb33495ce43c096bb0498540fe740_images_WhatsApp_Image_2026-07-30_at_06.28.12__1_-7e8bbc17-7c59-4276-80c5-072e1d92c328.png"
  ),
  bathtub: path.join(
    ASSETS,
    "c__Users_Dell_AppData_Roaming_Cursor_User_workspaceStorage_8cbbb33495ce43c096bb0498540fe740_images_WhatsApp_Image_2026-07-30_at_06.28.12__2_-9922e88a-e2c8-44d3-a044-e351edf0f7b1.png"
  ),
  shipping: path.join(
    ASSETS,
    "c__Users_Dell_AppData_Roaming_Cursor_User_workspaceStorage_8cbbb33495ce43c096bb0498540fe740_images_WhatsApp_Image_2026-07-30_at_06.28.12-0168a990-198b-4662-a517-c5e0015b76b2.png"
  ),
  pamphlet: path.join(
    ASSETS,
    "c__Users_Dell_AppData_Roaming_Cursor_User_workspaceStorage_8cbbb33495ce43c096bb0498540fe740_images_WhatsApp_Image_2026-07-30_at_06.28.13-312d8f08-a0e3-4f04-9ca5-08d3341fc6f3.png"
  ),
};

const LOCAL_UPLOADS = path.join(ROOT, "uploads");

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

function headUrl(url) {
  return new Promise((resolve, reject) => {
    https
      .request(url, { method: "HEAD" }, (res) =>
        resolve({ status: res.statusCode, type: res.headers["content-type"] })
      )
      .on("error", reject)
      .end();
  });
}

async function prepareJpg(srcPath, outName, { width = 1400, height = 1400, fit = "inside" } = {}) {
  if (!fs.existsSync(srcPath)) throw new Error(`Missing image: ${srcPath}`);
  fs.mkdirSync(LOCAL_UPLOADS, { recursive: true });
  const outPath = path.join(LOCAL_UPLOADS, outName);
  await sharp(srcPath)
    .rotate()
    .resize(width, height, { fit, withoutEnlargement: true })
    .jpeg({ quality: 88 })
    .toFile(outPath);
  return { outName, outPath, url: `/uploads/${outName}` };
}

async function main() {
  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI not set");
    process.exit(1);
  }

  const prepared = {
    basins: await prepareJpg(IMAGES.basins, "granlux-vessel-basins.jpg"),
    bathtub: await prepareJpg(IMAGES.bathtub, "granlux-freestanding-bathtub.jpg"),
    shipping: await prepareJpg(IMAGES.shipping, "granlux-worldwide-shipping.jpg"),
    strip: await prepareJpg(IMAGES.pamphlet, "granlux-store-strip.jpg", {
      width: 1600,
      height: 600,
      fit: "cover",
    }),
    pamphlet: await prepareJpg(IMAGES.pamphlet, "granlux-catalog-pamphlet.jpg", {
      width: 1200,
      height: 1600,
      fit: "inside",
    }),
  };
  console.log("prepared images", Object.keys(prepared));

  console.log(
    JSON.stringify(
      {
        dryRun: !apply,
        owner: OWNER_NAME,
        username: USERNAME,
        email: EMAIL,
        phone: `+${PHONE}`,
        store: STORE_NAME,
        country: COUNTRY,
        note: "No priced products and no strip background. Upload product photos as normal wall posts when needed.",
      },
      null,
      2
    )
  );

  if (!apply) {
    console.log("Re-run with --apply");
    return;
  }

  if (!skipPush) {
    const cfg = mergeDeployConfig(repoRoot);
    const remoteUploads =
      (cfg.MORONGWA_BACKEND_HOST_PATH || "/home/zweppe/morongwa-live/backend").replace(/\/$/, "") +
      "/uploads";
    const conn = await sshConnect(cfg, repoRoot);
    try {
      await execSsh(conn, `mkdir -p "${remoteUploads}"`);
      for (const img of Object.values(prepared)) {
        await sftpPut(conn, img.outPath, `${remoteUploads}/${img.outName}`);
        console.log("pushed", img.outName);
      }
    } finally {
      conn.end();
    }
    for (const img of Object.values(prepared)) {
      console.log("HEAD", `https://www.qwertymates.com${img.url}`, await headUrl(`https://www.qwertymates.com${img.url}`));
    }
  }

  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  const users = db.collection("users");
  const stores = db.collection("stores");
  const suppliers = db.collection("suppliers");
  const products = db.collection("products");
  const now = new Date();
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  let user = await users.findOne({
    $or: [
      { username: USERNAME },
      { email: EMAIL },
      { email: EMAIL.toLowerCase() },
      { phone: PHONE },
      { phone: `+${PHONE}` },
    ],
  });

  const userFields = {
    name: OWNER_NAME,
    username: USERNAME,
    email: EMAIL.toLowerCase(),
    phone: PHONE,
    countryCode: COUNTRY_CODE,
    passwordHash,
    role: "user",
    isVerified: true,
    avatar: prepared.pamphlet.url,
    // Do NOT set stripBackgroundPic — status bar stays clean (like other accounts).
    // Photos are uploaded as normal wall image posts separately when needed.
    notificationPreferences: {
      orderMessenger: true,
      orderEmail: true,
      orderSms: false,
      orderWhatsapp: true,
    },
    updatedAt: now,
  };

  if (!user) {
    const ins = await users.insertOne({ ...userFields, createdAt: now });
    user = await users.findOne({ _id: ins.insertedId });
    console.log("Created user", String(user._id));
  } else {
    await users.updateOne({ _id: user._id }, { $set: userFields });
    user = await users.findOne({ _id: user._id });
    console.log("Updated user", String(user._id));
  }

  const slug = slugify(STORE_NAME);
  let store = await stores.findOne({
    $or: [{ slug }, { userId: user._id, name: STORE_NAME }, { name: /granlux/i }],
  });

  const storeFields = {
    userId: user._id,
    name: STORE_NAME,
    slug,
    type: "supplier",
    vertical: "essentials",
    country: COUNTRY,
    countryCode: COUNTRY_CODE,
    cellphone: PHONE,
    whatsapp: `+${PHONE}`,
    email: EMAIL.toLowerCase(),
    address: "China — factory direct, ships worldwide",
    area: "China (Global Supply)",
    whatsappMarketCountries: ["ZA", "BW", "CN", "US", "GB", "AE", "NG", "KE", "AU"],
    updatedAt: now,
  };

  if (!store) {
    const ins = await stores.insertOne({ ...storeFields, createdAt: now });
    store = await stores.findOne({ _id: ins.insertedId });
    console.log("Created store", String(store._id));
  } else {
    await stores.updateOne({ _id: store._id }, { $set: storeFields });
    store = await stores.findOne({ _id: store._id });
    console.log("Updated store", String(store._id));
  }

  let supplier = await suppliers.findOne({
    $or: [{ linkedStoreId: store._id }, { userId: user._id, storeName: /granlux/i }],
  });
  const supplierFields = {
    userId: user._id,
    linkedStoreId: store._id,
    status: "approved",
    type: "company",
    storeName: STORE_NAME,
    contactPhone: PHONE,
    contactEmail: EMAIL.toLowerCase(),
    pickupAddress: "China — worldwide shipping",
    reviewedAt: now,
    updatedAt: now,
  };
  if (!supplier) {
    const ins = await suppliers.insertOne({ ...supplierFields, createdAt: now });
    supplier = await suppliers.findOne({ _id: ins.insertedId });
    console.log("Created supplier", String(supplier._id));
  } else {
    await suppliers.updateOne({ _id: supplier._id }, { $set: supplierFields });
    supplier = await suppliers.findOne({ _id: supplier._id });
    console.log("Updated supplier", String(supplier._id));
  }

  await stores.updateOne(
    { _id: store._id },
    { $set: { supplierId: supplier._id, updatedAt: now } }
  );

  // Keep any prior GRANLUX catalog inactive — photos live on profile until priced list arrives.
  await products.updateMany(
    { $or: [{ supplierId: supplier._id }, { sku: { $regex: /^GRANLUX-/i } }] },
    { $set: { active: false, outOfStock: true, updatedAt: now } }
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        userId: String(user._id),
        username: USERNAME,
        email: EMAIL,
        phone: `+${PHONE}`,
        password: PASSWORD,
        storeId: String(store._id),
        supplierId: String(supplier._id),
        vertical: "essentials",
        country: COUNTRY,
        activeStoreProducts: 0,
        note: "No priced products, no strip background — wait for owner catalog / normal photo uploads.",
        login: "Username lazwellest / email Lazwellest@outlook.com / WhatsApp +86 186 4090 5065 — password 11111111",
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
