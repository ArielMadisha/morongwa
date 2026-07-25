#!/usr/bin/env node
import "dotenv/config";
import mongoose from "mongoose";

const usernames = process.argv.slice(2);
if (!usernames.length) {
  console.error("Usage: node scripts/lookupUsersByUsername.mjs <username> ...");
  process.exit(1);
}

async function main() {
  const mongo = process.env.MONGO_URI || "mongodb://localhost:27017/morongwa";
  await mongoose.connect(mongo);
  const users = await mongoose.connection.db
    .collection("users")
    .find({ username: { $in: usernames } })
    .project({
      _id: 1,
      username: 1,
      name: 1,
      email: 1,
      phone: 1,
      active: 1,
      suspended: 1,
      locked: 1,
    })
    .toArray();

  for (const u of users) {
    console.log(
      JSON.stringify({
        id: String(u._id),
        username: u.username,
        name: u.name,
        email: u.email,
        phone: u.phone,
        active: u.active,
        suspended: u.suspended,
        locked: u.locked,
      })
    );
  }
  if (!users.length) console.log("No users found");
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error("ERR", e?.message || e);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
