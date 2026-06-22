import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";
import User from "../src/data/models/User";
import TVPost from "../src/data/models/TVPost";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function main() {
  await mongoose.connect(process.env.MONGO_URI!);
  const u = await User.findOne({ name: /^AIMS$/i })
    .select("name username avatar profileGalleryUrls")
    .lean();
  console.log("user", JSON.stringify(u, null, 2));
  if (u) {
    const posts = await TVPost.find({ creatorId: u._id }).limit(3).select("mediaUrls caption hashtags").lean();
    console.log("posts", JSON.stringify(posts, null, 2));
  }
  const b = await User.findOne({ name: /boitshepo/i }).select("_id name").lean();
  if (b) {
    const pb = await TVPost.findOne({ creatorId: b._id }).select("caption hashtags").lean();
    console.log("boitshepo", JSON.stringify(pb, null, 2));
  }
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
