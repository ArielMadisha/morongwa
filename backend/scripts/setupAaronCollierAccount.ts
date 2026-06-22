/**
 * Create or refresh Aaron Collier @aaroncollier with local profile photo.
 *
 *   npx ts-node-dev --transpile-only --exit-child scripts/setupAaronCollierAccount.ts
 */

import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "../src/data/models/User";
import Wallet from "../src/data/models/Wallet";
import { publishProfileAvatarFeedUpdate } from "../src/services/profileAvatarFeed";
import { bumpStatusStripCache } from "../src/services/statusStripPolicy";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const USERNAME = "aaroncollier";
const DISPLAY_NAME = "Aaron Collier";
const EMAIL = "aaroncollier@qwertymates.com";
const PASSWORD = "11111111";

const SOURCE_IMAGE_CANDIDATES = [
  path.resolve(__dirname, "../exports/aaron-collier-avatar-source.png"),
  path.resolve(
    __dirname,
    "../../../c-Users-Dell-cursor-projects-morongwa/assets/c__Users_Dell_AppData_Roaming_Cursor_User_workspaceStorage_8cbbb33495ce43c096bb0498540fe740_images_image-e173abae-6cde-4c19-8914-e410c3ce2d45.png"
  ),
];

function resolveSourceImage(): string {
  for (const p of SOURCE_IMAGE_CANDIDATES) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error(`Profile image not found. Checked:\n${SOURCE_IMAGE_CANDIDATES.join("\n")}`);
}

function copyAvatarToUploads(userId: string): string {
  const source = resolveSourceImage();
  const profilesDir = path.join(path.resolve(__dirname, "../uploads"), "profiles");
  fs.mkdirSync(profilesDir, { recursive: true });
  const ext = path.extname(source).toLowerCase() || ".png";
  const filename = `aaroncollier-${userId}-avatar-${Date.now()}${ext}`;
  fs.copyFileSync(source, path.join(profilesDir, filename));
  return `/uploads/profiles/${filename}`;
}

async function main() {
  const mongoUri = String(process.env.MONGO_URI || "").trim();
  if (!mongoUri) throw new Error("MONGO_URI missing in backend/.env");

  await mongoose.connect(mongoUri);

  let user =
    (await User.findOne({ username: USERNAME })) ||
    (await User.findOne({ email: EMAIL.toLowerCase() })) ||
    (await User.findOne({ name: /^Aaron Collier$/i }));

  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  if (!user) {
    const emailTaken = await User.findOne({ email: EMAIL.toLowerCase() }).select("_id").lean();
    if (emailTaken) throw new Error(`Email ${EMAIL} already used by another account`);

    user = await User.create({
      name: DISPLAY_NAME,
      username: USERNAME,
      email: EMAIL.toLowerCase(),
      passwordHash,
      role: ["client"],
      isVerified: true,
      active: true,
      suspended: false,
      locked: false,
    });
    console.log(`Created new user ${user._id}`);
  } else {
    console.log(`Updating existing user ${user._id} (@${user.username || "no username"})`);
    user.name = DISPLAY_NAME;
    user.username = USERNAME;
    user.email = EMAIL.toLowerCase();
    user.passwordHash = passwordHash;
    user.active = true;
    user.suspended = false;
    user.locked = false;
    user.isVerified = true;
  }

  const uid = user._id.toString();
  const previousAvatar = String(user.avatar || "").trim();
  const avatarPath = copyAvatarToUploads(uid);
  user.avatar = avatarPath;
  await user.save();

  const wallet = await Wallet.findOne({ user: user._id });
  if (!wallet) {
    await Wallet.create({ user: user._id });
    console.log("Created wallet");
  }

  const feed = await publishProfileAvatarFeedUpdate({
    userId: user._id,
    avatarPath,
    previousAvatar: previousAvatar || undefined,
  });
  if (!feed.skipped) bumpStatusStripCache();

  console.log("\nAaron Collier account ready:");
  console.log(`  Name: ${DISPLAY_NAME}`);
  console.log(`  Username: @${USERNAME}`);
  console.log(`  Email: ${EMAIL}`);
  console.log(`  Password: ${PASSWORD}`);
  console.log(`  Avatar: ${avatarPath}`);
  console.log(`  Profile: https://www.qwertymates.com/user/${uid}`);
  console.log("\nNext: node scripts/pushAaronCollierUploadsRemote.mjs");

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
