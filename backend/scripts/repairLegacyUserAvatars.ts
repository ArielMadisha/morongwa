/**
 * Point legacy bare `avatar_*.jpg` users at their latest approved TV image when available.
 *
 *   npx ts-node-dev --transpile-only --exit-child scripts/repairLegacyUserAvatars.ts
 *   npx ts-node-dev --transpile-only --exit-child scripts/repairLegacyUserAvatars.ts --dry-run
 */

import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";
import User from "../src/data/models/User";
import TVPost from "../src/data/models/TVPost";
import { resolveUserAvatarForClient, LEGACY_BARE_AVATAR_RE } from "../src/utils/resolveUserAvatar";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const DRY = process.argv.includes("--dry-run");
const USERNAME = process.argv.find((a) => a.startsWith("--user="))?.split("=")[1]?.trim();

async function main() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error("MONGO_URI not set");
    process.exit(1);
  }

  const uploadsRoot = path.resolve(__dirname, "../uploads");
  await mongoose.connect(mongoUri);

  const query: Record<string, unknown> = {
    avatar: { $regex: /^avatar_\d+\.(jpe?g|png|gif|webp)$/i },
  };
  if (USERNAME) query.username = new RegExp(`^${USERNAME.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");

  const users = await User.find(query).select("_id username name avatar profileGalleryUrls").lean();
  let updated = 0;

  for (const u of users) {
    const prev = String(u.avatar || "").trim();
    let resolved = await resolveUserAvatarForClient(u, uploadsRoot);

    // When repairing from a dev machine against prod DB, TV files may not exist locally — trust latest post URL.
    if (
      (!resolved || resolved === prev) &&
      LEGACY_BARE_AVATAR_RE.test(prev) &&
      u._id
    ) {
      const post = await TVPost.findOne({
        creatorId: u._id,
        status: "approved",
        type: { $in: ["image", "carousel"] },
        "mediaUrls.0": { $exists: true, $ne: "" },
      })
        .sort({ createdAt: -1 })
        .select("mediaUrls")
        .lean();
      const tvUrl = post?.mediaUrls?.[0];
      if (typeof tvUrl === "string" && tvUrl.trim() && tvUrl.trim() !== prev) {
        resolved = tvUrl.trim();
      }
    }

    if (!resolved || resolved === prev) continue;
    console.log(`${DRY ? "[dry-run] " : ""}@${u.username || u._id}: ${prev} -> ${resolved}`);
    if (!DRY) {
      await User.updateOne({ _id: u._id }, { $set: { avatar: resolved } });
    }
    updated++;
  }

  console.log("\n--- Summary ---");
  console.log("Matched:", users.length);
  console.log("Updated:", updated);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
