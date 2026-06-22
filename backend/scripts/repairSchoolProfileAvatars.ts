/**
 * Point school avatars at synced /uploads/school-gallery/{userId}/ files when
 * /uploads/profiles/school-* backfill paths are missing on disk (common after gallery-only deploy).
 *
 *   npm run repair:school-profile-avatars -- --dry-run
 *   npm run repair:school-profile-avatars
 */

import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";
import User from "../src/data/models/User";
import {
  resolveEffectiveSchoolAvatar,
  isUndeployedSchoolProfileAvatar,
} from "../src/utils/schoolProfileMedia";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const DRY = process.argv.includes("--dry-run");

async function main() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error("MONGO_URI not set");
    process.exit(1);
  }

  const uploadsRoot = path.resolve(__dirname, "../uploads");
  await mongoose.connect(mongoUri);

  const users = await User.find({
    $or: [
      { isSchoolAccount: true },
      { profileGalleryUrls: { $exists: true, $ne: [] } },
      { avatar: /^\/uploads\/profiles\/school-/ },
      { avatar: /\/uploads\/school-gallery\// },
    ],
  })
    .select("_id name username avatar profileGalleryUrls isSchoolAccount")
    .lean();

  let repaired = 0;
  let skipped = 0;

  for (const u of users) {
    const row = u as {
      _id: mongoose.Types.ObjectId;
      name?: string;
      username?: string;
      avatar?: string;
      profileGalleryUrls?: string[];
    };
    const next = resolveEffectiveSchoolAvatar(row, uploadsRoot);
    const prev = String(row.avatar || "").trim();
    if (!next || next === prev) {
      skipped++;
      continue;
    }
    const reason = isUndeployedSchoolProfileAvatar(prev)
      ? "profiles-path-missing"
      : "remap-or-gallery-fallback";
    console.log(`${DRY ? "[dry-run] " : ""}${row.name} (${row.username || row._id})`);
    console.log(`  ${prev || "(none)"} -> ${next} (${reason})`);
    if (!DRY) {
      await User.updateOne({ _id: row._id }, { $set: { avatar: next } });
    }
    repaired++;
  }

  console.log("\n--- Summary ---");
  console.log("Candidates:", users.length);
  console.log("Repaired:", repaired);
  console.log("Unchanged:", skipped);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
