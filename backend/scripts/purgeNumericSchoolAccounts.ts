/**
 * Remove school accounts whose display name is only digits (bad imports / phone-as-name).
 *
 *   npx ts-node-dev --transpile-only --exit-child scripts/purgeNumericSchoolAccounts.ts -- --dry-run
 *   npx ts-node-dev --transpile-only --exit-child scripts/purgeNumericSchoolAccounts.ts
 */
import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";
import User from "../src/data/models/User";
import TVPost from "../src/data/models/TVPost";
import Order from "../src/data/models/Order";
import Task from "../src/data/models/Task";
import Transaction from "../src/data/models/Transaction";
import Wallet from "../src/data/models/Wallet";
import Cart from "../src/data/models/Cart";
import ResellerWall from "../src/data/models/ResellerWall";
import Store from "../src/data/models/Store";
import Follow from "../src/data/models/Follow";
import { isInvalidNumericSchoolAccount } from "../src/utils/schoolProfileDetection";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const DRY = process.argv.includes("--dry-run");

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error("MONGO_URI not set");
    process.exit(1);
  }
  await mongoose.connect(uri);

  const users = await User.find({
    $or: [{ isSchoolAccount: true }, { importedFromLegacy: true }, { email: /^legacy\+/i }],
    name: /^\d+$/,
  })
    .select("_id name username email role isSchoolAccount importedFromLegacy")
    .lean();
  const targets = users.filter((u) => isInvalidNumericSchoolAccount(u));

  console.log(`Found ${targets.length} school account(s) with numeric-only name (dryRun=${DRY})`);
  let deleted = 0;
  let deactivated = 0;

  for (const u of targets) {
    const oid = u._id;
    const roles = Array.isArray(u.role) ? u.role : [u.role];
    if (roles.some((r) => r === "admin" || r === "superadmin")) {
      console.log(`Skip protected role: ${u.name} (${oid})`);
      continue;
    }

    const [postCount, orderCount, taskCount, txCount] = await Promise.all([
      TVPost.countDocuments({ creatorId: oid }),
      Order.countDocuments({ $or: [{ buyerId: oid }, { "items.resellerId": oid }] }),
      Task.countDocuments({ $or: [{ client: oid }, { runner: oid }] }),
      Transaction.countDocuments({ user: oid }),
    ]);
    const wallet = await Wallet.findOne({ user: oid }).select("balance").lean();
    const walletBalance = Number((wallet as { balance?: number } | null)?.balance ?? 0);
    const canDelete =
      postCount === 0 && orderCount === 0 && taskCount === 0 && txCount === 0 && walletBalance <= 0;

    if (DRY) {
      console.log(`[dry-run] ${canDelete ? "delete" : "deactivate"}: ${u.name} @${u.username || "?"} (${oid})`);
      if (canDelete) deleted += 1;
      else deactivated += 1;
      continue;
    }

    if (canDelete) {
      await Cart.deleteMany({ user: oid });
      await ResellerWall.deleteMany({ resellerId: oid });
      await Store.deleteMany({ userId: oid });
      await Follow.deleteMany({ $or: [{ followerId: oid }, { followingId: oid }] });
      await User.deleteOne({ _id: oid });
      console.log(`Deleted: ${u.name} (${oid})`);
      deleted += 1;
    } else {
      await User.updateOne(
        { _id: oid },
        {
          $set: { isSchoolAccount: false, active: false, suspended: true, suspendedAt: new Date() },
          $unset: { schoolPageManagers: "", schoolPublicEmail: "", profileGalleryUrls: "" },
        }
      );
      console.log(`Deactivated (cleared school flag): ${u.name} (${oid})`);
      deactivated += 1;
    }
  }

  await mongoose.disconnect();
  console.log(`Done. deleted=${deleted}, deactivated=${deactivated}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
