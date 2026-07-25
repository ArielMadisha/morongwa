import dotenv from "dotenv";
import mongoose from "mongoose";
import {
  resolveProfileBackfillMediaUrl,
  findProfileUploadSibling,
} from "../dist/src/utils/profileBackfillMedia.js";

dotenv.config();

const uploadsRoot = new URL("../uploads", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");

async function head(url) {
  const full = url.startsWith("http") ? url : `https://api.qwertymates.com${url}`;
  try {
    const res = await fetch(full, { method: "HEAD", redirect: "follow" });
    return res.status;
  } catch (e) {
    return `ERR`;
  }
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const Post = mongoose.connection.collection("tvposts");
  const uid = "69cd1cc2703cf9d7f5bbb58b";
  const posts = await Post.find({ creatorId: new mongoose.Types.ObjectId(uid) }).limit(10).toArray();
  console.log("uploadsRoot", uploadsRoot);
  let fixed = 0;
  for (const p of posts) {
    const raw = String(p.mediaUrls?.[0] || "");
    const resolved = resolveProfileBackfillMediaUrl(raw, uploadsRoot);
    const sibling = findProfileUploadSibling(raw, uploadsRoot);
    const before = await head(raw);
    const after = resolved ? await head(resolved) : "-";
    if (resolved !== raw) fixed += 1;
    console.log(raw.split("/").pop(), "->", resolved?.split("/").pop(), `HTTP ${before}->${after}`, sibling ? "sibling" : "");
  }
  console.log(`\n${fixed} URLs remapped locally`);
  await mongoose.disconnect();
}

main().catch(console.error);
