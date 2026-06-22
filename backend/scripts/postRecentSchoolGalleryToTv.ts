/**
 * Create approved TV image posts from users with /uploads/school-gallery/ profile URLs.
 * Run after importSchoolGalleriesBatchFromDir.
 */
import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";
import User from "../src/data/models/User";
import TVPost from "../src/data/models/TVPost";
import { buildSchoolTvCaption, buildSchoolTvHashtags } from "./lib/schoolTvPostCopy";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const DRY = process.argv.includes("--dry-run");
const MAX = Math.min(20, Math.max(1, parseInt(process.env.SCHOOL_GALLERY_TV_MAX || "12", 10) || 12));

async function main() {
  await mongoose.connect(process.env.MONGO_URI!);
  const schools = await User.find({
    profileGalleryUrls: /\/uploads\/school-gallery\//,
  })
    .select("name avatar profileGalleryUrls")
    .lean();

  let created = 0;
  let dup = 0;

  for (const s of schools) {
    const name = String(s.name || "School");
    const caption = buildSchoolTvCaption(name);
    const hashtags = buildSchoolTvHashtags(name);
    const urls = [
      ...new Set([
        ...(Array.isArray(s.profileGalleryUrls) ? s.profileGalleryUrls : []),
        ...(s.avatar ? [s.avatar] : []),
      ]),
    ]
      .filter((u) => String(u).includes("/uploads/school-gallery/"))
      .slice(0, MAX);

    for (const mediaUrl of urls) {
      const exists = await TVPost.findOne({ creatorId: s._id, mediaUrls: mediaUrl })
        .select("_id")
        .lean();
      if (exists) {
        dup++;
        continue;
      }
      if (!DRY) {
        await TVPost.create({
          creatorId: s._id,
          type: "image",
          mediaUrls: [mediaUrl],
          caption,
          hashtags,
          genre: "history",
          hasWatermark: true,
          status: "approved",
          likeCount: 0,
          commentCount: 0,
          shareCount: 0,
          viewCount: 0,
        });
      }
      created++;
    }
  }

  console.log(`Schools: ${schools.length}, posts ${DRY ? "would create" : "created"}: ${created}, dup: ${dup}`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
