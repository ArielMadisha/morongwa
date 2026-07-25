#!/usr/bin/env node
/**
 * Assign real Caliba kota photos randomly + set Google Maps pickup location.
 *
 *   node scripts/updateCalibasFoodPhotosAndMaps.mjs --apply --push-remote
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

const USERNAME = "calibastownshipburger";
const STORE_NAME = "Caliba's Township Burger";
const FOOD_CATEGORY = "Food & Restaurant";
const MAPS_URL = "https://maps.app.goo.gl/NtygfjwHBQCRHDhB9";
const LAT = -(25 + 22 / 60 + 33.6 / 3600); // 25°22'33.6"S
const LNG = 28 + 15 / 60 + 40.9 / 3600; // 28°15'40.9"E
/** Reverse-geocoded from pin 25°22'33.6"S 28°15'40.9"E (Photon / OSM). */
const ADDRESS = "Mosimegi Street, Temba, Pretoria, Gauteng, 0407";

const PHOTOS = [
  "calibas-kota-1.png",
  "calibas-kota-2.png",
  "calibas-kota-3.png",
  "calibas-kota-4.png",
];

function pickPhoto(seed) {
  const s = String(seed || "");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return `/uploads/food/${PHOTOS[h % PHOTOS.length]}`;
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

  for (const name of PHOTOS) {
    const p = path.join(backendRoot, "uploads", "food", name);
    if (!fs.existsSync(p)) {
      console.error("Missing photo:", p);
      process.exit(1);
    }
  }

  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  const users = db.collection("users");
  const stores = db.collection("stores");
  const suppliers = db.collection("suppliers");
  const products = db.collection("products");

  const user = await users.findOne({ username: USERNAME });
  if (!user) {
    console.error("User not found:", USERNAME);
    process.exit(1);
  }
  const store = await stores.findOne({ userId: user._id, type: "supplier", name: STORE_NAME });
  const supplier = await suppliers.findOne({
    $or: [{ linkedStoreId: store?._id }, { userId: user._id, storeName: STORE_NAME }],
  });
  if (!store || !supplier) {
    console.error("Store/supplier missing for Caliba's");
    process.exit(1);
  }

  const foodProducts = await products
    .find({ supplierId: supplier._id, categories: FOOD_CATEGORY, active: true })
    .project({ _id: 1, title: 1, images: 1, sku: 1 })
    .toArray();

  console.log(
    JSON.stringify(
      {
        dryRun: !apply,
        userId: String(user._id),
        storeId: String(store._id),
        supplierId: String(supplier._id),
        products: foodProducts.length,
        mapsUrl: MAPS_URL,
        lat: LAT,
        lng: LNG,
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
  await stores.updateOne(
    { _id: store._id },
    {
      $set: {
        address: ADDRESS,
        mapsUrl: MAPS_URL,
        latitude: LAT,
        longitude: LNG,
        updatedAt: now,
      },
    }
  );

  let updated = 0;
  for (const p of foodProducts) {
    const image = pickPhoto(p.sku || p._id || p.title);
    await products.updateOne(
      { _id: p._id },
      { $set: { images: [image], updatedAt: now } }
    );
    updated += 1;
  }

  console.log(JSON.stringify({ storeUpdated: true, productsUpdated: updated }, null, 2));

  if (pushRemote) {
    const cfg = mergeDeployConfig(repoRoot);
    const remoteRoot = resolveRemoteBackendRoot(cfg);
    const conn = await sshConnect(cfg, repoRoot);
    try {
      await execSsh(conn, `mkdir -p "${remoteRoot}/uploads/food"`);
      for (const name of PHOTOS) {
        const local = path.join(backendRoot, "uploads", "food", name);
        await sftpPut(conn, local, `${remoteRoot}/uploads/food/${name}`);
        console.log("Pushed", name);
      }
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
