/**
 * Remove undeployed / orphan school profile gallery URLs from user records.
 */
import dotenv from "dotenv";
import path from "path";
import { connectDB } from "../src/data/db";
import User from "../src/data/models/User";
import {
  isOrphanSchoolProfileGalleryUrl,
  isUndeployedSchoolProfileAvatar,
} from "../src/utils/schoolProfileMedia";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function main() {
  await connectDB();
  const users = await User.find({ profileGalleryUrls: /school-gallery|profiles\/school-/ })
    .select("profileGalleryUrls")
    .lean();
  let fixed = 0;
  for (const u of users) {
    const gallery = (u.profileGalleryUrls || []).filter((url: string) => {
      if (isUndeployedSchoolProfileAvatar(url) || isOrphanSchoolProfileGalleryUrl(url)) return false;
      return true;
    });
    if (JSON.stringify(gallery) !== JSON.stringify(u.profileGalleryUrls || [])) {
      await User.updateOne({ _id: u._id }, { $set: { profileGalleryUrls: gallery } });
      fixed++;
    }
  }
  console.log(`Removed orphan gallery URLs for ${fixed} user(s)`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
