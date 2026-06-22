/**
 * Fix avatar + gallery URLs that still point at a deleted gallery-import user folder.
 *
 *   npm run fix:school-gallery-urls
 */

import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";
import User from "../src/data/models/User";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function main() {
  await mongoose.connect(process.env.MONGO_URI!);
  const users = await User.find({
    $or: [
      { avatar: /\/uploads\/school-gallery\// },
      { profileGalleryUrls: /\/uploads\/school-gallery\// },
    ],
  })
    .select("avatar profileGalleryUrls")
    .lean();

  let fixed = 0;
  for (const u of users) {
    const uid = String(u._id);
    const prefix = `/uploads/school-gallery/${uid}/`;
    const gallery = ((u.profileGalleryUrls as string[]) || []).map((p) => {
      const base = String(p).split("/").pop();
      return base ? `${prefix}${base}` : p;
    });
    let avatar = u.avatar as string | undefined;
    if (avatar && avatar.includes("/school-gallery/") && !avatar.startsWith(prefix)) {
      const base = avatar.split("/").pop();
      avatar = base ? `${prefix}${base}` : avatar;
    }
    const galleryChanged =
      JSON.stringify(gallery) !== JSON.stringify(u.profileGalleryUrls || []);
    const avatarChanged = avatar !== u.avatar;
    if (!galleryChanged && !avatarChanged) continue;
    await User.updateOne({ _id: u._id }, { $set: { profileGalleryUrls: gallery, avatar } });
    fixed++;
  }
  console.log(`Fixed URL paths for ${fixed} users`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
