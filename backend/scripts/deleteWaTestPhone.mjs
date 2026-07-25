#!/usr/bin/env node
/**
 * Remove a WhatsApp test registration by phone so the number can register again.
 * Usage: node scripts/deleteWaTestPhone.mjs 0661294468 [--apply]
 */
import "dotenv/config";
import mongoose from "mongoose";
import crypto from "crypto";

function waPhoneToDigits(input) {
  let digits = String(input || "").trim().replace(/^whatsapp:/i, "").replace(/\D/g, "");
  if (/^(267|27|263|260|264|266|268)/.test(digits)) return digits;
  if (digits.startsWith("0")) digits = `27${digits.slice(1)}`;
  return digits;
}

function waPendingContinuePhoneKey(phoneDigits) {
  const hex = crypto.createHash("sha1").update(`wa-pending-v2:${phoneDigits}`).digest("hex").slice(0, 24);
  return new mongoose.Types.ObjectId(hex);
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const phoneArg = args.filter((a) => a !== "--apply").join(" ").trim();
  if (!phoneArg) {
    console.error("Usage: node scripts/deleteWaTestPhone.mjs <phone> [--apply]");
    process.exit(1);
  }

  const digits = waPhoneToDigits(phoneArg);
  const waEmail = `wa_${digits}@morongwa.local`;
  const phoneKey = waPendingContinuePhoneKey(digits);

  const mongo = process.env.MONGO_URI || "mongodb://localhost:27017/morongwa";
  await mongoose.connect(mongo);
  const db = mongoose.connection.db;

  const users = await db
    .collection("users")
    .find({
      $or: [{ phone: digits }, { email: waEmail }, { phone: new RegExp(digits.slice(-9)) }],
    })
    .toArray();

  console.log(JSON.stringify({ action: apply ? "delete" : "inspect", canonicalPhone: digits, waEmail, phoneKey: String(phoneKey) }));

  if (!users.length) {
    console.log(JSON.stringify({ ok: true, message: "No user found for this phone — already clear for registration." }));
    const waStates = await db
      .collection("waconversationstates")
      .find({ user: phoneKey })
      .toArray();
    if (waStates.length && apply) {
      const r = await db.collection("waconversationstates").deleteMany({ user: phoneKey });
      console.log(JSON.stringify({ ok: true, deletedWaStatesByPhoneKey: r.deletedCount }));
    } else if (waStates.length) {
      console.log(JSON.stringify({ hint: "Found WA state by phone key only", count: waStates.length, reRunWithApply: true }));
    }
    await mongoose.disconnect();
    return;
  }

  for (const u of users) {
    console.log(
      JSON.stringify({
        userId: String(u._id),
        name: u.name || "",
        username: u.username || "",
        phone: u.phone || "",
        email: u.email || "",
        createdAt: u.createdAt || null,
      })
    );
  }

  if (!apply) {
    console.log(JSON.stringify({ hint: "Re-run with --apply to delete user, wallet, and WA conversation state." }));
    await mongoose.disconnect();
    return;
  }

  const userIds = users.map((u) => u._id);
  const walletResult = await db.collection("wallets").deleteMany({ user: { $in: userIds } });
  const waResult = await db.collection("waconversationstates").deleteMany({
    $or: [{ user: { $in: userIds } }, { user: phoneKey }],
  });
  const userResult = await db.collection("users").deleteMany({ _id: { $in: userIds } });

  console.log(
    JSON.stringify({
      ok: true,
      deletedUsers: userResult.deletedCount,
      deletedWallets: walletResult.deletedCount,
      deletedWaStates: waResult.deletedCount,
      message: `Phone ${digits} cleared — you can register again on WhatsApp.`,
    })
  );

  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error("ERR", e?.message || e);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
