/**
 * Import videos from a legacy "videos" collection (e.g. from MySQL migration)
 * into the TVPost collection for QwertyTV display.
 *
 * Run: npx ts-node scripts/importVideosFromLegacy.ts
 *
 * Expects a "videos" collection with documents that can be mapped to TVPost.
 * Adjust the mapping below to match your migration schema.
 */
import mongoose from "mongoose";
import TVPost from "../src/data/models/TVPost";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/morongwa";

async function importVideos() {
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;
  if (!db) throw new Error("No database");

  const videosCol = db.collection("videos");
  const count = await videosCol.countDocuments();
  console.log(`Found ${count} documents in videos collection`);

  if (count === 0) {
    console.log("No videos to import. Ensure your MySQL migration populated the 'videos' collection.");
    await mongoose.disconnect();
    return;
  }

  const cursor = videosCol.find({});
  let imported = 0;
  let skipped = 0;

  for await (const doc of cursor) {
    try {
      // Map legacy schema to TVPost. Adjust field names to match your migration.
      const creatorId = doc.userId || doc.creatorId || doc.user_id;
      const mediaUrl = doc.url || doc.mediaUrl || doc.video_url || doc.path;
      if (!creatorId || !mediaUrl) {
        console.warn("Skipping doc - missing creatorId or mediaUrl:", doc._id);
        skipped++;
        continue;
      }

      const existing = await TVPost.findOne({
        "mediaUrls.0": Array.isArray(mediaUrl) ? mediaUrl[0] : mediaUrl,
      });
      if (existing) {
        skipped++;
        continue;
      }

      await TVPost.create({
        creatorId: mongoose.Types.ObjectId.isValid(creatorId) ? new mongoose.Types.ObjectId(creatorId) : creatorId,
        type: "video",
        mediaUrls: Array.isArray(mediaUrl) ? mediaUrl : [mediaUrl],
        caption: doc.caption || doc.title || doc.description || "",
        hasWatermark: true,
        status: "approved",
        likeCount: doc.likeCount ?? doc.likes ?? 0,
        commentCount: doc.commentCount ?? doc.comments ?? 0,
        shareCount: doc.shareCount ?? doc.shares ?? 0,
      });
      imported++;
    } catch (e) {
      console.warn("Error importing:", doc._id, e);
      skipped++;
    }
  }

  console.log(`Imported ${imported} videos, skipped ${skipped}`);
  await mongoose.disconnect();
}

importVideos().catch(console.error);
