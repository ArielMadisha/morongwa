import fs from "fs";
import path from "path";
import mongoose from "mongoose";

function readMongoUriFromEnvFile(envPath) {
  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const key = t.slice(0, i).trim();
    if (key === "MONGODB_URI" || key === "MONGO_URI") return t.slice(i + 1).trim();
  }
  return "";
}

function pickUploadsPath(value) {
  if (!value || typeof value !== "string") return null;
  const s = value.trim();
  if (!s) return null;
  const match = s.match(/\/uploads\/.+$/);
  if (match) return match[0].split(/[?#]/)[0];
  if (s.startsWith("uploads/")) return `/${s}`;
  if (s.startsWith("/uploads/")) return s.split(/[?#]/)[0];
  if (/^[^/]+\.(jpg|jpeg|png|gif|webp|mp4|mp3|wav|m4a)$/i.test(s)) return `/uploads/${s}`;
  return null;
}

function collectMediaPaths(doc, out) {
  if (doc == null) return;
  if (typeof doc === "string") {
    const p = pickUploadsPath(doc);
    if (p) out.add(p);
    return;
  }
  if (Array.isArray(doc)) {
    for (const x of doc) collectMediaPaths(x, out);
    return;
  }
  if (typeof doc === "object") {
    for (const [k, v] of Object.entries(doc)) {
      if (["avatar", "image", "imageUrl", "images", "mediaUrl", "mediaUrls", "audioUrl", "artworkUrl", "path", "logo", "banner", "cover"].includes(k)) {
        collectMediaPaths(v, out);
      } else if (typeof v === "object" || typeof v === "string") {
        collectMediaPaths(v, out);
      }
    }
  }
}

async function main() {
  const appRoot = process.cwd();
  const mongoUri = readMongoUriFromEnvFile(path.join(appRoot, ".env"));
  if (!mongoUri) throw new Error("MONGODB_URI missing in .env");

  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 15000 });
  const db = mongoose.connection.db;
  const collections = ["users", "tvposts", "products", "songs", "adverts", "stores"];
  const paths = new Set();

  for (const name of collections) {
    const cursor = db.collection(name).find(
      {},
      {
        projection: {
          _id: 1,
          avatar: 1,
          pdp: 1,
          images: 1,
          imageUrl: 1,
          mediaUrls: 1,
          mediaUrl: 1,
          audioUrl: 1,
          artworkUrl: 1,
          logo: 1,
          banner: 1,
          cover: 1,
          path: 1,
        },
      }
    );
    while (await cursor.hasNext()) {
      const doc = await cursor.next();
      collectMediaPaths(doc, paths);
    }
  }

  const missing = [];
  for (const p of Array.from(paths).sort()) {
    const fullPath = path.join(appRoot, p.replace(/^\//, ""));
    if (!fs.existsSync(fullPath)) missing.push(p);
  }

  const outFile = path.join(appRoot, "media-integrity-missing.txt");
  fs.writeFileSync(outFile, missing.join("\n") + (missing.length ? "\n" : ""), "utf8");
  console.log(JSON.stringify({ scannedPaths: paths.size, missing: missing.length, outFile }, null, 2));
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exit(1);
});
