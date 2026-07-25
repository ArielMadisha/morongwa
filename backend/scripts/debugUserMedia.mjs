import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config();

const username = process.argv[2] || "aturetutu";

async function head(url) {
  const full = url.startsWith("http") ? url : `https://api.qwertymates.com${url.startsWith("/") ? "" : "/"}${url}`;
  try {
    const res = await fetch(full, { method: "HEAD", redirect: "follow" });
    return res.status;
  } catch (e) {
    return `ERR:${e.message}`;
  }
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const User = mongoose.connection.collection("users");
  const Post = mongoose.connection.collection("tvposts");
  const u = await User.findOne({ username: new RegExp(`^${username}$`, "i") });
  if (!u) {
    console.log("user not found");
    process.exit(1);
  }
  const uid = u._id;
  console.log("user", uid.toString(), u.username);
  console.log("avatar", u.avatar);
  console.log("avatar HEAD", await head(u.avatar || ""));

  const gallery = Array.isArray(u.profileGalleryUrls) ? u.profileGalleryUrls : [];
  console.log("\nprofileGalleryUrls", gallery.length);
  for (const url of gallery) {
    console.log(" ", url, "->", await head(String(url)));
  }

  const posts = await Post.find({ creatorId: uid }).sort({ createdAt: -1 }).limit(30).toArray();
  console.log("\ntvposts (creatorId)", posts.length);
  for (const p of posts) {
    const url = p.mediaUrls?.[0] || "(none)";
    const st = url === "(none)" ? "-" : await head(String(url));
    console.log(p._id.toString(), p.type, url, "->", st);
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
