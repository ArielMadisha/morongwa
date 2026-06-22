/**
 * Remove TV posts whose media files under uploads/tv are missing on this API host.
 *
 *   npm run purge:tv-missing-media:dry
 *   npm run purge:tv-missing-media
 *
 * Run on the production API host (or with MONGO_URI + same uploads/tv volume mounted) so
 * file checks match what the live server serves.
 */
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import mongoose from "mongoose";
import TVPost from "../src/data/models/TVPost";
import TVComment from "../src/data/models/TVComment";
import TVInteraction from "../src/data/models/TVInteraction";
import TVReport from "../src/data/models/TVReport";
import MusicSoundUsage from "../src/data/models/MusicSoundUsage";
import { tvPostHasAvailableMedia } from "../src/services/tvMediaAvailability";
import { TV_UPLOAD_STORAGE_DIR } from "../src/middleware/tvUpload";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const DRY = process.argv.includes("--dry-run");

/** Refuse accidental purge against production DB from a laptop missing uploads/tv. */
function assertPurgeHostSafe(): void {
  if (process.env.ALLOW_TV_PURGE_ANY_HOST === "1") return;
  const onProductionContainer = process.env.NODE_ENV === "production" || fs.existsSync("/.dockerenv");
  const tvDir = TV_UPLOAD_STORAGE_DIR;
  let fileCount = 0;
  try {
    if (fs.existsSync(tvDir)) {
      fileCount = fs.readdirSync(tvDir).filter((f) => !f.startsWith(".")).length;
    }
  } catch {
    /* ignore */
  }
  if (!onProductionContainer && fileCount < 50) {
    console.error(
      `Refusing TV purge: only ${fileCount} files in ${tvDir}. ` +
        "Run on the production API container (npm run purge:tv-missing-media:remote) or set ALLOW_TV_PURGE_ANY_HOST=1."
    );
    process.exit(1);
  }
}

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error("MONGO_URI not set");
    process.exit(1);
  }

  assertPurgeHostSafe();

  console.log(`TV upload dir: ${TV_UPLOAD_STORAGE_DIR}`);
  console.log(`Mode: ${DRY ? "DRY RUN" : "DELETE"}`);

  await mongoose.connect(uri);

  const candidates = await TVPost.find({
    status: { $in: ["approved", "pending", "rejected"] },
    type: { $in: ["video", "image", "carousel", "audio"] },
  })
    .select("_id type mediaUrls artworkUrl caption creatorId createdAt")
    .lean();

  const toRemove = candidates.filter(
    (p) => !tvPostHasAvailableMedia(p as { type?: string; mediaUrls?: string[]; artworkUrl?: string })
  );

  console.log(`Scanned ${candidates.length} TV posts with media; ${toRemove.length} missing files on disk.`);

  for (const p of toRemove.slice(0, 30)) {
    const url = (p.mediaUrls as string[])?.[0] || "";
    console.log(`  - ${p._id} [${p.type}] ${String(p.caption || "").slice(0, 40)} ${url}`);
  }
  if (toRemove.length > 30) console.log(`  ... and ${toRemove.length - 30} more`);

  if (!toRemove.length) {
    await mongoose.disconnect();
    return;
  }

  const ids = toRemove.map((p) => p._id);

  if (DRY) {
    console.log("Dry run complete — no documents deleted.");
    await mongoose.disconnect();
    return;
  }

  const [comments, interactions, reports, soundUsage, reposts, deleted] = await Promise.all([
    TVComment.deleteMany({ postId: { $in: ids } }),
    TVInteraction.deleteMany({ $or: [{ postId: { $in: ids } }, { repostId: { $in: ids } }] }),
    TVReport.deleteMany({ targetType: "post", targetId: { $in: ids } }),
    MusicSoundUsage.deleteMany({ tvPostId: { $in: ids } }),
    TVPost.deleteMany({ originalPostId: { $in: ids } }),
    TVPost.deleteMany({ _id: { $in: ids } }),
  ]);

  console.log("Deleted:");
  console.log(`  posts: ${deleted.deletedCount}`);
  console.log(`  reposts of removed: ${reposts.deletedCount}`);
  console.log(`  comments: ${comments.deletedCount}`);
  console.log(`  interactions: ${interactions.deletedCount}`);
  console.log(`  reports: ${reports.deletedCount}`);
  console.log(`  music sound usage: ${soundUsage.deletedCount}`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
