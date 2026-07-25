/**
 * One-off: remove inappropriate (non-school) TV posts + gallery entries from
 * ABEL MOTSHOANE SECONDARY SCHOOL per instructions@ email 2026-07-07.
 *
 * Keeps only school-related media (campus exterior / assembly).
 *
 * Usage (from backend/):
 *   npx tsx scripts/cleanupAbelMotshoaneInappropriateMedia.ts --dry-run
 *   npx tsx scripts/cleanupAbelMotshoaneInappropriateMedia.ts
 */
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import mongoose from "mongoose";
import { connectDB } from "../src/data/db";
import User from "../src/data/models/User";
import TVPost from "../src/data/models/TVPost";
import TVComment from "../src/data/models/TVComment";
import TVInteraction from "../src/data/models/TVInteraction";
import TVReport from "../src/data/models/TVReport";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const dryRun = process.argv.includes("--dry-run");
const USER_ID = "69cd1cbe703cf9d7f5bba0f6";

/** School campus / assembly only — keep these filenames. */
const KEEP_BASENAMES = new Set([
  "1783398630976-99adf48114dc.jpg", // school exterior sign
  "1783398628911-fa57080b5684.jpg", // school exterior (dup)
  "1783485026051-e52348c918a0.jpg", // school exterior (dup)
  "1783398629446-f624dbb445e9.jpg", // school assembly
]);

function basenameOfUrl(url: string): string {
  const clean = String(url || "").split("?")[0];
  return path.posix.basename(clean.replace(/\\/g, "/"));
}

function isKeepUrl(url: string): boolean {
  return KEEP_BASENAMES.has(basenameOfUrl(url));
}

async function deletePostCascade(postId: mongoose.Types.ObjectId) {
  await Promise.all([
    TVComment.deleteMany({ postId }),
    TVInteraction.deleteMany({ postId }),
    TVReport.deleteMany({ postId }),
  ]);
  await TVPost.deleteOne({ _id: postId });
}

async function main() {
  await connectDB();
  const user = await User.findById(USER_ID);
  if (!user) {
    console.log("User not found");
    await mongoose.disconnect();
    return;
  }

  console.log(`Account: ${user.name} @${user.username} school=${!!user.isSchoolAccount}`);
  console.log(`Mode: ${dryRun ? "DRY-RUN" : "LIVE"}`);

  const posts = await TVPost.find({ creatorId: user._id }).sort({ createdAt: -1 });
  let deletedPosts = 0;
  let keptPosts = 0;

  for (const post of posts) {
    const urls = post.mediaUrls || [];
    const keep = urls.length > 0 && urls.every(isKeepUrl);
    if (keep) {
      keptPosts++;
      console.log(`KEEP post ${post._id}  ${urls.join("|")}`);
      continue;
    }
    console.log(`DELETE post ${post._id}  ${urls.join("|") || "(no media)"}`);
    if (!dryRun) await deletePostCascade(post._id as mongoose.Types.ObjectId);
    deletedPosts++;
  }

  const gallery = user.profileGalleryUrls || [];
  const nextGallery = gallery.filter(isKeepUrl);
  const removedGallery = gallery.length - nextGallery.length;

  let nextAvatar = user.avatar || "";
  if (nextAvatar && !isKeepUrl(nextAvatar)) {
    nextAvatar = nextGallery[0] || "";
    console.log(`Avatar was non-school → ${nextAvatar || "(cleared)"}`);
  }

  console.log(`\nPosts: keep=${keptPosts} delete=${deletedPosts}`);
  console.log(`Gallery: ${gallery.length} → ${nextGallery.length} (remove ${removedGallery})`);

  if (!dryRun) {
    user.profileGalleryUrls = nextGallery;
    user.avatar = nextAvatar;
    await user.save();

    // Best-effort local file cleanup
    const localDir = path.resolve(
      __dirname,
      "../uploads/school-gallery",
      String(user._id)
    );
    if (fs.existsSync(localDir)) {
      for (const name of fs.readdirSync(localDir)) {
        if (!KEEP_BASENAMES.has(name) && /\.(jpe?g|png|webp|gif)$/i.test(name)) {
          try {
            fs.unlinkSync(path.join(localDir, name));
            console.log(`Removed local file ${name}`);
          } catch {
            /* ignore */
          }
        }
      }
    }
  }

  await mongoose.disconnect();
  console.log(dryRun ? "Dry-run done." : "Cleanup done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
