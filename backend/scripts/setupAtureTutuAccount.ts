/**
 * Rebrand bdqbrsvlieiixvrppqbuj → Ature Tutu @aturetutu with photos + public contact.
 *
 *   npx ts-node-dev --transpile-only --exit-child scripts/setupAtureTutuAccount.ts
 */

import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "../src/data/models/User";
import TVPost from "../src/data/models/TVPost";
import { publishProfileAvatarFeedUpdate } from "../src/services/profileAvatarFeed";
import { bumpStatusStripCache } from "../src/services/statusStripPolicy";
import { computePhoneLocale } from "../src/utils/phoneCountryCurrency";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const FROM_USERNAME = "bdqbrsvlieiixvrppqbuj";
const NEW_USERNAME = "aturetutu";
const NEW_NAME = "Ature Tutu";
const NEW_PASSWORD = "11111111";
const PUBLIC_EMAIL = "aturemargaret768@gmail.com";
const PUBLIC_PHONE = "256777273483";

const MEDIA_DIR = path.resolve(__dirname, "../exports/ature-tutu-media");
const ALT_MEDIA_DIR = path.resolve(
  __dirname,
  "../../../c-Users-Dell-cursor-projects-morongwa/assets"
);

const PHOTO_FILES = [
  { label: "avatar", file: "01-avatar.png", sourceSuffix: "636166383_122101182885269187_7612838185732522699_n-8115b707" },
  { label: "portrait-hut", file: "02-portrait-hut.png", sourceSuffix: "634678479" },
  { label: "cooking", file: "03-cooking.png", sourceSuffix: "634969507" },
  { label: "group-variant", file: "04-group-variant.png", sourceSuffix: "636166383_122101182885269187_7612838185732522699_n__1_" },
  { label: "group-women", file: "05-group-women.png", sourceSuffix: "634974194" },
] as const;

function resolveSourcePath(entry: (typeof PHOTO_FILES)[number]): string {
  const local = path.join(MEDIA_DIR, entry.file);
  if (fs.existsSync(local)) return local;
  if (fs.existsSync(ALT_MEDIA_DIR)) {
    const alt = fs.readdirSync(ALT_MEDIA_DIR).find((name) => name.includes(entry.sourceSuffix));
    if (alt) return path.join(ALT_MEDIA_DIR, alt);
  }
  throw new Error(`Photo not found: ${entry.file}`);
}

function copyToProfiles(source: string, userId: string, label: string): string {
  const profilesDir = path.join(path.resolve(__dirname, "../uploads"), "profiles");
  fs.mkdirSync(profilesDir, { recursive: true });
  const ext = path.extname(source).toLowerCase() || ".png";
  const filename = `aturetutu-${userId}-${label}-${Date.now()}${ext}`;
  fs.copyFileSync(source, path.join(profilesDir, filename));
  return `/uploads/profiles/${filename}`;
}

async function ensureTvImagePost(
  userId: mongoose.Types.ObjectId,
  mediaUrl: string
): Promise<boolean> {
  const exists = await TVPost.findOne({ creatorId: userId, mediaUrls: mediaUrl }).select("_id").lean();
  if (exists) return false;
  await TVPost.create({
    creatorId: userId,
    type: "image",
    mediaUrls: [mediaUrl],
    caption: `${NEW_NAME} — profile photo`,
    hashtags: ["AtureTutu", "Qwertymates"],
    status: "approved",
    hasWatermark: true,
    likeCount: 0,
    commentCount: 0,
    shareCount: 0,
    viewCount: 0,
  });
  return true;
}

async function main() {
  const mongoUri = String(process.env.MONGO_URI || "").trim();
  if (!mongoUri) throw new Error("MONGO_URI missing in backend/.env");

  await mongoose.connect(mongoUri);

  const user =
    (await User.findOne({ username: FROM_USERNAME })) ||
    (await User.findOne({ username: NEW_USERNAME })) ||
    (await User.findOne({ email: PUBLIC_EMAIL.toLowerCase() }));
  if (!user) throw new Error(`User @${FROM_USERNAME} / @${NEW_USERNAME} not found`);

  const conflict = await User.findOne({ username: NEW_USERNAME, _id: { $ne: user._id } })
    .select("_id")
    .lean();
  if (conflict) throw new Error(`Username @${NEW_USERNAME} is already taken`);

  const emailTaken = await User.findOne({
    email: PUBLIC_EMAIL.toLowerCase(),
    _id: { $ne: user._id },
  })
    .select("_id")
    .lean();
  if (emailTaken) throw new Error(`Email ${PUBLIC_EMAIL} already used by another account`);

  const uid = user._id.toString();
  console.log(`Found user (${uid}) @${user.username || FROM_USERNAME}`);

  const uploaded: string[] = [];
  for (const entry of PHOTO_FILES) {
    const source = resolveSourcePath(entry);
    const rel = copyToProfiles(source, uid, entry.label);
    uploaded.push(rel);
    console.log(`Copied ${entry.label} -> ${rel}`);
  }

  const avatarPath = uploaded[0];
  const galleryPaths = uploaded.slice(1);
  const previousAvatar = String(user.avatar || "").trim();
  const phoneLocale = computePhoneLocale(PUBLIC_PHONE);

  user.name = NEW_NAME;
  user.username = NEW_USERNAME;
  user.passwordHash = await bcrypt.hash(NEW_PASSWORD, 10);
  user.email = PUBLIC_EMAIL.toLowerCase();
  user.phone = PUBLIC_PHONE;
  user.showPhonePublicly = true;
  user.schoolPublicEmail = PUBLIC_EMAIL.toLowerCase();
  user.avatar = avatarPath;
  user.profileGalleryUrls = galleryPaths;
  user.isSchoolAccount = false;
  user.active = true;
  user.suspended = false;
  user.locked = false;
  if (phoneLocale.countryCode) {
    user.countryCode = phoneLocale.countryCode;
    user.preferredCurrency = phoneLocale.preferredCurrency;
  }
  await user.save();

  let tvPostsCreated = 0;
  for (const mediaUrl of galleryPaths) {
    if (await ensureTvImagePost(user._id as mongoose.Types.ObjectId, mediaUrl)) tvPostsCreated += 1;
  }

  const feed = await publishProfileAvatarFeedUpdate({
    userId: user._id,
    avatarPath,
    previousAvatar: previousAvatar || undefined,
  });
  if (tvPostsCreated > 0 || !feed.skipped) bumpStatusStripCache();

  console.log("\nAture Tutu account ready:");
  console.log(`  Name: ${NEW_NAME}`);
  console.log(`  Username: @${NEW_USERNAME}`);
  console.log(`  Password: ${NEW_PASSWORD}`);
  console.log(`  Email (public): ${PUBLIC_EMAIL}`);
  console.log(`  Phone (public): +256 777 273483`);
  console.log(`  Avatar: ${avatarPath}`);
  console.log(`  Gallery: ${galleryPaths.length} photos`);
  console.log(`  Profile: https://www.qwertymates.com/user/${uid}`);
  console.log("\nNext: node scripts/pushAtureTutuUploadsRemote.mjs");

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
