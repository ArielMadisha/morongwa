#!/usr/bin/env node
import "dotenv/config";
import mongoose from "mongoose";

const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
await mongoose.connect(process.env.MONGO_URI || "");
const users = await mongoose.connection.db
  .collection("users")
  .find({
    createdAt: { $gte: cutoff },
    active: { $ne: false },
    suspended: { $ne: true },
  })
  .sort({ createdAt: -1 })
  .limit(20)
  .project({ username: 1, name: 1, createdAt: 1, avatar: 1 })
  .toArray();
console.log("cutoff", cutoff.toISOString(), "count", users.length);
for (const u of users) {
  console.log(JSON.stringify({ username: u.username, name: u.name, createdAt: u.createdAt, hasAvatar: !!u.avatar }));
}
await mongoose.disconnect();
