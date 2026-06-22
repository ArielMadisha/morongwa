#!/usr/bin/env node
/**
 * Find user(s) by name/username/email fragment and optionally unlock + reset password.
 *
 *   node scripts/recoverUserAccount.mjs ariel
 *   RESET_PASSWORD='NewPass1!' node scripts/recoverUserAccount.mjs ariel --apply
 */
import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const query = args.filter((a) => a !== "--apply").join(" ").trim();
  if (!query) {
    console.error("Usage: node scripts/recoverUserAccount.mjs <search> [--apply]");
    process.exit(1);
  }

  const mongo = process.env.MONGO_URI || "mongodb://localhost:27017/morongwa";
  await mongoose.connect(mongo);
  const col = mongoose.connection.db.collection("users");

  const re = new RegExp(escapeRegex(query), "i");
  const users = await col
    .find({
      $or: [{ name: re }, { username: re }, { email: re }],
    })
    .project({
      name: 1,
      username: 1,
      email: 1,
      phone: 1,
      active: 1,
      suspended: 1,
      locked: 1,
      isVerified: 1,
      createdAt: 1,
    })
    .sort({ createdAt: -1 })
    .limit(20)
    .toArray();

  if (!users.length) {
    console.log(JSON.stringify({ ok: false, error: "NO_MATCH", query }));
    await mongoose.disconnect();
    process.exit(1);
  }

  for (const u of users) {
    console.log(
      JSON.stringify({
        ok: true,
        action: apply ? "recover" : "inspect",
        userId: String(u._id),
        name: u.name || "",
        username: u.username || "",
        email: u.email || "",
        phone: u.phone || "",
        active: u.active !== false,
        suspended: !!u.suspended,
        locked: !!u.locked,
        isVerified: !!u.isVerified,
        createdAt: u.createdAt || null,
      })
    );
  }

  if (!apply) {
    console.log(JSON.stringify({ hint: "Re-run with --apply and RESET_PASSWORD=... to unlock and set password" }));
    await mongoose.disconnect();
    return;
  }

  const newPassword = String(process.env.RESET_PASSWORD || "").trim();
  if (!newPassword) {
    console.error("SET RESET_PASSWORD env when using --apply");
    await mongoose.disconnect();
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  const target = users[0];
  await col.updateOne(
    { _id: target._id },
    {
      $set: {
        passwordHash,
        active: true,
        suspended: false,
        locked: false,
        updatedAt: new Date(),
      },
      $unset: { resetPasswordToken: "", resetPasswordExpires: "" },
    }
  );

  console.log(
    JSON.stringify({
      ok: true,
      recovered: true,
      userId: String(target._id),
      username: target.username || "",
      email: target.email || "",
      loginHint: "Use email, username, or phone on https://www.qwertymates.com/login",
    })
  );

  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error("ERR", e?.message || e);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
