/**
 * Move gallery + avatar from gallery-import duplicates (zagal* username) onto the
 * existing legacy school account when names dedupe-match. Optionally delete the duplicate user.
 *
 *   npm run reconcile:school-gallery-dupes -- --dry-run
 *   npm run reconcile:school-gallery-dupes
 *   npm run reconcile:school-gallery-dupes -- --only=aggeneys
 */

import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import mongoose from "mongoose";
import User from "../src/data/models/User";
import TVPost from "../src/data/models/TVPost";
import { looksLikeSchoolInstitutionName } from "../src/utils/schoolProfileDetection";
import {
  schoolDedupeKey,
  keysConflict,
  isImportableSchoolFolder,
} from "./lib/schoolNameMatching";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const DELETE_DUPES = !args.includes("--keep-duplicates");

function argValue(prefix: string): string | undefined {
  const hit = args.find((a) => a.startsWith(prefix));
  if (!hit) return undefined;
  const rest = hit.slice(prefix.length).trim();
  if (rest) return rest;
  const i = args.indexOf(hit);
  const next = args[i + 1];
  return next && !next.startsWith("--") ? next : undefined;
}

const ONLY = (argValue("--only=") || "")
  .split("|")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const USERNAME_PREFIX = (argValue("--username-prefix=") || "zagal").trim().toLowerCase();

function isGalleryImportUsername(username?: string | null): boolean {
  const u = String(username || "").trim().toLowerCase();
  return u.startsWith(USERNAME_PREFIX) && /^zagal[a-f0-9]+$/.test(u);
}

function isLegacyNumericSchoolUsername(username?: string | null): boolean {
  const u = String(username || "").trim();
  return /^\d{6,}$/.test(u);
}

type SchoolRow = {
  _id: mongoose.Types.ObjectId;
  name: string;
  username?: string;
  avatar?: string;
  profileGalleryUrls?: string[];
};

async function loadSchoolRows(): Promise<SchoolRow[]> {
  const users = await User.find({
    $or: [
      { isSchoolAccount: true },
      { importedFromLegacy: true },
      { username: /^\d{6,}$/ },
      { username: new RegExp(`^${USERNAME_PREFIX}[a-f0-9]+$`, "i") },
    ],
    name: { $exists: true, $ne: "" },
  })
    .select("name username avatar profileGalleryUrls isSchoolAccount")
    .lean();

  const rows: SchoolRow[] = [];
  for (const u of users) {
    const name = String(u.name || "").trim();
    if (!name) continue;
    if (!looksLikeSchoolInstitutionName(name) && !isImportableSchoolFolder(name)) continue;
    rows.push({
      _id: u._id as mongoose.Types.ObjectId,
      name,
      username: u.username as string | undefined,
      avatar: u.avatar as string | undefined,
      profileGalleryUrls: (u.profileGalleryUrls as string[]) || [],
    });
  }
  return rows;
}

function findLegacyTarget(dup: SchoolRow, all: SchoolRow[]): SchoolRow | null {
  const key = schoolDedupeKey(dup.name);
  if (!key) return null;
  const hits = all.filter((c) => {
    if (String(c._id) === String(dup._id)) return false;
    if (!isLegacyNumericSchoolUsername(c.username)) return false;
    const ck = schoolDedupeKey(c.name);
    return ck === key || keysConflict(ck, key);
  });
  if (!hits.length) return null;
  return hits[0];
}

function copyGalleryFile(
  uploadsRoot: string,
  fromUid: string,
  toUid: string,
  publicPath: string
): string | null {
  const rel = publicPath.replace(/^\/uploads\/school-gallery\//, "");
  const src = path.join(uploadsRoot, "school-gallery", rel);
  if (!fs.existsSync(src)) return null;
  const base = path.basename(src);
  const destDir = path.join(uploadsRoot, "school-gallery", toUid);
  const dest = path.join(destDir, base);
  if (path.resolve(src) === path.resolve(dest)) return publicPath;
  if (!DRY) {
    fs.mkdirSync(destDir, { recursive: true });
    if (!fs.existsSync(dest)) fs.copyFileSync(src, dest);
  }
  return `/uploads/school-gallery/${toUid}/${base}`;
}

async function main() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error("MONGO_URI not set");
    process.exit(1);
  }
  await mongoose.connect(mongoUri);
  const uploadsRoot = path.resolve(__dirname, "../uploads");

  const all = await loadSchoolRows();
  const dupes = all.filter((u) => isGalleryImportUsername(u.username));
  console.log(`Gallery-import accounts: ${dupes.length}`);
  if (DRY) console.log("DRY RUN");

  let merged = 0;
  let skipped = 0;

  for (const dup of dupes) {
    if (ONLY.length && !ONLY.some((q) => dup.name.toLowerCase().includes(q))) continue;
    const target = findLegacyTarget(dup, all);
    if (!target) {
      skipped++;
      continue;
    }

    const toUid = String(target._id);
    const fromUid = String(dup._id);
    const gallery = dup.profileGalleryUrls || [];
    if (!gallery.length) {
      skipped++;
      continue;
    }

    const remapped: string[] = [];
    for (const p of gallery) {
      const next = copyGalleryFile(uploadsRoot, fromUid, toUid, p);
      if (next) remapped.push(next);
    }
    if (!remapped.length) {
      console.warn(`SKIP (files missing on disk): ${dup.name} -> ${target.name}`);
      skipped++;
      continue;
    }

    const mergedGallery = [...new Set([...(target.profileGalleryUrls || []), ...remapped])];
    const avatar = target.avatar || remapped[0];

    console.log(`${DRY ? "[dry-run] " : ""}MERGE ${dup.name}`);
    console.log(`  dup ${fromUid} (${dup.username}) -> legacy ${toUid} (${target.username})`);
    console.log(`  photos ${remapped.length}, gallery total ${mergedGallery.length}`);

    if (!DRY) {
      await User.updateOne(
        { _id: target._id },
        {
          $set: {
            profileGalleryUrls: mergedGallery,
            avatar,
            isSchoolAccount: true,
          },
        }
      );
      await TVPost.updateMany(
        { creatorId: dup._id },
        { $set: { creatorId: target._id } }
      );
      if (DELETE_DUPES) {
        await User.deleteOne({ _id: dup._id });
        const dupDir = path.join(uploadsRoot, "school-gallery", fromUid);
        if (fs.existsSync(dupDir)) fs.rmSync(dupDir, { recursive: true, force: true });
      } else {
        await User.updateOne(
          { _id: dup._id },
          { $set: { profileGalleryUrls: [], avatar: undefined } }
        );
      }
    }
    merged++;
  }

  console.log("\n--- Summary ---");
  console.log("Merged:", merged);
  console.log("Skipped (no legacy match / no files):", skipped);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
