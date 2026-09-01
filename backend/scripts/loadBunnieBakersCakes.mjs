#!/usr/bin/env node
/**
 * Replace Bunnie Bakers sample grocery items with real cake menu + photos.
 *
 *   node scripts/loadBunnieBakersCakes.mjs --apply
 *   node scripts/loadBunnieBakersCakes.mjs --apply --skip-push   # Mongo only
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import https from "https";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import sharp from "sharp";
import { mergeDeployConfig, sshConnect, execSsh } from "./lib/deploySsh.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..", "..");
const ROOT = path.join(__dirname, "..");
const apply = process.argv.includes("--apply");
const skipPush = process.argv.includes("--skip-push");

const SRC = path.join(
  "C:",
  "Users",
  "Dell",
  "OneDrive - Bonakude Consulting PTY LTD",
  "Documents",
  "Business",
  "QwertyHub Stores",
  "Bunnie Bakers"
);
const LOCAL_FOOD = path.join(ROOT, "uploads", "food");
const STORE_NAME = "Bunnie Bakers";
const GROCERY_CATEGORY = "Groceries";
const STORE_ADDRESS = "26402 Extension 6, Tilo Street, Soshanguve, 0164";

/** Catalog: filename in OneDrive folder → product */
const CATALOG = [
  {
    sku: "BUNNIE-SV",
    title: "Small Vanilla Cake (Includes 5 cupcakes)",
    price: 545,
    file: "Vanilla Small.jpeg",
    jpg: "bunnie-small-vanilla.jpg",
  },
  {
    sku: "BUNNIE-SC",
    title: "Small Chocolate Cake (Includes 5 cupcakes)",
    price: 445,
    file: "chocolate small.jpeg",
    jpg: "bunnie-small-chocolate.jpg",
  },
  {
    sku: "BUNNIE-SRV",
    title: "Small Red Velvet Cake (Includes 5 cupcakes)",
    price: 495,
    file: "Red velvet small.jpeg",
    jpg: "bunnie-small-red-velvet.jpg",
  },
  {
    sku: "BUNNIE-SCR",
    title: "Small Carrot Cake (Includes 5 cupcakes)",
    price: 395,
    file: "Carrot cake.jpeg",
    jpg: "bunnie-small-carrot.jpg",
  },
  {
    sku: "BUNNIE-MV",
    title: "Medium Vanilla Cake (Includes 5 cupcakes)",
    price: 495,
    file: "Vanilla medium.jpeg",
    jpg: "bunnie-medium-vanilla.jpg",
  },
  {
    sku: "BUNNIE-MC",
    title: "Medium Chocolate Cake (Includes 5 cupcakes)",
    price: 545,
    file: "Chocolate medium.jpeg",
    jpg: "bunnie-medium-chocolate.jpg",
  },
  {
    sku: "BUNNIE-MRV",
    title: "Medium Red Velvet Cake (Includes 5 cupcakes)",
    price: 595,
    file: "Red velvet medium.jpeg",
    jpg: "bunnie-medium-red-velvet.jpg",
  },
  {
    sku: "BUNNIE-MCR",
    title: "Medium Carrot Cake (Includes 5 cupcakes)",
    price: 645,
    file: "Carrot medium.jpeg",
    jpg: "bunnie-medium-carrot.jpg",
  },
  {
    sku: "BUNNIE-XCUP",
    title: "Extra Cupcake",
    price: 55,
    file: "cupcakes.jpeg",
    jpg: "bunnie-extra-cupcake.jpg",
    description: "Extra cupcake add-on for any Bunnie Bakers cake order.",
  },
  {
    sku: "BUNNIE-XDES",
    title: "Your Specific Design",
    price: 50,
    file: "Cupcakes & Chocolate.jpeg",
    jpg: "bunnie-specific-design.jpg",
    description:
      "Custom design / message add-on for your cake (text, theme, or colours).",
  },
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

async function main() {
  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI not set");
    process.exit(1);
  }
  if (!fs.existsSync(SRC)) {
    console.error("Source folder missing:", SRC);
    process.exit(1);
  }

  fs.mkdirSync(LOCAL_FOOD, { recursive: true });

  const prepared = [];
  for (const item of CATALOG) {
    const srcPath = path.join(SRC, item.file);
    if (!fs.existsSync(srcPath)) {
      console.error("Missing image:", item.file);
      process.exit(1);
    }
    const outPath = path.join(LOCAL_FOOD, item.jpg);
    await sharp(srcPath)
      .rotate()
      .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toFile(outPath);
    prepared.push({ ...item, outPath, imageUrl: `/uploads/food/${item.jpg}` });
    console.log("prepared", item.jpg);
  }

  console.log(
    JSON.stringify(
      {
        dryRun: !apply,
        store: STORE_NAME,
        products: prepared.map((p) => ({
          title: p.title,
          price: p.price,
          image: p.imageUrl,
        })),
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
    const remoteFood =
      (cfg.MORONGWA_BACKEND_HOST_PATH || "/home/zweppe/morongwa-live/backend").replace(
        /\/$/,
        ""
      ) + "/uploads/food";
    const conn = await sshConnect(cfg, repoRoot);
    try {
      await execSsh(conn, `mkdir -p "${remoteFood}"`);
      for (const p of prepared) {
        await sftpPut(conn, p.outPath, `${remoteFood}/${p.jpg}`);
        console.log("pushed", p.jpg);
      }
    } finally {
      conn.end();
    }
    for (const p of prepared) {
      const u = `https://www.qwertymates.com/uploads/food/${p.jpg}`;
      console.log("HEAD", u, await headUrl(u));
    }
  }

  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  const stores = db.collection("stores");
  const suppliers = db.collection("suppliers");
  const products = db.collection("products");

  const store = await stores.findOne({ name: new RegExp("^Bunnie Bakers$", "i") });
  if (!store) {
    console.error("Store not found: Bunnie Bakers");
    process.exit(1);
  }
  const supplier =
    (store.supplierId && (await suppliers.findOne({ _id: store.supplierId }))) ||
    (await suppliers.findOne({ linkedStoreId: store._id })) ||
    (await suppliers.findOne({ storeName: new RegExp("bunnie", "i") }));
  if (!supplier) {
    console.error("Supplier not found for Bunnie Bakers");
    process.exit(1);
  }

  const now = new Date();

  // Soft-remove all prior Bunnie products (samples + any previous cake load)
  const deactivate = await products.updateMany(
    {
      $or: [
        { supplierId: supplier._id },
        { tags: "bunnie-bakers" },
        { sku: { $regex: /^BUNNIE-/i } },
      ],
    },
    { $set: { active: false, outOfStock: true, updatedAt: now } }
  );
  console.log("deactivated prior products:", deactivate.modifiedCount);

  const created = [];
  let n = 0;
  for (const item of prepared) {
    n += 1;
    const slug = `bunnie-bakers-${n}-${slugify(item.title)}-${Date.now().toString(36)}`;
    const doc = {
      supplierId: supplier._id,
      supplierSource: "internal",
      title: `#${n} ${item.title}`,
      slug,
      description:
        item.description ||
        `${item.title} — from ${STORE_NAME}. Includes 5 cupcakes with the cake. Collect at ${STORE_ADDRESS}.`,
      images: [item.imageUrl],
      price: item.price,
      currency: "ZAR",
      stock: 9999,
      outOfStock: false,
      allowResell: false,
      categories: [GROCERY_CATEGORY],
      tags: ["grocery-pickup", "grocery", "bakery", "cakes", "bunnie-bakers"],
      availableCountries: ["South Africa"],
      colors: [{ name: "Standard", hex: "#f9a8d4", imageIndex: 0 }],
      colorsManual: true,
      active: true,
      sku: item.sku,
      createdAt: now,
      updatedAt: now,
    };
    // Extras: shorter description already set
    if (item.sku === "BUNNIE-XCUP" || item.sku === "BUNNIE-XDES") {
      doc.description = `${item.description} Collect / arrange with ${STORE_NAME}, ${STORE_ADDRESS}.`;
      doc.tags = ["grocery-pickup", "grocery", "bakery", "extras", "bunnie-bakers"];
    }
    const ins = await products.insertOne(doc);
    created.push({
      id: String(ins.insertedId),
      title: doc.title,
      price: doc.price,
      image: item.imageUrl,
    });
  }

  // Ensure store vertical stays grocery
  await stores.updateOne(
    { _id: store._id },
    { $set: { vertical: "grocery", supplierId: supplier._id, updatedAt: now } }
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        storeId: String(store._id),
        supplierId: String(supplier._id),
        deactivated: deactivate.modifiedCount,
        productsCreated: created.length,
        products: created,
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
