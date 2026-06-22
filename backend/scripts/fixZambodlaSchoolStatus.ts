/**
 * Fix @lingelihle mis-handle on A B ZAMBODLA JUNIOR PRIMARY SCHOOL — better avatar + status cache bump.
 */
import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import { connectDB } from "../src/data/db";
import User from "../src/data/models/User";
import { bumpStatusStripCache } from "../src/services/statusStripPolicy";

function slugifyHandle(name: string): string {
  return String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 48);
}

const USER_ID = "69cd1cb7703cf9d7f5bb7cfc";

async function main() {
  await connectDB();
  const user = await User.findById(USER_ID);
  if (!user) {
    console.error("User not found");
    process.exit(1);
  }

  const gallery = (user.profileGalleryUrls || []).filter(
    (u): u is string => typeof u === "string" && u.trim().length > 0
  );
  const betterAvatar =
    gallery.find((u) => /\.(jpe?g|png)$/i.test(u) && !u.endsWith(".webp")) ||
    gallery[0] ||
    user.avatar;

  const slug = slugifyHandle(String(user.name || ""));
  if (slug && user.username !== slug) {
    const taken = await User.findOne({ username: slug, _id: { $ne: user._id } }).select("_id").lean();
    if (!taken) {
      user.username = slug;
      console.log("username ->", slug);
    } else {
      console.log("username slug taken, keeping", user.username);
    }
  }

  if (betterAvatar && betterAvatar !== user.avatar) {
    user.avatar = betterAvatar;
    console.log("avatar ->", betterAvatar);
  }

  user.isSchoolAccount = true;
  await user.save();
  bumpStatusStripCache();
  console.log("Status strip cache bumped");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
