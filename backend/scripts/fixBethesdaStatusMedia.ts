/**
 * Point BETHESDA accounts at loadable school-gallery avatars + fix recent TV post media paths.
 */
import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";
import User from "../src/data/models/User";
import TVPost from "../src/data/models/TVPost";
import {
  resolveEffectiveSchoolAvatar,
  remapSchoolGalleryPathForUser,
} from "../src/utils/schoolProfileMedia";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const UPLOADS_ROOT = path.resolve(__dirname, "../uploads");

async function fixUser(query: Record<string, unknown>, label: string) {
  const user = await User.findOne(query).select("_id username avatar profileGalleryUrls").lean();
  if (!user) {
    console.log(`Skip: no user ${label}`);
    return;
  }
  const uid = String(user._id);
  const avatar = resolveEffectiveSchoolAvatar(user, UPLOADS_ROOT);
  if (!avatar) {
    console.log(`Skip ${user.username}: no gallery avatar`);
    return;
  }
  await User.updateOne({ _id: user._id }, { $set: { avatar, isSchoolAccount: true } });
  console.log(`${user.username}: avatar -> ${avatar}`);

  const posts = await TVPost.find({
    creatorId: user._id,
    status: "approved",
    $or: [
      { mediaUrls: /\/uploads\/profiles\/school-/i },
      { mediaUrls: /\/uploads\/school-gallery\// },
      { feedActivity: "profile_avatar_update" },
    ],
  })
    .select("_id mediaUrls")
    .limit(40)
    .lean();

  let fixedPosts = 0;
  for (const p of posts) {
    const urls = (p.mediaUrls || []).map((u: string) => {
      const s = String(u || "").trim();
      if (!s.includes("/uploads/")) return s;
      if (s.includes("/school-gallery/")) return remapSchoolGalleryPathForUser(s, uid);
      if (/^\/uploads\/profiles\/school-/i.test(s)) return avatar;
      return s;
    });
    const changed = JSON.stringify(urls) !== JSON.stringify(p.mediaUrls || []);
    if (changed) {
      await TVPost.updateOne({ _id: p._id }, { $set: { mediaUrls: urls } });
      fixedPosts++;
    }
  }
  console.log(`${user.username}: ${fixedPosts} TV post(s) remapped`);
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI!);
  await fixUser({ username: "bethesdaprimaryschool" }, "bethesdaprimaryschool");
  await fixUser({ _id: "69cd1cb7703cf9d7f5bb799a" }, "BETHESDA PRIMARY");
  await fixUser({ username: "zagalb435d0ee5c57" }, "zagalb435d0ee5c57");
  await fixUser({ _id: "6a205ae6f2b25bb2b1b322d3" }, "Bethesda Special");
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
