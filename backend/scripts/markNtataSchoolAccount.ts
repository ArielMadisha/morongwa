/**
 * One-off: mark NTATA (Ntataise Primary School) as a school account.
 *   npx tsx scripts/markNtataSchoolAccount.ts
 */
import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";
import User from "../src/data/models/User";

dotenv.config({ path: path.join(__dirname, "../.env") });

async function main() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error("MONGO_URI not set");
    process.exit(1);
  }
  await mongoose.connect(mongoUri);

  const ids = ["69cd1cbf703cf9d7f5bba6a2", "69cd1cbe703cf9d7f5bb9e5b"];
  const res = await User.updateMany(
    { _id: { $in: ids } },
    { $set: { isSchoolAccount: true } }
  );
  console.log("Updated", res.modifiedCount, "school account(s): NTATA + NTATAISE PRIMARY");

  const rows = await User.find({ _id: { $in: ids } })
    .select("name username isSchoolAccount")
    .lean();
  console.log(rows);

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
