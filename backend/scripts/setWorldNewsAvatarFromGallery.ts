/**
 * Set worldnews profile avatar from a gallery/TV image (downloads external URLs to /uploads/).
 *
 *   npx ts-node-dev --transpile-only --exit-child scripts/setWorldNewsAvatarFromGallery.ts
 */

import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import axios from "axios";
import mongoose from "mongoose";
import User from "../src/data/models/User";
import TVPost from "../src/data/models/TVPost";
import { publishProfileAvatarFeedUpdate } from "../src/services/profileAvatarFeed";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const USERNAME = String(process.env.AI_NEWS_CREATOR_USERNAME || "worldnews").trim().toLowerCase();

function pickImageUrl(mediaUrls: string[] | undefined): string | null {
  const urls = (mediaUrls || []).filter((u) => typeof u === "string" && /^https?:\/\//i.test(u.trim()));
  if (!urls.length) return null;
  const league = urls.find((u) => /\/leagues\//i.test(u));
  return league || urls[0];
}

async function downloadAvatarToUploads(imageUrl: string, userId: string): Promise<string> {
  const uploadsRoot = path.resolve(__dirname, "../uploads");
  const profilesDir = path.join(uploadsRoot, "profiles");
  fs.mkdirSync(profilesDir, { recursive: true });

  const ext = imageUrl.toLowerCase().includes(".png") ? ".png" : ".jpg";
  const filename = `worldnews-${userId}-avatar-${Date.now()}${ext}`;
  const abs = path.join(profilesDir, filename);

  const res = await axios.get(imageUrl, {
    responseType: "arraybuffer",
    timeout: 30000,
    maxContentLength: 8 * 1024 * 1024,
    headers: { "User-Agent": "Qwertymates/1.0 (profile-avatar-sync)" },
  });
  fs.writeFileSync(abs, Buffer.from(res.data));
  return `/uploads/profiles/${filename}`;
}

async function main() {
  const mongoUri = String(process.env.MONGO_URI || "").trim();
  if (!mongoUri) throw new Error("MONGO_URI missing");
  await mongoose.connect(mongoUri);

  const user = await User.findOne({ username: USERNAME }).select("_id name username avatar profileGalleryUrls").lean();
  if (!user) throw new Error(`User not found: @${USERNAME}`);

  const uid = String(user._id);
  const candidates: string[] = [];

  for (const u of user.profileGalleryUrls || []) {
    if (typeof u === "string" && u.trim()) candidates.push(u.trim());
  }

  const posts = await TVPost.find({
    creatorId: user._id,
    status: "approved",
    type: { $in: ["image", "carousel"] },
    "mediaUrls.0": { $exists: true, $ne: "" },
  })
    .select("mediaUrls caption")
    .sort({ createdAt: -1 })
    .limit(80)
    .lean();

  for (const p of posts) {
    const picked = pickImageUrl(p.mediaUrls as string[]);
    if (picked) candidates.push(picked);
  }

  const unique = [...new Set(candidates)];
  if (!unique.length) throw new Error(`No gallery/TV images found for @${USERNAME}`);

  let avatarPath = unique.find((u) => u.startsWith("/uploads/")) || "";
  if (!avatarPath) {
    const sourceUrl = unique[0];
    avatarPath = await downloadAvatarToUploads(sourceUrl, uid);
    console.log(`Downloaded ${sourceUrl} -> ${avatarPath}`);
  }

  const previousAvatar = String(user.avatar || "").trim();
  await User.updateOne({ _id: user._id }, { $set: { avatar: avatarPath } });

  const feed = await publishProfileAvatarFeedUpdate({
    userId: user._id,
    avatarPath,
    previousAvatar: previousAvatar || undefined,
  });

  console.log(`@${USERNAME} avatar -> ${avatarPath}`);
  console.log(`Status update: ${feed.skipped ? "skipped" : `post ${feed.postId}`}`);

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
