/**
 * Seed Boitshepo Secondary School profile: copy local image files into uploads/tv,
 * set user.avatar (first file), create approved TVPost (type image) for each file
 * so /user/:id "Images" tab counts increase, and set profileGalleryUrls.
 *
 * Run from backend/:
 *   npx ts-node-dev --transpile-only --exit-child scripts/seedBoitshepoSchoolMedia.ts -- "C:\\path\\a.png" "C:\\path\\b.png"
 * Or folder (all .png/.jpg/.jpeg/.webp, sorted by name):
 *   npx ts-node-dev --transpile-only --exit-child scripts/seedBoitshepoSchoolMedia.ts --dir=./exports/boitshepo-school-media
 *
 * Options:
 *   --force     Replace avatar/gallery URLs and add posts even if seed posts already exist
 *   --dry-run   Print actions only
 *
 * Resolves school user by username 700910158, email boitsheposec@gmail.com, or exact name BOITSHEPO SECONDARY SCHOOL.
 */
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import mongoose from "mongoose";
import { connectDB } from "../src/data/db";
import User from "../src/data/models/User";
import TVPost from "../src/data/models/TVPost";
import { buildSchoolTvCaption, buildSchoolTvHashtags } from "./lib/schoolTvPostCopy";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const SCHOOL_NAME = "Boitshepo Secondary School";
const CAPTION = buildSchoolTvCaption(SCHOOL_NAME);
const HASHTAGS = buildSchoolTvHashtags(SCHOOL_NAME);

function parseArgs(argv: string[]) {
  const out: { files: string[]; dir?: string; force: boolean; dry: boolean } = {
    files: [],
    force: false,
    dry: false,
  };
  const rest: string[] = [];
  for (const a of argv) {
    if (a === "--force") out.force = true;
    else if (a === "--dry-run") out.dry = true;
    else if (a.startsWith("--dir=")) out.dir = a.slice("--dir=".length).trim();
    else if (a === "--") continue;
    else if (a.startsWith("--")) continue;
    else rest.push(a);
  }
  out.files = rest.filter(Boolean);
  return out;
}

function listImagesInDir(dir: string): string[] {
  const abs = path.isAbsolute(dir) ? dir : path.resolve(process.cwd(), dir);
  if (!fs.existsSync(abs)) return [];
  const names = fs.readdirSync(abs);
  const allowed = /\.(png|jpe?g|webp)$/i;
  return names
    .filter((n) => allowed.test(n))
    .sort((a, b) => a.localeCompare(b))
    .map((n) => path.join(abs, n));
}

async function main() {
  const { files: argFiles, dir, force, dry } = parseArgs(process.argv.slice(2));
  const files = dir ? listImagesInDir(dir) : argFiles;

  if (files.length === 0) {
    console.error(
      "No image files. Pass paths after -- or use --dir=./exports/boitshepo-school-media (folder with .png/.jpg/.webp)."
    );
    process.exit(1);
  }

  for (const f of files) {
    if (!fs.existsSync(f)) {
      console.error("File not found:", f);
      process.exit(1);
    }
  }

  await connectDB();

  let school = await User.findOne({ username: "700910158" }).select("_id name username email avatar profileGalleryUrls");
  if (!school) school = await User.findOne({ email: /^boitsheposec@gmail\.com$/i }).select("_id name username email avatar profileGalleryUrls");
  if (!school)
    school = await User.findOne({ name: /^BOITSHEPO SECONDARY SCHOOL$/i }).select("_id name username email avatar profileGalleryUrls");

  if (!school) {
    console.error("School user not found (username 700910158, boitsheposec@gmail.com, or name BOITSHEPO SECONDARY SCHOOL).");
    process.exit(1);
  }

  const creatorId = school._id as mongoose.Types.ObjectId;
  console.log("Found school user:", school._id.toString(), school.name, school.username, school.email);

  const existingSeed = await TVPost.countDocuments({
    creatorId,
    status: "approved",
    type: "image",
    caption: CAPTION,
  });
  if (existingSeed > 0 && !force) {
    console.log(
      `Already ${existingSeed} seeded image post(s). Re-run with --force to copy files again and add duplicate posts, or delete those posts first.`
    );
    process.exit(0);
  }

  const uploadsTv = path.resolve(__dirname, "../uploads/tv");
  if (!dry && !fs.existsSync(uploadsTv)) fs.mkdirSync(uploadsTv, { recursive: true });

  const publicUrls: string[] = [];
  for (const src of files) {
    const ext = (path.extname(src) || ".png").toLowerCase();
    if (![".png", ".jpg", ".jpeg", ".webp"].includes(ext)) {
      console.warn("Skip (unsupported ext):", src);
      continue;
    }
    const destName = `tv-boitshepo-${Date.now()}-${crypto.randomBytes(4).toString("hex")}${ext}`;
    const destAbs = path.join(uploadsTv, destName);
    const publicUrl = `/uploads/tv/${destName}`;
    if (!dry) fs.copyFileSync(src, destAbs);
    console.log(dry ? "[dry-run] would copy" : "Copied", path.basename(src), "->", publicUrl);
    publicUrls.push(publicUrl);
  }

  if (publicUrls.length === 0) {
    console.error("No valid images after filtering.");
    process.exit(1);
  }

  const avatar = publicUrls[0];
  const gallery = publicUrls.slice(0, 12);

  if (!dry) {
    for (const url of publicUrls) {
      await TVPost.create({
        creatorId,
        type: "image",
        mediaUrls: [url],
        caption: CAPTION,
        hashtags: HASHTAGS,
        hasWatermark: false,
        status: "approved",
        likeCount: 0,
        commentCount: 0,
        shareCount: 0,
        viewCount: 0,
      });
    }

    school.avatar = avatar;
    school.profileGalleryUrls = gallery;
    await school.save();
  }

  console.log(dry ? "[dry-run] would set avatar:" : "Avatar:", avatar);
  console.log("Gallery URLs:", gallery.length);
  console.log("TVPost image count added:", publicUrls.length);
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
