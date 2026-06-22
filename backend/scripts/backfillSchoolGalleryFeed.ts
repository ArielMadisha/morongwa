/**
 * Create TV posts + avatar status for school(s) that already have gallery URLs but empty feed.
 *
 *   npx ts-node-dev --transpile-only --exit-child scripts/backfillSchoolGalleryFeed.ts
 *   npx ts-node-dev --transpile-only --exit-child scripts/backfillSchoolGalleryFeed.ts --user-id=<mongoId>
 *   npx ts-node-dev --transpile-only --exit-child scripts/backfillSchoolGalleryFeed.ts --name="BETHESDA PRIMARY SCHOOL"
 */

import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";
import User from "../src/data/models/User";
import { backfillSchoolGalleryFeedForUser } from "../src/services/schoolGalleryFeed";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const args = process.argv.slice(2);

function argValue(prefix: string): string | undefined {
  const hit = args.find((a) => a.startsWith(prefix));
  if (!hit) return undefined;
  const rest = hit.slice(prefix.length).trim();
  if (rest) return rest;
  const i = args.indexOf(hit);
  const next = args[i + 1];
  return next && !next.startsWith("--") ? next : undefined;
}

async function main() {
  const mongoUri = String(process.env.MONGO_URI || "").trim();
  if (!mongoUri) throw new Error("MONGO_URI missing");
  await mongoose.connect(mongoUri);

  const userId = (argValue("--user-id=") || "").trim();
  const name = (argValue("--name=") || "").trim();

  let users: { _id: mongoose.Types.ObjectId; name?: string }[] = [];
  if (userId) {
    const u = await User.findById(userId).select("_id name").lean();
    if (!u) throw new Error(`User not found: ${userId}`);
    users = [u as { _id: mongoose.Types.ObjectId; name?: string }];
  } else if (name) {
    const list = await User.find({
      name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
      profileGalleryUrls: { $exists: true, $ne: [] },
    })
      .select("_id name")
      .lean();
    users = list as { _id: mongoose.Types.ObjectId; name?: string }[];
  } else {
    const list = await User.find({
      profileGalleryUrls: /\/uploads\/school-gallery\//,
    })
      .select("_id name")
      .limit(500)
      .lean();
    users = list as { _id: mongoose.Types.ObjectId; name?: string }[];
  }

  let totalPosts = 0;
  for (const u of users) {
    const r = await backfillSchoolGalleryFeedForUser(u._id);
    console.log(`${u.name} (${u._id}): tvPosts=${r.tvPostsCreated}, avatarFeed=${!!r.avatarFeed}`);
    totalPosts += r.tvPostsCreated;
  }
  console.log(`Done. ${users.length} school(s), ${totalPosts} TV post(s) created.`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
