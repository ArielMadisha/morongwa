import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";
import User from "../src/data/models/User";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function main() {
  await mongoose.connect(process.env.MONGO_URI!);
  const users = await User.find({
    $or: [{ name: /amaqadi/i }, { username: /amaqadi/i }],
  })
    .select("name username avatar profileGalleryUrls isSchoolAccount phone _id")
    .lean();
  console.log(JSON.stringify(users, null, 2));
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
