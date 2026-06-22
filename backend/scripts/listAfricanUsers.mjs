#!/usr/bin/env node
import "dotenv/config";
import mongoose from "mongoose";

async function main() {
  const mongo = process.env.MONGO_URI || "mongodb://localhost:27017/morongwa";
  await mongoose.connect(mongo);
  const users = await mongoose.connection.db
    .collection("users")
    .find({
      $or: [{ username: /african/i }, { name: /african/i }, { email: /african/i }],
    })
    .project({
      _id: 1,
      username: 1,
      name: 1,
      email: 1,
      phone: 1,
      isSchoolAccount: 1,
      createdAt: 1,
    })
    .sort({ createdAt: -1 })
    .limit(100)
    .toArray();

  console.log(`COUNT=${users.length}`);
  for (const u of users) {
    console.log(
      JSON.stringify({
        id: String(u._id),
        username: u.username || "",
        name: u.name || "",
        email: u.email || "",
        phone: u.phone || "",
        isSchoolAccount: Boolean(u.isSchoolAccount),
        createdAt: u.createdAt || null,
      })
    );
  }
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error("ERR", e?.message || e);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
