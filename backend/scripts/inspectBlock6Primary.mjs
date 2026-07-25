#!/usr/bin/env node
import "dotenv/config";
import fs from "fs";
import path from "path";
import mongoose from "mongoose";

await mongoose.connect(process.env.MONGO_URI);
const users = mongoose.connection.db.collection("users");
const tvposts = mongoose.connection.db.collection("tvposts");

const rows = await users
  .find({
    $or: [
      { username: /block6/i },
      { name: /block\s*6\s*primary/i },
      { phone: /26771366951/ },
      { phone: /\+26771366951/ },
    ],
  })
  .project({ name: 1, username: 1, phone: 1, avatar: 1, profileGalleryUrls: 1, isSchoolAccount: 1 })
  .toArray();

for (const u of rows) {
  const id = String(u._id);
  const gallery = u.profileGalleryUrls || [];
  console.log("--- USER ---");
  console.log(
    JSON.stringify(
      {
        id,
        name: u.name,
        username: u.username,
        phone: u.phone,
        avatar: u.avatar,
        galleryCount: gallery.length,
        gallery,
        isSchool: u.isSchoolAccount,
      },
      null,
      2
    )
  );
  if (u.avatar) {
    const local = path.join(process.cwd(), "uploads", String(u.avatar).replace(/^\/uploads\//, "").replace(/\//g, path.sep));
    console.log("avatar local", fs.existsSync(local), local);
  }
  for (const g of gallery) {
    const local = path.join(process.cwd(), "uploads", String(g).replace(/^\/uploads\//, "").replace(/\//g, path.sep));
    console.log("gallery local", fs.existsSync(local), g);
  }
  const posts = await tvposts
    .find({ creatorId: u._id })
    .project({ type: 1, mediaUrls: 1, caption: 1, status: 1, createdAt: 1 })
    .sort({ createdAt: -1 })
    .limit(15)
    .toArray();
  console.log("tvposts", posts.length);
  for (const p of posts) {
    console.log(JSON.stringify({ id: String(p._id), type: p.type, media: p.mediaUrls, status: p.status }, null, 0));
  }
}

await mongoose.disconnect();
