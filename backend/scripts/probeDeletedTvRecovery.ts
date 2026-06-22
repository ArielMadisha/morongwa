/**
 * Find orphaned TV interactions/comments pointing at deleted video posts.
 */
import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";
import TVPost from "../src/data/models/TVPost";
import TVComment from "../src/data/models/TVComment";
import TVInteraction from "../src/data/models/TVInteraction";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function main() {
  await mongoose.connect(process.env.MONGO_URI!);

  const postIds = new Set(
    (await TVPost.find({}).select("_id").lean()).map((p) => String(p._id))
  );

  const interactions = await TVInteraction.find({ postId: { $exists: true } })
    .select("postId userId type createdAt")
    .limit(5000)
    .lean();
  const orphanIx = interactions.filter((i) => i.postId && !postIds.has(String(i.postId)));
  console.log("interactions", interactions.length, "orphan_post_refs", orphanIx.length);
  const byPost = new Map<string, number>();
  for (const i of orphanIx) {
    const k = String(i.postId);
    byPost.set(k, (byPost.get(k) || 0) + 1);
  }
  console.log("top_orphan_posts", [...byPost.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15));

  const comments = await TVComment.find({})
    .select("postId userId text createdAt")
    .sort({ createdAt: -1 })
    .limit(5000)
    .lean();
  const orphanComments = comments.filter((c) => c.postId && !postIds.has(String(c.postId)));
  console.log("comments", comments.length, "orphan_post_refs", orphanComments.length);

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
