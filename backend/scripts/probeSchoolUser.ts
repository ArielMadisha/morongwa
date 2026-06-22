import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import { connectDB } from "../src/data/db";
import User from "../src/data/models/User";
import Store from "../src/data/models/Store";
import TVPost from "../src/data/models/TVPost";
import fs from "fs";

const needle = process.argv[2] || "lingelihle";

async function main() {
  await connectDB();
  const users = await User.find({
    $or: [
      { username: new RegExp(needle, "i") },
      { name: new RegExp(needle, "i") },
    ],
  })
    .select("name username avatar profileGalleryUrls isSchoolAccount createdAt")
    .lean();

  console.log(`Matches for /${needle}/i:`, users.length);
  for (const u of users) {
    console.log("\n---", u.name, `@${u.username}`, String(u._id));
    console.log("avatar:", u.avatar);
    const gallery = Array.isArray(u.profileGalleryUrls) ? u.profileGalleryUrls : [];
    console.log("gallery count:", gallery.length);
    for (const g of gallery.slice(0, 8)) {
      const p = String(g).replace(/^\/uploads\//, "");
      const exists = fs.existsSync(path.join(__dirname, "../uploads", p));
      console.log(`  ${exists ? "OK" : "MISSING"} ${g}`);
    }
    const stores = await Store.find({ userId: u._id }).lean();
    console.log(
      "stores:",
      stores.map((s) => ({ name: s.name, slug: s.slug, type: s.type, supplierId: s.supplierId }))
    );
    const posts = await TVPost.find({ creatorId: u._id }).sort({ createdAt: -1 }).limit(5).lean();
    console.log(
      "recent TV:",
      posts.map((p) => ({
        id: String(p._id),
        type: p.type,
        media: p.mediaUrls,
        status: p.status,
        createdAt: p.createdAt,
      }))
    );
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
