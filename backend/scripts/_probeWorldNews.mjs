import dotenv from "dotenv";
import mongoose from "mongoose";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

const { default: User } = await import("../src/data/models/User.ts");
const { default: TVPost } = await import("../src/data/models/TVPost.ts");

await mongoose.connect(process.env.MONGO_URI);
const users = await User.find({ username: /world/i }).select("_id username name avatar profileGalleryUrls").lean();
console.log("users", JSON.stringify(users, null, 2));
for (const u of users) {
  const posts = await TVPost.find({ creatorId: u._id }).select("type mediaUrls status createdAt").sort({ createdAt: -1 }).limit(5).lean();
  console.log(`posts for ${u.username}:`, JSON.stringify(posts, null, 2));
}
await mongoose.disconnect();
