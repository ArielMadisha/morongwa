/**
 * Convert food menu PNGs → JPEG, push to production uploads/food, remap product.images.
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
const OUT = path.join(ROOT, "exports", "food-jpg");

const PNG_NAMES = [
  "calibas-kota-1.png",
  "calibas-kota-2.png",
  "calibas-kota-3.png",
  "calibas-kota-4.png",
  "mmoja-lerato-kota.png",
];

function httpGet(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          httpGet(res.headers.location).then(resolve, reject);
          return;
        }
        const chunks = [];
        res.on("data", (d) => chunks.push(d));
        res.on("end", () => resolve(Buffer.concat(chunks)));
      })
      .on("error", reject);
  });
}

function sftpPut(conn, localPath, remotePath) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err);
      sftp.fastPut(localPath, remotePath, (e) => (e ? reject(e) : resolve()));
    });
  });
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const jpgFiles = [];
  for (const name of PNG_NAMES) {
    const url = `https://www.qwertymates.com/uploads/food/${name}`;
    const buf = await httpGet(url);
    if (!buf.length || buf.length < 100) {
      console.warn("skip missing", name, buf.length);
      continue;
    }
    const jpgName = name.replace(/\.png$/i, ".jpg");
    const jpgPath = path.join(OUT, jpgName);
    await sharp(buf).jpeg({ quality: 85 }).toFile(jpgPath);
    jpgFiles.push({ jpgName, jpgPath, pngName: name });
    console.log("converted", name, "->", jpgName);
  }

  const cfg = mergeDeployConfig(repoRoot);
  const remoteFood =
    (cfg.MORONGWA_BACKEND_HOST_PATH || "/home/zweppe/morongwa-live/backend").replace(/\/$/, "") +
    "/uploads/food";
  const conn = await sshConnect(cfg, repoRoot);
  try {
    await execSsh(conn, `mkdir -p "${remoteFood}"`);
    for (const f of jpgFiles) {
      await sftpPut(conn, f.jpgPath, `${remoteFood}/${f.jpgName}`);
      console.log("pushed", `${remoteFood}/${f.jpgName}`);
    }
  } finally {
    conn.end();
  }

  for (const f of jpgFiles) {
    const u = `https://www.qwertymates.com/uploads/food/${f.jpgName}`;
    const head = await new Promise((resolve, reject) => {
      https
        .request(u, { method: "HEAD" }, (res) =>
          resolve({ status: res.statusCode, type: res.headers["content-type"] })
        )
        .on("error", reject)
        .end();
    });
    console.log("HEAD", u, head);
  }

  await mongoose.connect(process.env.MONGO_URI);
  const col = mongoose.connection.db.collection("products");
  let updated = 0;
  for (const f of jpgFiles) {
    const from = `/uploads/food/${f.pngName}`;
    const to = `/uploads/food/${f.jpgName}`;
    const r = await col.updateMany(
      { images: from },
      { $set: { "images.$[el]": to } },
      { arrayFilters: [{ el: from }] }
    );
    updated += r.modifiedCount;
    console.log("remap", from, "->", to, "modified", r.modifiedCount);
  }
  await mongoose.disconnect();
  console.log("done. products updated:", updated);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
