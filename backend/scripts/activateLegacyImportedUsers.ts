/**
 * Set password and activate users imported from a legacy site.
 *
 * Default mode (safe): only users with importedFromLegacy: true
 *   npx ts-node scripts/activateLegacyImportedUsers.ts
 *
 * Wide mode (risky): all inactive users without admin/superadmin role
 *   CONFIRM_ACTIVATE_ALL_INACTIVE=yes npx ts-node scripts/activateLegacyImportedUsers.ts --inactive-only
 *
 * Password is always set to the constant below (override with LEGACY_ACTIVATE_PASSWORD in .env if needed).
 */
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "../src/data/models/User";

const DEFAULT_PASSWORD = "11111111";

async function main() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error("MONGO_URI not set");
    process.exit(1);
  }

  const password = (process.env.LEGACY_ACTIVATE_PASSWORD || DEFAULT_PASSWORD).trim();
  const inactiveOnly = process.argv.includes("--inactive-only");

  await mongoose.connect(mongoUri);
  const passwordHash = await bcrypt.hash(password, 10);

  let filter: Record<string, unknown>;

  if (inactiveOnly) {
    if (process.env.CONFIRM_ACTIVATE_ALL_INACTIVE !== "yes") {
      console.error(
        "Refusing --inactive-only without CONFIRM_ACTIVATE_ALL_INACTIVE=yes (sets password for all inactive non-admin users)."
      );
      process.exit(1);
    }
    filter = {
      active: false,
      role: { $not: { $elemMatch: { $in: ["admin", "superadmin"] } } },
    };
  } else {
    filter = { importedFromLegacy: true };
  }

  const preview = await User.countDocuments(filter);
  if (preview === 0) {
    console.log(
      "No users matched. For legacy imports, set importedFromLegacy: true on migrated rows, or run with --inactive-only (see script header)."
    );
    await mongoose.disconnect();
    return;
  }

  const result = await User.updateMany(filter, {
    $set: {
      active: true,
      locked: false,
      suspended: false,
      passwordHash,
    },
  });

  console.log(`Matched: ${result.matchedCount}, modified: ${result.modifiedCount}`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
