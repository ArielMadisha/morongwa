/**
 * Remove legacy Botswana OSM import rows that used the invented label "School (Botswana)"
 * (and spacing variants like "School(Botswana)") — no real name in OpenStreetMap.
 *
 * Safe filter: country BW + username bw[nwr]<digits> + placeholder name regex.
 * On --execute, also removes related Follow / Wallet / TV rows for those users.
 *
 *   npm run prune:bw-osm-placeholders                    (dry-run, default)
 *   CONFIRM_PRUNE=yes npm run prune:bw-osm-placeholders -- --execute
 */

import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";
import User from "../src/data/models/User";
import Follow from "../src/data/models/Follow";
import Wallet from "../src/data/models/Wallet";
import TVPost from "../src/data/models/TVPost";
import TVComment from "../src/data/models/TVComment";
import TVInteraction from "../src/data/models/TVInteraction";
import TVReport from "../src/data/models/TVReport";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const args = process.argv.slice(2);
const DRY = !args.includes("--execute");

/** Matches "School (Botswana)", "School(Botswana)", extra spaces, etc. */
const PLACEHOLDER_NAME_RE = /^School\s*\(\s*Botswana\s*\)$/i;

function buildFilter() {
  return {
    countryCode: "BW",
    name: PLACEHOLDER_NAME_RE,
    username: /^bw[nwr]\d+$/i,
  };
}

async function cascadeDeleteForUserIds(ids: mongoose.Types.ObjectId[]) {
  if (ids.length === 0) return;

  const posts = await TVPost.find({
    $or: [{ creatorId: { $in: ids } }, { repostedBy: { $in: ids } }],
  })
    .select("_id")
    .lean();
  const postIds = posts.map((p) => p._id);

  const comments = await TVComment.find({
    $or: [{ postId: { $in: postIds } }, { userId: { $in: ids } }],
  })
    .select("_id")
    .lean();
  const commentIds = comments.map((c) => c._id);

  const ri = await TVInteraction.deleteMany({
    $or: [
      { postId: { $in: postIds } },
      { userId: { $in: ids } },
      { repostId: { $in: postIds } },
    ],
  });
  console.log(`TVInteraction removed: ${ri.deletedCount}`);

  const reportOr: mongoose.FilterQuery<unknown>[] = [
    { reporterId: { $in: ids } },
    { reviewedBy: { $in: ids } },
  ];
  if (postIds.length) reportOr.push({ targetType: "post", targetId: { $in: postIds } });
  if (commentIds.length) reportOr.push({ targetType: "comment", targetId: { $in: commentIds } });
  const rr = await TVReport.deleteMany({ $or: reportOr });
  console.log(`TVReport removed: ${rr.deletedCount}`);

  const rc = await TVComment.deleteMany({
    $or: [{ postId: { $in: postIds } }, { userId: { $in: ids } }],
  });
  console.log(`TVComment removed: ${rc.deletedCount}`);

  const rp = await TVPost.deleteMany({
    $or: [{ creatorId: { $in: ids } }, { repostedBy: { $in: ids } }],
  });
  console.log(`TVPost removed: ${rp.deletedCount}`);

  const rf = await Follow.deleteMany({
    $or: [{ followerId: { $in: ids } }, { followingId: { $in: ids } }],
  });
  console.log(`Follow removed: ${rf.deletedCount}`);

  const rw = await Wallet.deleteMany({ user: { $in: ids } });
  console.log(`Wallet removed: ${rw.deletedCount}`);
}

async function main() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error("MONGO_URI not set");
    process.exit(1);
  }

  if (!DRY && process.env.CONFIRM_PRUNE !== "yes") {
    console.error("Refusing --execute without CONFIRM_PRUNE=yes (deletes User documents and related data).");
    process.exit(1);
  }

  await mongoose.connect(mongoUri);

  const filter = buildFilter();
  const n = await User.countDocuments(filter);
  console.log(`Matched placeholder Botswana OSM users: ${n}`);

  if (DRY) {
    console.log(
      "Dry run only. To delete, run: CONFIRM_PRUNE=yes npm run prune:bw-osm-placeholders -- --execute"
    );
    await mongoose.disconnect();
    return;
  }

  const users = await User.find(filter).select("_id").lean();
  const ids = users.map((u) => u._id as mongoose.Types.ObjectId);

  await cascadeDeleteForUserIds(ids);

  const r = await User.deleteMany({ _id: { $in: ids } });
  console.log(`User deleted: ${r.deletedCount}`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
