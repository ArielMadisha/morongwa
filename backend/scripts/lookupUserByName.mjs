#!/usr/bin/env node
import "dotenv/config";
import mongoose from "mongoose";

const needle = process.argv[2] || "Ngwenya";

await mongoose.connect(process.env.MONGO_URI);
const users = mongoose.connection.db.collection("users");
const re = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
const found = await users
  .find({
    $or: [{ name: re }, { username: re }, { phone: re }, { email: re }],
  })
  .project({ name: 1, username: 1, phone: 1, email: 1, role: 1, createdAt: 1 })
  .limit(30)
  .toArray();
console.log(JSON.stringify(found, null, 2));
await mongoose.disconnect();
