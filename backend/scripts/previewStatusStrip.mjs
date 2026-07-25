#!/usr/bin/env node
/** Call production statuses logic preview — list status strip rows from DB criteria */
import "dotenv/config";
import mongoose from "mongoose";
import { STATUS_STRIP_TTL_MS } from "../src/services/statusStripPolicy.ts";

const cutoff = new Date(Date.now() - STATUS_STRIP_TTL_MS);
await mongoose.connect(process.env.MONGO_URI || "");

const newJoiners = await mongoose.connection.db
  .collection("users")
  .find({
    createdAt: { $gte: cutoff },
    active: { $ne: false },
    suspended: { $ne: true },
    $nor: [{ role: "superadmin" }],
  })
  .sort({ createdAt: -1 })
  .limit(40)
  .project({ username: 1, name: 1, createdAt: 1, avatar: 1 })
  .toArray();

const recentPosts = await mongoose.connection.db
  .collection("tvposts")
  .aggregate([
    { $match: { status: "approved", createdAt: { $gte: cutoff } } },
    { $group: { _id: "$creatorId", count: { $sum: 1 }, latest: { $max: "$createdAt" } } },
    { $sort: { latest: -1 } },
    { $limit: 50 },
  ])
  .toArray();

console.log("cutoff", cutoff.toISOString());
console.log("newJoiners", newJoiners.length);
for (const u of newJoiners) {
  console.log(" JOIN", u.username, u.name, u.createdAt, !!u.avatar);
}
console.log("recentPostCreators", recentPosts.length);
for (const p of recentPosts.slice(0, 10)) {
  console.log(" POST", String(p._id), p.count, p.latest);
}

await mongoose.disconnect();
