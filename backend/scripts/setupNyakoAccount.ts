/**
 * Rebrand nsohzscckubwntrtuvgtvp → Nyako @nyako with local avatar + gallery photos.
 *
 *   npx ts-node-dev --transpile-only --exit-child scripts/setupNyakoAccount.ts
 *   npx ts-node-dev --transpile-only --exit-child scripts/setupNyakoAccount.ts --dry-run
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

const DRY = process.argv.includes("--dry-run");
const FROM_USERNAME = "nsohzscckubwntrtuvgtvp";
const NEW_USERNAME = "nyako";
const NEW_NAME = "Nyako";
const NEW_PASSWORD = "11111111";

const MEDIA_DIR = path.resolve(__dirname, "../exports/nyako-media");
const ALT_MEDIA_DIR = path.resolve(
  __dirname,
  "../../../c-Users-Dell-cursor-projects-morongwa/assets"
);

const PHOTO_FILES = [
  { label: "avatar", file: "01-avatar.png", sourceSuffix: "nyako-da53ef8b-c1b3-4061-87b9-5976556d30d3.png" },
  { label: "store-selfie", file: "02-store-selfie.png", sourceSuffix: "713704351_122256115694137337_909610156573940340_n-4a10429e-3075-4563-90af-d6e92dfa8d1f.png" },
  { label: "uganda-jersey", file: "03-uganda-jersey.png", sourceSuffix: "715340471_122256534266137337_975710575776769746_n-9d6b7001-470d-46b3-8a07-c3ffb44946c6.png" },
  { label: "village-selfie", file: "04-village-selfie.png", sourceSuffix: "728558053_861275859928312_7948507962110139544_n-4f4774b9-a402-4866-9e6b-b03c5db72c5a.png" },
  { label: "bowl-mat", file: "05-bowl-mat.png", sourceSuffix: "725781635_1009163475173278_5314883973498436251_n-fb77c6be-b3ad-4c3a-8023-24e58c053943.png" },
  { label: "brick-building", file: "06-brick-building.png", sourceSuffix: "728568882_986675354128273_5981997460560330630_n-3304113b-c63a-4e45-807c-23398c82edce.png" },
] as const;

function resolveSourcePath(entry: (typeof PHOTO_FILES)[number]): string {
  const local = path.join(MEDIA_DIR, entry.file);
  if (fs.existsSync(local)) return local;
  if (fs.existsSync(ALT_MEDIA_DIR)) {
    const alt = fs
      .readdirSync(ALT_MEDIA_DIR)
      .find((name) => name.includes(entry.sourceSuffix) || name.includes(entry.label));
    if (alt) return path.join(ALT_MEDIA_DIR, alt);
  }
  throw new Error(`Photo not found: ${entry.file} (also checked ${ALT_MEDIA_DIR})`);
}

function copyToProfiles(source: string, userId: string, label: string): string {
  const profilesDir = path.join(path.resolve(__dirname, "../uploads"), "profiles");
  fs.mkdirSync(profilesDir, { recursive: true });
  const ext = path.extname(source).toLowerCase() || ".png";
  const filename = `nyako-${userId}-${label}-${Date.now()}${ext}`;
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
    hashtags: ["Nyako", "Qwertymates"],
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

  const user = await User.findOne({ username: FROM_USERNAME });
  if (!user) throw new Error(`User @${FROM_USERNAME} not found`);

  const conflict = await User.findOne({ username: NEW_USERNAME, _id: { $ne: user._id } })
    .select("_id")
    .lean();
  if (conflict) throw new Error(`Username @${NEW_USERNAME} is already taken`);

  const uid = user._id.toString();
  console.log(`Found @${FROM_USERNAME} (${uid})`);

  if (DRY) {
    console.log(`DRY RUN — would rename to @${NEW_USERNAME}, set password, upload ${PHOTO_FILES.length} photos`);
    await mongoose.disconnect();
    return;
  }

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
  const passwordHash = await bcrypt.hash(NEW_PASSWORD, 10);

  user.name = NEW_NAME;
  user.username = NEW_USERNAME;
  user.passwordHash = passwordHash;
  user.avatar = avatarPath;
  user.profileGalleryUrls = galleryPaths;
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

  console.log("\nNyako account ready:");
  console.log(`  Name: ${NEW_NAME}`);
  console.log(`  Username: @${NEW_USERNAME}`);
  console.log(`  Password: ${NEW_PASSWORD}`);
  console.log(`  Avatar: ${avatarPath}`);
  console.log(`  Gallery: ${galleryPaths.length} photos`);
  console.log(`  TV posts created: ${tvPostsCreated}`);
  console.log(`  Profile: https://www.qwertymates.com/user/${uid}`);
  console.log("\nNext: node scripts/pushNyakoUploadsRemote.mjs");

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
