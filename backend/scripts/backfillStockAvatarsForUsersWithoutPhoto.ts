/**
 * Assign gendered stock avatars to users who have no profile picture.
 *
 * Usage (from backend/):
 *   npx tsx scripts/backfillStockAvatarsForUsersWithoutPhoto.ts --dry-run
 *   npx tsx scripts/backfillStockAvatarsForUsersWithoutPhoto.ts
 *   npx tsx scripts/backfillStockAvatarsForUsersWithoutPhoto.ts --username=priyanka2
 *   npx tsx scripts/backfillStockAvatarsForUsersWithoutPhoto.ts --limit=200 --push-avatars
 */
import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";
import { spawnSync } from "child_process";
import User from "../src/data/models/User";
import { assignStockAvatarForNewUser, ensureStockAvatarsOnDisk } from "../src/utils/stockAvatar";
import { bumpStatusStripCache } from "../src/services/statusStripPolicy";
import { clearTvFeedCache } from "../src/services/tvFeedCache";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const PUSH = args.includes("--push-avatars");

function argValue(prefix: string): string | undefined {
  const hit = args.find((a) => a.startsWith(prefix));
  if (!hit) return undefined;
  const rest = hit.slice(prefix.length).trim();
  if (rest) return rest;
  const i = args.indexOf(hit);
  const next = args[i + 1];
  return next && !next.startsWith("--") ? next : undefined;
}

const LIMIT = Math.max(1, parseInt(argValue("--limit=") || "500", 10) || 500);
const USERNAME = (argValue("--username=") || "").trim().toLowerCase();

async function main() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) throw new Error("MONGO_URI not set");
  ensureStockAvatarsOnDisk();
  await mongoose.connect(mongoUri);

  const filter: Record<string, unknown> = {
    $or: [{ avatar: { $exists: false } }, { avatar: null }, { avatar: "" }],
    suspended: { $ne: true },
    // Schools use gallery photos — never assign gendered stock faces.
    isSchoolAccount: { $ne: true },
    // Skip admin / system roles
    $nor: [{ role: "superadmin" }, { role: "admin" }],
  };
  if (USERNAME) {
    filter.username = USERNAME;
    delete filter.isSchoolAccount;
    delete filter.$nor;
  }

  const users = await User.find(filter)
    .select("_id name username email avatar isSchoolAccount")
    .sort({ createdAt: -1 })
    .limit(LIMIT)
    .lean();

  console.log(`Found ${users.length} users without avatar${USERNAME ? ` (username=${USERNAME})` : ""}`);

  const looksLikeSchool = (u: { isSchoolAccount?: boolean; name?: string; username?: string }) => {
    if (u.isSchoolAccount) return true;
    const username = String(u.username || "").toLowerCase();
    const name = String(u.name || "");
    if (/^bww\d+/i.test(username) || /^zagal/i.test(username)) return true;
    if (/\b(school|primary|secondary|college|university|academy|jss|brigade)\b/i.test(name)) return true;
    return false;
  };

  let updated = 0;
  for (const u of users) {
    if (looksLikeSchool(u as { isSchoolAccount?: boolean; name?: string; username?: string })) {
      console.log(`skip school ${u.username || u._id}`);
      continue;
    }
    const stock = assignStockAvatarForNewUser({
      name: u.name,
      username: u.username,
    });
    console.log(
      `${DRY ? "[dry-run] " : ""}${u.username || u.email || u._id} (${u.name || "—"}) → ${stock.gender} ${stock.avatar}`
    );
    if (DRY) continue;
    await User.updateOne({ _id: u._id }, { $set: { avatar: stock.avatar } });
    updated += 1;
  }

  if (!DRY && updated > 0) {
    bumpStatusStripCache();
    clearTvFeedCache();
  }

  if (PUSH && !DRY) {
    console.log("Pushing stock avatars to production…");
    const r = spawnSync("node", ["scripts/pushBulkSignupAvatarsRemote.mjs"], {
      cwd: path.resolve(__dirname, ".."),
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    if (r.status !== 0) {
      throw new Error(`pushBulkSignupAvatarsRemote failed (exit ${r.status})`);
    }
  }

  console.log(DRY ? `Dry-run done (${users.length} would update)` : `Updated ${updated} users`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
