/**
 * Rebrand classroom1 → Chisom Onyia @chisomonyia with local avatar + gallery photos.
 *
 *   npx ts-node-dev --transpile-only --exit-child scripts/setupChisomOnyiaAccount.ts
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

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const FROM_USERNAME = "bww336014483";
const FROM_NAME = "Classroom 1";
const NEW_USERNAME = "chisomonyia";
const NEW_NAME = "Chisom Onyia";
const NEW_PASSWORD = "11111111";

const MEDIA_DIR = path.resolve(__dirname, "../exports/chisom-onyia-media");
const ALT_MEDIA_DIR = path.resolve(
  __dirname,
  "../../../c-Users-Dell-cursor-projects-morongwa/assets"
);

const PHOTO_FILES = [
  { label: "avatar", file: "01-avatar.png", sourceSuffix: "660495093" },
  { label: "studio-chair", file: "02-studio-chair.png", sourceSuffix: "620080146" },
  { label: "green-dress", file: "03-green-dress.png", sourceSuffix: "650739690" },
  { label: "night-portrait", file: "04-night-portrait.png", sourceSuffix: "663240119" },
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
  const filename = `chisomonyia-${userId}-${label}-${Date.now()}${ext}`;
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
    hashtags: ["ChisomOnyia", "Qwertymates"],
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
    (await User.findOne({ username: "classroom1" })) ||
    (await User.findOne({ name: new RegExp(`^${FROM_NAME.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") }));
  if (!user) throw new Error(`User @${FROM_USERNAME} / @classroom1 / "${FROM_NAME}" not found`);

  const conflict = await User.findOne({ username: NEW_USERNAME, _id: { $ne: user._id } })
    .select("_id")
    .lean();
  if (conflict) throw new Error(`Username @${NEW_USERNAME} is already taken`);

  const uid = user._id.toString();
  console.log(`Found @${FROM_USERNAME} (${uid})`);

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

  user.name = NEW_NAME;
  user.username = NEW_USERNAME;
  user.passwordHash = await bcrypt.hash(NEW_PASSWORD, 10);
  user.avatar = avatarPath;
  user.profileGalleryUrls = galleryPaths;
  user.isSchoolAccount = false;
  user.active = true;
  user.suspended = false;
  user.locked = false;
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

  console.log("\nChisom Onyia account ready:");
  console.log(`  Name: ${NEW_NAME}`);
  console.log(`  Username: @${NEW_USERNAME}`);
  console.log(`  Password: ${NEW_PASSWORD}`);
  console.log(`  Avatar: ${avatarPath}`);
  console.log(`  Gallery: ${galleryPaths.length} photos`);
  console.log(`  TV posts created: ${tvPostsCreated}`);
  console.log(`  Profile: https://www.qwertymates.com/user/${uid}`);
  console.log("\nNext: node scripts/pushChisomOnyiaUploadsRemote.mjs");

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
