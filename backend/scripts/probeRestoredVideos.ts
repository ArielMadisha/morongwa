import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";
import TVPost from "../src/data/models/TVPost";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function main() {
  await mongoose.connect(process.env.MONGO_URI!);
  const n = await TVPost.countDocuments({ type: "video" });
  const samples = await TVPost.find({ type: "video" })
    .select("mediaUrls caption createdAt")
    .sort({ createdAt: -1 })
    .limit(5)
    .lean();
  console.log("count", n);
  console.log(JSON.stringify(samples, null, 2));
  await mongoose.disconnect();
}
main();
