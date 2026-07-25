/**
 * Find a school account and remove an inappropriate TV post (and its media from the
 * profile gallery + related comments/interactions/reports).
 *
 * Usage (from backend/):
 *   npm run school:remove-tv-post -- --school="ABEL Motsh"                  # list account + recent posts
 *   npm run school:remove-tv-post -- --school="ABEL Motsh" --delete-post=<postId>
 *   npm run school:remove-tv-post -- --school="ABEL Motsh" --delete-latest-image
 */
import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";
import { connectDB } from "../src/data/db";
import User from "../src/data/models/User";
import TVPost from "../src/data/models/TVPost";
import TVComment from "../src/data/models/TVComment";
import TVInteraction from "../src/data/models/TVInteraction";
import TVReport from "../src/data/models/TVReport";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

function argVal(prefix: string): string | undefined {
  const hit = process.argv.slice(2).find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length).trim() || undefined : undefined;
}

const schoolQuery = argVal("--school=") || "ABEL Motsh";
const deletePostId = argVal("--delete-post=");
const deleteLatestImage = process.argv.includes("--delete-latest-image");

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function main() {
  await connectDB();

  const tokens = schoolQuery.split(/\s+/).filter(Boolean).map(escapeRegex);
  const andRegex = tokens.map((t) => ({ name: { $regex: t, $options: "i" } }));
  const users = await User.find({ $and: andRegex })
    .select("_id name username avatar isSchoolAccount profileGalleryUrls")
    .lean();

  if (!users.length) {
    console.log(`No accounts matched "${schoolQuery}".`);
    await mongoose.disconnect();
    return;
  }
  if (users.length > 1) {
    console.log(`Matched ${users.length} accounts:`);
    for (const u of users) console.log(`- ${u._id}  ${u.name}  @${u.username || "-"}  school=${!!u.isSchoolAccount}`);
    console.log("Refine --school= to a single account before deleting.");
  }

  const user = users[0];
  console.log(`\nAccount: ${user._id}  ${user.name}  @${user.username || "-"}  school=${!!user.isSchoolAccount}`);
  console.log(`Avatar: ${user.avatar || "(none)"}`);
  const gallery = user.profileGalleryUrls || [];
  console.log(`Gallery images (${gallery.length}):`);
  gallery.forEach((g, i) => console.log(`  [${i}] ${g}`));

  const posts = await TVPost.find({ creatorId: user._id })
    .select("_id type mediaUrls hashtags caption createdAt status")
    .sort({ createdAt: -1 })
    .limit(30)
    .lean();

  console.log(`\nRecent TV posts (${posts.length}):`);
  for (const p of posts) {
    console.log(
      `  ${p._id}  ${p.type}  ${new Date(p.createdAt).toISOString()}  status=${p.status}  media=${(p.mediaUrls || []).join("|")}`
    );
  }

  let targetId = deletePostId;
  if (!targetId && deleteLatestImage) {
    const latestImage = posts.find((p) => p.type === "image" || (p.mediaUrls || []).length > 0);
    if (latestImage) targetId = String(latestImage._id);
    console.log(`\n--delete-latest-image → ${targetId || "no image post found"}`);
  }

  if (!targetId) {
    console.log("\nNo --delete-post=<id> given. Nothing deleted (list-only).");
    await mongoose.disconnect();
    return;
  }

  const post = await TVPost.findById(targetId).lean();
  if (!post) {
    console.log(`\nPost ${targetId} not found.`);
    await mongoose.disconnect();
    return;
  }
  if (String(post.creatorId) !== String(user._id)) {
    console.log(`\nRefusing to delete: post ${targetId} does not belong to ${user.name}.`);
    await mongoose.disconnect();
    return;
  }

  const media = post.mediaUrls || [];
  console.log(`\nDeleting TV post ${targetId} (type=${post.type}) media=${media.join("|")}`);

  const [interactions, comments, reports] = await Promise.all([
    TVInteraction.deleteMany({ postId: post._id }),
    TVComment.deleteMany({ postId: post._id }),
    TVReport.deleteMany({ postId: post._id }),
  ]);
  await TVPost.deleteOne({ _id: post._id });

  // Remove the same media from the school's public profile gallery.
  const galleryPull = media.length
    ? await User.updateOne({ _id: user._id }, { $pull: { profileGalleryUrls: { $in: media } } })
    : { modifiedCount: 0 };

  // If the post media was also being used as the avatar, clear it.
  let avatarCleared = false;
  if (user.avatar && media.includes(user.avatar)) {
    await User.updateOne({ _id: user._id }, { $unset: { avatar: 1 } });
    avatarCleared = true;
  }

  console.log(
    `\nDone. post removed; interactions=${interactions.deletedCount} comments=${comments.deletedCount} reports=${reports.deletedCount}; galleryModified=${(galleryPull as { modifiedCount?: number }).modifiedCount || 0}; avatarCleared=${avatarCleared}`
  );
  if (media.length) {
    console.log("\nMedia file paths to purge from the server (if desired):");
    media.forEach((m) => console.log(`  ${m}`));
  }

  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error("Failed:", e?.message || e);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
