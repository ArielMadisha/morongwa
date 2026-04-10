import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "../src/data/models/User";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const DEFAULT_PASSWORD = "11111111";
const DEFAULT_DOMAIN = "user.com";

async function main() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error("MONGO_URI not set");
    process.exit(1);
  }

  const password = (process.env.LEGACY_ACTIVATE_PASSWORD || DEFAULT_PASSWORD).trim();
  const emailDomain = (process.env.LEGACY_IMPORTED_EMAIL_DOMAIN || DEFAULT_DOMAIN).trim();
  const emailRegex = new RegExp(`@${emailDomain.replace(".", "\\.")}$`, "i");

  await mongoose.connect(mongoUri);
  const passwordHash = await bcrypt.hash(password, 10);

  const filter: Record<string, unknown> = {
    email: emailRegex,
    role: { $nin: ["admin", "superadmin"] },
  };

  const preview = await User.countDocuments(filter);
  if (preview === 0) {
    console.log(`No users matched domain ${emailDomain}`);
    await mongoose.disconnect();
    return;
  }

  const result = await User.updateMany(filter, {
    $set: {
      active: true,
      locked: false,
      suspended: false,
      passwordHash,
      importedFromLegacy: true,
    },
  });

  console.log(`Domain: ${emailDomain}`);
  console.log(`Matched: ${result.matchedCount}, modified: ${result.modifiedCount}`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

