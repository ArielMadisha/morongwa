#!/usr/bin/env node
import "dotenv/config";
import mongoose from "mongoose";

const USERNAME = "calibastownshipburger";
const PHONE = "27765340451";

async function main() {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI not set");
  await mongoose.connect(process.env.MONGO_URI);
  const users = mongoose.connection.db.collection("users");
  const r = await users.updateOne(
    { username: USERNAME },
    {
      $set: {
        phone: PHONE,
        email: `wa_${PHONE}@morongwa.local`,
        updatedAt: new Date(),
      },
    }
  );
  const u = await users.findOne({ username: USERNAME });
  console.log(
    JSON.stringify(
      {
        matched: r.matchedCount,
        modified: r.modifiedCount,
        username: u?.username,
        phone: u?.phone,
        email: u?.email,
      },
      null,
      2
    )
  );
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
