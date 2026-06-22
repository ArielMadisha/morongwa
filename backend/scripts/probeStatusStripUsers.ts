/**
 * Probe whether specific users qualify for the status strip.
 *   npx tsx scripts/probeStatusStripUsers.ts bongani zolekajama emihlemazikode
 */
import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";
import User from "../src/data/models/User";
import { STATUS_STRIP_TTL_MS } from "../src/services/statusStripPolicy";

dotenv.config({ path: path.join(process.cwd(), ".env") });

async function main() {
  const names = process.argv.slice(2);
  if (!names.length) {
    console.error("Usage: probeStatusStripUsers.ts <username> ...");
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI || "");
  const cutoff = new Date(Date.now() - STATUS_STRIP_TTL_MS);
  console.log("cutoff", cutoff.toISOString(), "ttlHours", STATUS_STRIP_TTL_MS / 3600000);
  for (const q of names) {
    const u = await User.findOne({
      $or: [{ username: q.toLowerCase() }, { name: new RegExp(q, "i") }],
    })
      .select("username name createdAt active suspended role avatar")
      .lean();
    if (!u) {
      console.log(q, "NOT FOUND");
      continue;
    }
    const created = u.createdAt ? new Date(u.createdAt) : null;
    const inWindow = created ? created >= cutoff : false;
    const role = Array.isArray(u.role) ? u.role : [u.role];
    const ok =
      inWindow &&
      u.active !== false &&
      u.suspended !== true &&
      !role.includes("superadmin");
    console.log({
      username: u.username,
      createdAt: created?.toISOString(),
      inWindow,
      active: u.active,
      suspended: u.suspended,
      role,
      qualifies: ok,
      hasAvatar: Boolean(u.avatar),
    });
  }
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
