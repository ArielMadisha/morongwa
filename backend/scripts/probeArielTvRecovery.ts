/**
 * Investigate missing QwertyTV videos for arielmadisha + orphan files in uploads/tv.
 */
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import mongoose from "mongoose";
import User from "../src/data/models/User";
import TVPost from "../src/data/models/TVPost";
import AuditLog from "../src/data/models/AuditLog";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function main() {
  await mongoose.connect(process.env.MONGO_URI!);

  const user = await User.findOne({ username: "arielmadisha" }).select("_id username name createdAt").lean();
  console.log("user", user);

  if (user) {
    const allPosts = await TVPost.find({ creatorId: user._id }).sort({ createdAt: -1 }).lean();
    console.log("all_posts", allPosts.length, allPosts.map((p) => ({ id: p._id, type: p.type, status: p.status, createdAt: p.createdAt })));

    const deletedAudit = await AuditLog.find({
      action: { $regex: /tv|post|purge|delete/i },
      $or: [
        { "meta.creatorId": String(user._id) },
        { "meta.userId": String(user._id) },
        { details: { $regex: /tv/i } },
      ],
    })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();
    console.log("audit_hits", deletedAudit.length);
    for (const a of deletedAudit) {
      console.log(a.createdAt, a.action, JSON.stringify(a.meta || a.details || "").slice(0, 200));
    }
  }

  const tvDir = path.join(__dirname, "../uploads/tv");
  if (fs.existsSync(tvDir)) {
    const files = fs.readdirSync(tvDir).filter((f) => /\.(mp4|webm|mov|mkv)$/i.test(f));
    console.log("local_tv_video_files", files.length);
    console.log("sample_local", files.slice(0, 5));
  } else {
    console.log("no local tv dir");
  }

  const anyVideoPostsEver = await TVPost.collection.countDocuments({ type: "video" });
  console.log("video_docs_in_collection", anyVideoPostsEver);

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
