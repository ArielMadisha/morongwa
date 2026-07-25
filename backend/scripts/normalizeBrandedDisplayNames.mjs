#!/usr/bin/env node
/**
 * Normalize branded account display names (Title Case), keep usernames as handles.
 * Bumps status-strip cache so wall rings refresh.
 *
 *   node scripts/normalizeBrandedDisplayNames.mjs
 */
import "dotenv/config";
import mongoose from "mongoose";

const UPDATES = [
  { username: "historybox", name: "History Box" },
  { username: "globalpulse", name: "Global Pulse" },
  { username: "tumimhapi", name: "Tumi Mhapi" },
  { username: "dwafrica", name: "DW Africa" },
  { username: "rightsourcetv", name: "Right Source TV" },
  { username: "africanites", name: "Africanites" },
  { username: "iraninternational", name: "Iran International" },
  { username: "cryingbuffalo", name: "Crying Buffalo" },
  { username: "someamazingfacts", name: "Some Amazing Facts" },
  { username: "mechanicsmix", name: "Mechanics Mix" },
];

async function main() {
  const mongo = process.env.MONGO_URI;
  if (!mongo) throw new Error("MONGO_URI not set");
  await mongoose.connect(mongo);
  const users = mongoose.connection.db.collection("users");
  const results = [];

  for (const row of UPDATES) {
    const existing = await users.findOne({ username: row.username });
    if (!existing) {
      results.push({ username: row.username, status: "missing" });
      continue;
    }
    await users.updateOne(
      { _id: existing._id },
      { $set: { name: row.name, updatedAt: new Date() } }
    );
    results.push({
      username: row.username,
      from: existing.name,
      to: row.name,
      status: "updated",
    });
  }

  console.log(JSON.stringify(results, null, 2));
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(e?.message || e);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
