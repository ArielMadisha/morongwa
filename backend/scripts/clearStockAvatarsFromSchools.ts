/**
 * Inspect + clear stock avatars on school-like accounts (isSchoolAccount or name/username heuristics).
 */
import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";
import User from "../src/data/models/User";
import { bumpStatusStripCache } from "../src/services/statusStripPolicy";
import { clearTvFeedCache } from "../src/services/tvFeedCache";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const DRY = process.argv.includes("--dry-run");

function looksLikeSchool(u: {
  isSchoolAccount?: boolean;
  name?: string;
  username?: string;
}): boolean {
  if (u.isSchoolAccount) return true;
  const name = String(u.name || "");
  const username = String(u.username || "").toLowerCase();
  if (/^bww\d+/i.test(username) || /^zagal/i.test(username)) return true;
  if (/\b(school|primary|secondary|college|university|academy|jss|brigade)\b/i.test(name)) return true;
  return false;
}

async function main() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) throw new Error("MONGO_URI not set");
  await mongoose.connect(mongoUri);

  const withStock = await User.find({
    avatar: { $regex: "^/uploads/avatars/stock/" },
  })
    .select("_id name username avatar isSchoolAccount createdAt")
    .lean();

  const schoolLike = withStock.filter(looksLikeSchool);
  const people = withStock.filter((u) => !looksLikeSchool(u));

  console.log(`Total stock avatars: ${withStock.length}`);
  console.log(`School-like: ${schoolLike.length}`);
  console.log(`People: ${people.length}`);
  console.log(
    "People sample:",
    people.slice(0, 20).map((u) => `${u.username} (${u.name}) → ${u.avatar}`)
  );

  if (!DRY && schoolLike.length) {
    const ids = schoolLike.map((u) => u._id);
    const r = await User.updateMany({ _id: { $in: ids } }, { $unset: { avatar: 1 } });
    console.log(`Cleared ${r.modifiedCount} school-like stock avatars`);
    bumpStatusStripCache();
    clearTvFeedCache();
  }

  const pri = await User.findOne({ username: "priyanka2" }).select("username name avatar").lean();
  console.log("priyanka2:", pri);

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
