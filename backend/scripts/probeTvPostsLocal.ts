/**
 * Local probe: TV post counts + media file checks (uses backend/.env MONGO_URI).
 *   npx ts-node-dev --transpile-only --exit-child scripts/probeTvPostsLocal.ts
 */
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import mongoose from "mongoose";
import TVPost from "../src/data/models/TVPost";
import User from "../src/data/models/User";
import { TV_UPLOAD_STORAGE_DIR } from "../src/middleware/tvUpload";
import { tvPostHasAvailableMedia, resolveUploadedTvFilePath } from "../src/services/tvMediaAvailability";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error("MONGO_URI not set");
    process.exit(1);
  }
  console.log("TV_UPLOAD_STORAGE_DIR (local cwd):", TV_UPLOAD_STORAGE_DIR);
  await mongoose.connect(uri);

  const byType = await TVPost.aggregate([
    { $match: { status: "approved" } },
    { $group: { _id: "$type", n: { $sum: 1 } } },
  ]);
  console.log("approved_by_type", byType);

  const approved = await TVPost.find({ status: "approved" })
    .select("type mediaUrls artworkUrl")
    .lean();
  const visible = approved.filter((p) =>
    tvPostHasAvailableMedia(p as { type?: string; mediaUrls?: string[]; artworkUrl?: string })
  );
  console.log(`approved_total=${approved.length} visible_after_media_filter=${visible.length}`);

  const samples = await TVPost.find({
    status: "approved",
    type: { $in: ["video", "image", "carousel"] },
  })
    .select("type mediaUrls creatorId createdAt caption")
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();

  for (const p of samples) {
    const url = (p.mediaUrls as string[])?.[0] || "";
    const resolved = resolveUploadedTvFilePath(url);
    const existsLocal = resolved ? fs.existsSync(resolved) : null;
    console.log("sample", {
      id: p._id,
      type: p.type,
      url: url.slice(0, 100),
      resolved: resolved?.slice(-60),
      existsLocal,
      hasMedia: tvPostHasAvailableMedia(p as any),
    });
  }

  const videoAny = await TVPost.countDocuments({ type: "video" });
  const videoApproved = await TVPost.countDocuments({ type: "video", status: "approved" });
  const videoDeleted = await TVPost.countDocuments({ type: "video", status: { $ne: "approved" } });
  console.log({ videoAny, videoApproved, videoDeleted });

  const arielUsers = await User.find({ $or: [{ username: /ariel/i }, { name: /ariel/i }] })
    .select("username name")
    .limit(10)
    .lean();
  console.log("ariel_users", arielUsers);

  for (const ariel of arielUsers) {
    const posts = await TVPost.find({ creatorId: ariel._id })
      .select("type mediaUrls status createdAt caption")
      .sort({ createdAt: -1 })
      .limit(15)
      .lean();
    if (ariel.username === "arielmadisha") {
      console.log(`posts for ${ariel.username}:`, posts.length);
      for (const p of posts) {
        const url = (p.mediaUrls as string[])?.[0] || "";
        console.log(JSON.stringify({
          user: ariel.username,
          id: String(p._id),
          status: p.status,
          type: p.type,
          hasMedia: tvPostHasAvailableMedia(p as any),
          caption: String(p.caption || "").slice(0, 80),
          url,
        }));
      }
    }
  }

  const recentVideos = await TVPost.find({ type: "video" })
    .select("creatorId mediaUrls status createdAt caption")
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();
  console.log(`recent_video_docs=${recentVideos.length}`);
  for (const p of recentVideos) {
    console.log({
      id: p._id,
      status: p.status,
      createdAt: p.createdAt,
      url: ((p.mediaUrls as string[])?.[0] || "").slice(0, 100),
    });
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
