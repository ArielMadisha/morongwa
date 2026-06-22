/**
 * Rebrand paerdilinmufpkwl → AfrikaDestinations @afrikadestinations with travel brand avatar.
 *
 *   npx ts-node-dev --transpile-only --exit-child scripts/setupAfrikaDestinationsAccount.ts
 */

import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "../src/data/models/User";
import { publishProfileAvatarFeedUpdate } from "../src/services/profileAvatarFeed";
import { bumpStatusStripCache } from "../src/services/statusStripPolicy";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const FROM_USERNAME = "paerdilinmufpkwl";
const NEW_USERNAME = "afrikadestinations";
const NEW_NAME = "AfrikaDestinations";
const NEW_PASSWORD = "11111111";

const MEDIA_DIR = path.resolve(__dirname, "../exports/afrikadestinations-media");
const ALT_MEDIA_DIR = path.resolve(
  __dirname,
  "../../../c-Users-Dell-cursor-projects-morongwa/assets"
);
const SOURCE_SUFFIX = "668473632_122356723766064117_3760246951803666590_n-4e1ffbf6-9d1a-4e59-bf4d-3c923b442a46.png";

function resolveSourcePath(): string {
  const local = path.join(MEDIA_DIR, "avatar.png");
  if (fs.existsSync(local)) return local;
  if (fs.existsSync(ALT_MEDIA_DIR)) {
    const alt = fs.readdirSync(ALT_MEDIA_DIR).find((name) => name.includes(SOURCE_SUFFIX));
    if (alt) return path.join(ALT_MEDIA_DIR, alt);
  }
  throw new Error(`Avatar image not found (checked ${MEDIA_DIR} and ${ALT_MEDIA_DIR})`);
}

function copyToProfiles(source: string, userId: string): string {
  const profilesDir = path.join(path.resolve(__dirname, "../uploads"), "profiles");
  fs.mkdirSync(profilesDir, { recursive: true });
  const ext = path.extname(source).toLowerCase() || ".png";
  const filename = `afrikadestinations-${userId}-avatar-${Date.now()}${ext}`;
  fs.copyFileSync(source, path.join(profilesDir, filename));
  return `/uploads/profiles/${filename}`;
}

async function main() {
  const mongoUri = String(process.env.MONGO_URI || "").trim();
  if (!mongoUri) throw new Error("MONGO_URI missing in backend/.env");

  await mongoose.connect(mongoUri);

  const user = await User.findOne({ username: FROM_USERNAME });
  if (!user) throw new Error(`User @${FROM_USERNAME} not found`);

  const conflict = await User.findOne({ username: NEW_USERNAME, _id: { $ne: user._id } })
    .select("_id")
    .lean();
  if (conflict) throw new Error(`Username @${NEW_USERNAME} is already taken`);

  const uid = user._id.toString();
  console.log(`Found @${FROM_USERNAME} (${uid})`);

  const source = resolveSourcePath();
  const avatarPath = copyToProfiles(source, uid);
  console.log(`Copied avatar -> ${avatarPath}`);

  const previousAvatar = String(user.avatar || "").trim();
  user.name = NEW_NAME;
  user.username = NEW_USERNAME;
  user.passwordHash = await bcrypt.hash(NEW_PASSWORD, 10);
  user.avatar = avatarPath;
  user.profileGalleryUrls = [avatarPath];
  user.active = true;
  user.suspended = false;
  user.locked = false;
  await user.save();

  const feed = await publishProfileAvatarFeedUpdate({
    userId: user._id,
    avatarPath,
    previousAvatar: previousAvatar || undefined,
  });
  if (!feed.skipped) bumpStatusStripCache();

  console.log("\nAfrikaDestinations account ready:");
  console.log(`  Name: ${NEW_NAME}`);
  console.log(`  Username: @${NEW_USERNAME}`);
  console.log(`  Password: ${NEW_PASSWORD}`);
  console.log(`  Avatar: ${avatarPath}`);
  console.log(`  Profile: https://www.qwertymates.com/user/${uid}`);
  console.log("\nNext: node scripts/pushAfrikaDestinationsUploadsRemote.mjs");

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err?.message || err);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
