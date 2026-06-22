/**
 * Rebrand sdfsdfsdfsd → Golf Channel @golfchannel with avatar + gallery photos.
 *
 *   npx ts-node-dev --transpile-only --exit-child scripts/setupGolfChannelAccount.ts
 *   npx ts-node-dev --transpile-only --exit-child scripts/setupGolfChannelAccount.ts --dry-run
 */

import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import axios from "axios";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "../src/data/models/User";
import TVPost from "../src/data/models/TVPost";
import { publishProfileAvatarFeedUpdate } from "../src/services/profileAvatarFeed";
import { bumpStatusStripCache } from "../src/services/statusStripPolicy";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const DRY = process.argv.includes("--dry-run");
const FROM_USERNAME = "sdfsdfsdfsd";
const NEW_USERNAME = "golfchannel";
const NEW_NAME = "Golf Channel";
const NEW_PASSWORD = "11111111";

const GOLF_IMAGES = [
  {
    label: "course-trees",
    url: "https://images.unsplash.com/photo-1606443192517-919653213206?w=1200&q=85&auto=format&fit=crop",
  },
  {
    label: "from-green",
    url: "https://images.unsplash.com/photo-1709525616662-8d9f9a995ceb?w=1200&q=85&auto=format&fit=crop",
  },
  {
    label: "swing",
    url: "https://images.unsplash.com/photo-1593111774240-d529f12cf4bb?w=1200&q=85&auto=format&fit=crop",
  },
  {
    label: "putting",
    url: "https://images.unsplash.com/photo-1592919505780-303950717480?w=1200&q=85&auto=format&fit=crop",
  },
  {
    label: "golfer",
    url: "https://images.unsplash.com/photo-1535131749006-b7f58c99034b?w=1200&q=85&auto=format&fit=crop",
  },
];

async function downloadToProfiles(
  imageUrl: string,
  userId: string,
  label: string
): Promise<string> {
  const uploadsRoot = path.resolve(__dirname, "../uploads");
  const profilesDir = path.join(uploadsRoot, "profiles");
  fs.mkdirSync(profilesDir, { recursive: true });

  const res = await axios.get(imageUrl, {
    responseType: "arraybuffer",
    timeout: 45000,
    maxContentLength: 12 * 1024 * 1024,
    headers: { "User-Agent": "Qwertymates/1.0 (golf-channel-setup)" },
  });

  const filename = `golfchannel-${userId}-${label}-${Date.now()}.jpg`;
  const abs = path.join(profilesDir, filename);
  fs.writeFileSync(abs, Buffer.from(res.data));
  return `/uploads/profiles/${filename}`;
}

async function ensureTvImagePost(
  userId: mongoose.Types.ObjectId,
  mediaUrl: string,
  caption: string
): Promise<boolean> {
  const exists = await TVPost.findOne({ creatorId: userId, mediaUrls: mediaUrl }).select("_id").lean();
  if (exists) return false;
  await TVPost.create({
    creatorId: userId,
    type: "image",
    mediaUrls: [mediaUrl],
    caption,
    hashtags: ["GolfChannel", "Golf", "Qwertymates"],
    genre: "sports",
    hasWatermark: true,
    status: "approved",
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
  if (!user) {
    throw new Error(`User @${FROM_USERNAME} not found`);
  }

  const uid = user._id.toString();
  const conflict = await User.findOne({
    username: NEW_USERNAME,
    _id: { $ne: user._id },
  })
    .select("_id username")
    .lean();
  if (conflict) {
    throw new Error(`Username @${NEW_USERNAME} is already taken by ${conflict._id}`);
  }

  console.log(`Found @${FROM_USERNAME} (${uid})`);
  if (DRY) {
    console.log(`DRY RUN — would rename to @${NEW_USERNAME}, set password, avatar, and ${GOLF_IMAGES.length} gallery photos`);
    await mongoose.disconnect();
    return;
  }

  const downloaded: string[] = [];
  for (const img of GOLF_IMAGES) {
    const rel = await downloadToProfiles(img.url, uid, img.label);
    downloaded.push(rel);
    console.log(`Downloaded ${img.label} -> ${rel}`);
  }

  const avatarPath = downloaded[0];
  const galleryPaths = downloaded.slice(0, 5);
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
    const created = await ensureTvImagePost(
      user._id as mongoose.Types.ObjectId,
      mediaUrl,
      `${NEW_NAME} — golf highlights`
    );
    if (created) tvPostsCreated += 1;
  }

  const feed = await publishProfileAvatarFeedUpdate({
    userId: user._id,
    avatarPath,
    previousAvatar: previousAvatar || undefined,
  });

  if (tvPostsCreated > 0 || !feed.skipped) {
    bumpStatusStripCache();
  }

  console.log("\nGolf Channel account ready:");
  console.log(`  Name: ${NEW_NAME}`);
  console.log(`  Username: @${NEW_USERNAME}`);
  console.log(`  Password: ${NEW_PASSWORD}`);
  console.log(`  Avatar: ${avatarPath}`);
  console.log(`  Gallery: ${galleryPaths.length} photos`);
  console.log(`  TV posts created: ${tvPostsCreated}`);
  console.log(`  Avatar status: ${feed.skipped ? "skipped" : `post ${feed.postId}`}`);
  console.log("\nNext: upload images to production:");
  console.log("  node scripts/pushGolfChannelUploadsRemote.mjs");

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
