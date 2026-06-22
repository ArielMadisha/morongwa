#!/usr/bin/env node
/**
 * Reset password for one or more users by username (lowercase) or email.
 * Usage (from backend/): node scripts/resetUserPasswordsByUsername.mjs user1 user2 user@mail.com
 *
 * If env RESET_PASSWORD is set (non-empty), that value is used for all listed users.
 * Otherwise a random temporary password is generated.
 *
 * Prints JSON lines: { ok, username, email, userId, tempPassword }
 */
import "dotenv/config";
import crypto from "crypto";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

function randomPassword() {
  const raw = crypto.randomBytes(18).toString("base64url");
  return `Sys_${raw}!7`;
}

async function main() {
  const usernames = process.argv.slice(2).map((s) => String(s || "").trim().toLowerCase()).filter(Boolean);
  if (!usernames.length) {
    console.error("Usage: node scripts/resetUserPasswordsByUsername.mjs <username> [...]");
    process.exit(1);
  }

  const mongo = process.env.MONGO_URI || "mongodb://localhost:27017/morongwa";
  await mongoose.connect(mongo);
  const col = mongoose.connection.db.collection("users");

  for (const raw of usernames) {
    const isEmail = raw.includes("@");
    const user = isEmail
      ? await col.findOne({ email: raw })
      : await col.findOne({ username: raw });
    if (!user) {
      console.log(JSON.stringify({ ok: false, identifier: raw, error: "NOT_FOUND" }));
      continue;
    }
    const envPw = String(process.env.RESET_PASSWORD || "").trim();
    const tempPassword = envPw || randomPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);
    await col.updateOne(
      { _id: user._id },
      {
        $set: {
          passwordHash,
          active: true,
          suspended: false,
          locked: false,
        },
        $unset: { resetPasswordToken: "", resetPasswordExpires: "" },
      }
    );
    console.log(
      JSON.stringify({
        ok: true,
        identifier: raw,
        username: user.username || "",
        email: user.email || "",
        name: user.name || "",
        userId: String(user._id),
        tempPassword,
      })
    );
  }

  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error("ERR", e?.message || e);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
