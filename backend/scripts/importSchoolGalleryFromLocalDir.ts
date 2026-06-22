/**
 * Copy local image files into backend/uploads and set a user's profileGalleryUrls (+ optional schoolPublicEmail).
 * Use for school photos you already have rights to host (e.g. exported from your own Facebook page).
 *
 * Requires MONGO_URI in backend/.env.
 *
 * Examples (from backend/):
 *   npx ts-node-dev --transpile-only --exit-child scripts/importSchoolGalleryFromLocalDir.ts --dry-run --name="Boitshepo" --dir="C:/exports/boitshepo-photos"
 *   npx ts-node-dev --transpile-only --exit-child scripts/importSchoolGalleryFromLocalDir.ts --user-id=507f1f77bcf86cd799439011 --dir="C:/exports/boitshepo-photos" --email=boitsheposec@gmail.com
 *   npx ts-node-dev --transpile-only --exit-child scripts/importSchoolGalleryFromLocalDir.ts --name="Boitshepo" --dir="..." --append
 *
 * Email only (no image folder; does not change profileGalleryUrls):
 *   npx ts-node-dev --transpile-only --exit-child scripts/importSchoolGalleryFromLocalDir.ts --user-id=69cd1cbe703cf9d7f5bba0fa --email=boitsheposec@gmail.com --email-only
 */

import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import mongoose from "mongoose";
import User from "../src/data/models/User";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const APPEND = args.includes("--append");
const EMAIL_ONLY = args.includes("--email-only");

function argValue(prefix: string): string | undefined {
  const hit = args.find((a) => a.startsWith(prefix));
  if (!hit) return undefined;
  const rest = hit.slice(prefix.length).trim();
  if (rest) return rest;
  const i = args.indexOf(hit);
  const next = args[i + 1];
  return next && !next.startsWith("--") ? next : undefined;
}

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);

function listImageFiles(dir: string): string[] {
  const names = fs.readdirSync(dir);
  const files: string[] = [];
  for (const n of names) {
    const full = path.join(dir, n);
    if (!fs.statSync(full).isFile()) continue;
    const ext = path.extname(n).toLowerCase();
    if (IMAGE_EXT.has(ext)) files.push(full);
  }
  files.sort();
  return files;
}

async function main() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error("MONGO_URI not set in backend/.env");
    process.exit(1);
  }

  const userId = (argValue("--user-id=") || "").trim();
  const nameQ = (argValue("--name=") || "").trim();
  const dirRaw = (argValue("--dir=") || "").trim();
  const emailRaw = (argValue("--email=") || "").trim().toLowerCase();

  if (!userId && !nameQ) {
    console.error("Provide --user-id=<ObjectId> or --name=<substring> (case-insensitive match on user name)");
    process.exit(1);
  }

  if (EMAIL_ONLY) {
    if (!emailRaw) {
      console.error("--email-only requires --email=address");
      process.exit(1);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) {
      console.error("Invalid --email");
      process.exit(1);
    }
    if (dirRaw) {
      console.error("Do not pass --dir= with --email-only");
      process.exit(1);
    }
    if (!userId) {
      console.error("--email-only requires an explicit --user-id= (avoid accidental name matches)");
      process.exit(1);
    }
  } else {
    if (!dirRaw || !fs.existsSync(dirRaw) || !fs.statSync(dirRaw).isDirectory()) {
      console.error("Provide an existing folder: --dir=C:\\path\\to\\images (or use --email-only)");
      process.exit(1);
    }
  }

  await mongoose.connect(mongoUri);

  let user = null as InstanceType<typeof User> | null;
  if (userId) {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      console.error("Invalid --user-id");
      process.exit(1);
    }
    user = await User.findById(userId);
  } else {
    const re = new RegExp(nameQ.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const matches = await User.find({ name: re }).limit(10).select("name _id");
    if (matches.length === 0) {
      console.error(`No user matched name pattern: ${nameQ}`);
      process.exit(1);
    }
    if (matches.length > 1) {
      console.error(`Multiple matches for name=${nameQ}. Use --user-id=...`);
      for (const c of matches) console.error(`  ${c._id}  ${c.name}`);
      process.exit(1);
    }
    user = (await User.findById(matches[0]._id)) as InstanceType<typeof User> | null;
  }

  if (!user) {
    console.error("User not found");
    process.exit(1);
  }

  const uid = String(user._id);

  if (EMAIL_ONLY) {
    if (DRY) {
      console.log(`[dry-run] Would set schoolPublicEmail=${emailRaw} for ${uid} (${user.name})`);
      await mongoose.disconnect();
      return;
    }
    await User.updateOne({ _id: user._id }, { $set: { schoolPublicEmail: emailRaw } });
    console.log(`Updated schoolPublicEmail for ${uid} (${user.name}) -> ${emailRaw}`);
    await mongoose.disconnect();
    return;
  }

  const images = listImageFiles(dirRaw);
  if (!images.length) {
    console.error(`No image files in ${dirRaw}`);
    process.exit(1);
  }

  const uploadsRoot = path.resolve(__dirname, "../uploads");
  const destDir = path.join(uploadsRoot, "school-gallery", uid);
  const newPaths: string[] = [];

  for (const src of images.slice(0, 12)) {
    const ext = path.extname(src).toLowerCase() || ".jpg";
    const base = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`;
    const dest = path.join(destDir, base);
    const publicPath = `/uploads/school-gallery/${uid}/${base}`;
    if (DRY) {
      console.log(`[dry-run] copy ${src} -> ${dest}  (${publicPath})`);
    } else {
      fs.mkdirSync(destDir, { recursive: true });
      fs.copyFileSync(src, dest);
      newPaths.push(publicPath);
    }
  }

  const max = 12;
  const merged = APPEND
    ? [...new Set([...(user.profileGalleryUrls || []), ...newPaths])].slice(0, max)
    : newPaths.slice(0, max);

  if (DRY) {
    console.log(`User: ${uid} ${user.name}`);
    console.log(`Would set profileGalleryUrls (${merged.length}):`, merged);
    if (emailRaw) console.log(`Would set schoolPublicEmail: ${emailRaw}`);
    await mongoose.disconnect();
    return;
  }

  const updates: Record<string, unknown> = { profileGalleryUrls: merged };
  if (emailRaw) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) {
      console.error("Invalid --email");
      process.exit(1);
    }
    updates.schoolPublicEmail = emailRaw;
  }

  await User.updateOne({ _id: user._id }, { $set: updates });
  console.log(`Updated ${uid} (${user.name})`);
  console.log("profileGalleryUrls:", merged);
  if (emailRaw) console.log("schoolPublicEmail:", emailRaw);

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
