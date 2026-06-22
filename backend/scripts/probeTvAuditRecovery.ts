/**
 * Search audit logs and any traces of deleted TV video posts.
 */
import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";
import AuditLog from "../src/data/models/AuditLog";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function main() {
  await mongoose.connect(process.env.MONGO_URI!);

  const tvAudits = await AuditLog.find({
    $or: [
      { action: { $regex: /tv/i } },
      { details: { $regex: /tv|video|uploads\/tv/i } },
      { "meta.mediaUrls": { $exists: true } },
    ],
  })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  console.log("tv_audit_count", tvAudits.length);
  for (const a of tvAudits) {
    console.log(
      a.createdAt,
      a.action,
      JSON.stringify({ meta: a.meta, details: a.details, userId: a.userId }).slice(0, 300)
    );
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
