/**
 * Manual AI sports post to @worldnews (bypasses Tue/Thu gate with --force).
 *
 *   npm run ai-sports:post
 *   npm run ai-sports:post -- --force
 */

import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";
import { generateAndPublishAiNewsPost } from "../src/services/aiNewsService";
import { isWorldNewsAutopostDay } from "../src/utils/worldNewsSchedule";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const FORCE = process.argv.includes("--force");

async function main() {
  const tz = String(process.env.AI_SPORTS_TIMEZONE || process.env.AI_NEWS_TIMEZONE || "Africa/Johannesburg").trim();
  if (!FORCE && !isWorldNewsAutopostDay(new Date(), tz)) {
    console.log(`Skipped: @worldnews sports autopost is Tue/Fri only (${tz}). Re-run with --force.`);
    process.exit(0);
  }

  const creator = String(process.env.AI_SPORTS_CREATOR_USERNAME || "worldnews").trim();
  console.log(`Publishing AI sports post as @${creator}...`);

  await mongoose.connect(process.env.MONGO_URI!);
  try {
    const result = await generateAndPublishAiNewsPost({ category: "sports" });
    console.log(`Published ${result.postId}: ${result.title}`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
