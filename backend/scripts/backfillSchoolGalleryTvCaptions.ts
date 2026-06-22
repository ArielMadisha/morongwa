/**
 * Update school TV image posts: caption = school name, Boitshepo-style hashtags.
 *
 *   npm run backfill:school-tv-captions -- --dry-run
 *   npm run backfill:school-tv-captions
 *   npm run backfill:school-tv-captions -- --all-school-images
 */
import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";
import User from "../src/data/models/User";
import TVPost from "../src/data/models/TVPost";
import {
  buildSchoolTvCaption,
  buildSchoolTvHashtags,
} from "./lib/schoolTvPostCopy";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const DRY = process.argv.includes("--dry-run");
const ALL_SCHOOL_IMAGES = process.argv.includes("--all-school-images");

async function main() {
  await mongoose.connect(process.env.MONGO_URI!);

  const schoolUsers = await User.find({ isSchoolAccount: true })
    .select("_id name")
    .lean();

  let updated = 0;
  let postsTouched = 0;

  if (ALL_SCHOOL_IMAGES) {
    for (const u of schoolUsers) {
      const caption = buildSchoolTvCaption(String(u.name || "School"));
      const hashtags = buildSchoolTvHashtags(String(u.name || "School"));
      if (DRY) {
        const n = await TVPost.countDocuments({ creatorId: u._id, type: "image" });
        if (n) {
          console.log(`[dry-run] ${u.name}: ${n} image post(s) → ${caption} | ${hashtags.map((t) => `#${t}`).join(" ")}`);
          postsTouched += n;
          updated++;
        }
        continue;
      }
      const res = await TVPost.updateMany(
        { creatorId: u._id, type: "image" },
        { $set: { caption, hashtags } }
      );
      if (res.modifiedCount > 0) {
        updated++;
        postsTouched += res.modifiedCount;
        console.log(`OK: ${u.name} (${res.modifiedCount} posts)`);
      }
    }
    console.log(
      `\nSchools: ${schoolUsers.length}, ${DRY ? "would update" : "updated"} schools: ${updated}, posts: ${postsTouched}`
    );
    await mongoose.disconnect();
    return;
  }

  const posts = await TVPost.find({
    type: "image",
    $or: [
      { caption: /campus photo/i },
      { mediaUrls: /\/uploads\/school-gallery\// },
    ],
  })
    .select("_id creatorId caption hashtags mediaUrls")
    .lean();

  const nameById = new Map(schoolUsers.map((u) => [String(u._id), String(u.name || "School")]));

  let unchanged = 0;

  for (const post of posts) {
    const schoolName = nameById.get(String(post.creatorId)) || "School";
    const caption = buildSchoolTvCaption(schoolName);
    const hashtags = buildSchoolTvHashtags(schoolName);

    const capSame = (post.caption || "").trim() === caption;
    const tagsSame =
      JSON.stringify(post.hashtags || []) === JSON.stringify(hashtags);

    if (capSame && tagsSame) {
      unchanged++;
      continue;
    }

    if (DRY) {
      console.log(`[dry-run] ${post._id} | ${schoolName} → ${hashtags.map((t) => `#${t}`).join(" ")}`);
    } else {
      await TVPost.updateOne({ _id: post._id }, { $set: { caption, hashtags } });
    }
    updated++;
  }

  console.log(
    `\nPosts scanned: ${posts.length}, ${DRY ? "would update" : "updated"}: ${updated}, unchanged: ${unchanged}`
  );
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
