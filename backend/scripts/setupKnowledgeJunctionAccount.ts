/**
 * Rebrand joe → Knowledge Junction @knowledgejunction with knowledge-themed avatar.
 *
 *   npx ts-node-dev --transpile-only --exit-child scripts/setupKnowledgeJunctionAccount.ts
 */

import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import axios from "axios";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "../src/data/models/User";
import { publishProfileAvatarFeedUpdate } from "../src/services/profileAvatarFeed";
import { bumpStatusStripCache } from "../src/services/statusStripPolicy";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const FROM_USERNAME = "joe";
const NEW_USERNAME = "knowledgejunction";
const NEW_NAME = "Knowledge Junction";
const NEW_PASSWORD = "11111111";

const AVATAR_URL =
  "https://images.unsplash.com/photo-1521587760476-6c12a4b040da?w=900&q=85&auto=format&fit=crop";

async function downloadAvatar(userId: string): Promise<string> {
  const profilesDir = path.join(path.resolve(__dirname, "../uploads"), "profiles");
  fs.mkdirSync(profilesDir, { recursive: true });

  const res = await axios.get(AVATAR_URL, {
    responseType: "arraybuffer",
    timeout: 45000,
    maxContentLength: 12 * 1024 * 1024,
    headers: { "User-Agent": "Qwertymates/1.0 (knowledge-junction-setup)" },
  });

  const filename = `knowledgejunction-${userId}-avatar-${Date.now()}.jpg`;
  fs.writeFileSync(path.join(profilesDir, filename), Buffer.from(res.data));
  return `/uploads/profiles/${filename}`;
}

async function main() {
  const mongoUri = String(process.env.MONGO_URI || "").trim();
  if (!mongoUri) throw new Error("MONGO_URI missing in backend/.env");

  await mongoose.connect(mongoUri);

  const user =
    (await User.findOne({ username: FROM_USERNAME })) ||
    (await User.findOne({ username: FROM_USERNAME.toLowerCase() })) ||
    (await User.findOne({
      name: /^joe$/i,
      $or: [{ username: { $exists: false } }, { username: null }, { username: "" }],
    }));

  if (!user) throw new Error(`User @${FROM_USERNAME} not found`);

  const conflict = await User.findOne({
    username: NEW_USERNAME,
    _id: { $ne: user._id },
  })
    .select("_id")
    .lean();
  if (conflict) throw new Error(`Username @${NEW_USERNAME} is already taken`);

  const uid = user._id.toString();
  console.log(`Found @${FROM_USERNAME} (${uid})`);

  const avatarPath = await downloadAvatar(uid);
  console.log(`Downloaded avatar -> ${avatarPath}`);

  const previousAvatar = String(user.avatar || "").trim();
  user.name = NEW_NAME;
  user.username = NEW_USERNAME;
  user.passwordHash = await bcrypt.hash(NEW_PASSWORD, 10);
  user.avatar = avatarPath;
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

  console.log("\nKnowledge Junction account ready:");
  console.log(`  Name: ${NEW_NAME}`);
  console.log(`  Username: @${NEW_USERNAME}`);
  console.log(`  Password: ${NEW_PASSWORD}`);
  console.log(`  Avatar: ${avatarPath}`);
  console.log(`  Profile: https://www.qwertymates.com/user/${uid}`);
  console.log("\nNext: node scripts/pushKnowledgeJunctionUploadsRemote.mjs");

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
