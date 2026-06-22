/**
 * Recent @worldnews TV posts + scheduler-related env (no secrets).
 */
import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";
import User from "../src/data/models/User";
import TVPost from "../src/data/models/TVPost";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function main() {
  await mongoose.connect(process.env.MONGO_URI!);
  const u = await User.findOne({ username: "worldnews" }).select("_id username createdAt").lean();
  if (!u?._id) {
    console.log("No @worldnews user found");
    process.exit(1);
  }
  const total = await TVPost.countDocuments({ creatorId: u._id });
  const posts = await TVPost.find({ creatorId: u._id })
    .sort({ createdAt: -1 })
    .limit(8)
    .select("heading createdAt isAiNews newsCategory")
    .lean();

  const aiSports = await TVPost.countDocuments({ isAiNews: true, newsCategory: "sports" });
  const worldofsport = await User.findOne({ username: "worldofsport" }).select("_id").lean();
  const ofsportCount = worldofsport?._id
    ? await TVPost.countDocuments({ creatorId: worldofsport._id })
    : 0;

  console.log("@worldnews user:", u._id, "created:", (u as { createdAt?: Date }).createdAt);
  console.log("total @worldnews posts:", total);
  console.log("total @worldofsport posts:", ofsportCount);
  console.log("total AI sports posts (any user):", aiSports);
  for (const p of posts) {
    console.log(
      `  ${(p as { createdAt?: Date }).createdAt?.toISOString?.() || "?"} | ${String((p as { heading?: string }).heading || "").slice(0, 70)}`
    );
  }
  console.log("\nEnv (keys only):");
  for (const k of [
    "AI_SPORTS_CREATOR_USERNAME",
    "AI_SPORTS_CRON",
    "AI_NEWS_CREATOR_USERNAME",
    "FACEBOOK_TV_INGEST_ENABLED",
    "FACEBOOK_PAGE_ACCESS_TOKEN",
  ]) {
    const v = String(process.env[k] || "").trim();
    console.log(`  ${k}: ${v ? (k.includes("TOKEN") ? `set (${v.length} chars)` : v) : "MISSING"}`);
  }
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
