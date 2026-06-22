import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";
import User from "../src/data/models/User";
import TVPost from "../src/data/models/TVPost";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function main() {
  await mongoose.connect(process.env.MONGO_URI!);
  const creator = String(process.env.API_FOOTBALL_TV_CREATOR_USERNAME || "worldofsport").trim().toLowerCase();
  const u = await User.findOne({ username: creator }).select("_id username").lean();
  if (!u?._id) {
    console.log(`No @${creator} user`);
    process.exit(1);
  }
  const total = await TVPost.countDocuments({ creatorId: u._id });
  const apiSports = await TVPost.countDocuments({ creatorId: u._id, subject: /API-Sports/i });
  const apiSportsAll = await TVPost.countDocuments({ subject: /API-Sports/i });
  const apiSportsRecentAll = await TVPost.find({ subject: /API-Sports/i })
    .sort({ createdAt: -1 })
    .limit(3)
    .select("heading createdAt type")
    .populate("creatorId", "username")
    .lean();
  const recent = await TVPost.find({ creatorId: u._id })
    .sort({ createdAt: -1 })
    .limit(6)
    .select("heading type mediaUrls createdAt subject")
    .lean();
  console.log(`@${creator} (${u._id})`);
  console.log(`Total posts: ${total}, API-Sports on @${creator}: ${apiSports}`);
  console.log(`API-Sports posts (all accounts): ${apiSportsAll}`);
  for (const p of apiSportsRecentAll) {
    const un = (p as { creatorId?: { username?: string } }).creatorId?.username || "?";
    console.log(
      `  [all] ${(p as { createdAt?: Date }).createdAt?.toISOString?.() || "?"} @${un} | ${String((p as { heading?: string }).heading || "").slice(0, 55)}`
    );
  }
  for (const p of recent) {
    const media = Array.isArray(p.mediaUrls) ? p.mediaUrls.length : 0;
    console.log(
      `  ${(p as { createdAt?: Date }).createdAt?.toISOString?.() || "?"} | ${p.type} | media=${media} | ${String(p.heading || "").slice(0, 60)}`
    );
  }
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
