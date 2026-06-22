/**
 * Replace wrong Golf Channel gallery slots (putting/golfer) and dedupe TV posts.
 *
 *   npx ts-node-dev --transpile-only --exit-child scripts/repairGolfChannelGallery.ts
 *   npx ts-node-dev --transpile-only --exit-child scripts/repairGolfChannelGallery.ts --dry-run
 */
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import axios from "axios";
import mongoose from "mongoose";
import User from "../src/data/models/User";
import TVPost from "../src/data/models/TVPost";
import { bumpStatusStripCache } from "../src/services/statusStripPolicy";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const DRY = process.argv.includes("--dry-run");
const USERNAME = "golfchannel";

/** Verified golf photos (Unsplash IDs checked — old putting/golfer IDs served Groot + soccer). */
const REPLACEMENTS = [
  {
    label: "putting-green",
    url: "https://images.unsplash.com/photo-1592919505780-303950717480?w=1200&q=85&auto=format&fit=crop",
  },
  {
    label: "golfer-swing",
    url: "https://images.unsplash.com/photo-1535131749006-b7f58c99034b?w=1200&q=85&auto=format&fit=crop",
  },
] as const;

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
    headers: { "User-Agent": "Qwertymates/1.0 (golf-channel-repair)" },
  });

  const filename = `golfchannel-${userId}-${label}-${Date.now()}.jpg`;
  const abs = path.join(profilesDir, filename);
  fs.writeFileSync(abs, Buffer.from(res.data));
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
    caption: "Golf Channel — golf highlights",
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

  const user = await User.findOne({ username: USERNAME });
  if (!user) throw new Error(`@${USERNAME} not found`);

  const uid = user._id.toString();
  const gallery = Array.isArray(user.profileGalleryUrls)
    ? user.profileGalleryUrls.map((u) => String(u || "").trim()).filter(Boolean)
    : [];

  if (gallery.length < 5) {
    throw new Error(`Expected 5 gallery URLs, found ${gallery.length}`);
  }

  const keep = gallery.slice(0, 3);
  const removeUrls = gallery.slice(3, 5);

  console.log(`@${USERNAME} (${uid})`);
  console.log("Keeping first 3 gallery photos");
  console.log("Removing wrong slots:", removeUrls);

  if (DRY) {
    console.log("DRY RUN — would download 2 golf replacements, update gallery, rebuild TV posts");
    await mongoose.disconnect();
    return;
  }

  const newPaths: string[] = [];
  for (const img of REPLACEMENTS) {
    const rel = await downloadToProfiles(img.url, uid, img.label);
    newPaths.push(rel);
    console.log(`Downloaded ${img.label} -> ${rel}`);
  }

  const nextGallery = [...keep, ...newPaths];
  user.profileGalleryUrls = nextGallery;
  await user.save();

  const removedPosts = await TVPost.deleteMany({
    creatorId: user._id,
    status: "approved",
    type: { $in: ["image", "carousel"] },
    $or: [
      { mediaUrls: { $in: removeUrls } },
      { caption: /updated profile picture/i },
    ],
  });
  console.log(`Deleted ${removedPosts.deletedCount} old / duplicate TV post(s)`);

  const remaining = await TVPost.find({
    creatorId: user._id,
    status: "approved",
    type: { $in: ["image", "carousel"] },
  })
    .select("mediaUrls")
    .lean();

  const seenMedia = new Set<string>();
  let deduped = 0;
  for (const post of remaining) {
    const url = Array.isArray(post.mediaUrls) ? String(post.mediaUrls[0] || "").trim() : "";
    if (!url) continue;
    if (seenMedia.has(url)) {
      await TVPost.deleteOne({ _id: post._id });
      deduped += 1;
      continue;
    }
    seenMedia.add(url);
  }
  if (deduped) console.log(`Removed ${deduped} duplicate TV post(s) with same image`);

  let created = 0;
  for (const mediaUrl of nextGallery) {
    if (await ensureTvImagePost(user._id as mongoose.Types.ObjectId, mediaUrl)) created += 1;
  }

  bumpStatusStripCache();

  console.log("\nRepair complete:");
  console.log(`  Gallery: ${nextGallery.length} photos (all golf)`);
  console.log(`  TV posts created: ${created}`);
  console.log("\nNext: node scripts/pushGolfChannelUploadsRemote.mjs");

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
