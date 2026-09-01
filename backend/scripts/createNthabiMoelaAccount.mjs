#!/usr/bin/env node
/**
 * Create Nthabi Moela account (or any one-off user) and notify via email + WhatsApp.
 *
 *   node scripts/createNthabiMoelaAccount.mjs --apply
 *   node scripts/createNthabiMoelaAccount.mjs --apply --notify
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import nodemailer from "nodemailer";
import twilio from "twilio";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dirname, "..");

const apply = process.argv.includes("--apply");
const notify = process.argv.includes("--notify");

const NAME = "Nthabi Moela";
const EMAIL = "nthabimoela@gmail.com";
const PASSWORD = "11111111";
const PHONE_RAW = "0727075053";
const DOB = "1989-09-19";
const USERNAME_PREFERRED = "nthabimoela";

function normalizePhone(phone) {
  let digits = String(phone || "").replace(/\D/g, "");
  if (digits.startsWith("0") && digits.length === 10) digits = `27${digits.slice(1)}`;
  if (digits.startsWith("27") && digits.length === 11) return digits;
  return digits;
}

function ensureStockAvatar() {
  // Use compiled or src via dynamic require after copying uploads
  const stockFiles = ["female-1.png", "female-2.png", "female-3.png"];
  const assetsDir = path.join(backendRoot, "assets", "bulk-signup-avatars");
  const uploadDir = path.join(backendRoot, "uploads", "avatars", "stock");
  fs.mkdirSync(uploadDir, { recursive: true });
  for (const f of [...stockFiles, "male-1.png", "male-2.png", "male-3.png", "male-4.png"]) {
    const dest = path.join(uploadDir, f);
    const src = path.join(assetsDir, f);
    if (!fs.existsSync(dest) && fs.existsSync(src)) fs.copyFileSync(src, dest);
  }
  const pick = stockFiles[Math.floor(Math.random() * stockFiles.length)];
  return `/uploads/avatars/stock/${pick}`;
}

async function uniqueUsername(db, base) {
  let u = base.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 24) || "user";
  let n = 0;
  while (await db.collection("users").findOne({ username: u })) {
    n += 1;
    u = `${base.slice(0, 20)}${n}`;
  }
  return u;
}

async function sendEmail({ to, subject, text }) {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || "587", 10),
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  const info = await transporter.sendMail({
    from: process.env.SMTP_USER || "no-reply@qwertymates.com",
    to,
    subject,
    text,
    html: `<pre style="font-family:system-ui,sans-serif;white-space:pre-wrap;line-height:1.5">${text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")}</pre>`,
  });
  return info;
}

async function sendWhatsApp(toDigits, body) {
  const sid = process.env.TWILIO_ACCOUNT_SID || process.env.TWILIO_WA_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN || process.env.TWILIO_WA_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM || process.env.TWILIO_WA_FROM || "";
  if (!sid || !token || !from) throw new Error("Twilio WhatsApp credentials missing");
  const client = twilio(sid, token);
  const fromWa = from.startsWith("whatsapp:") ? from : `whatsapp:${from.replace(/^\+?/, "+")}`;
  return client.messages.create({
    from: fromWa,
    to: `whatsapp:+${toDigits}`,
    body,
  });
}

async function main() {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI missing");
  const phone = normalizePhone(PHONE_RAW);
  const avatar = ensureStockAvatar();

  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  const users = db.collection("users");

  const existing = await users.findOne({
    $or: [
      { email: EMAIL },
      { phone },
      { email: `wa_${phone}@morongwa.local` },
      { username: USERNAME_PREFERRED },
    ],
  });

  let userDoc = existing;
  let created = false;
  let passwordReset = false;

  if (existing) {
    console.log("Existing user found — updating password/phone/name for handoff:");
    console.log(
      JSON.stringify(
        {
          id: String(existing._id),
          name: existing.name,
          email: existing.email,
          username: existing.username,
          phone: existing.phone,
        },
        null,
        2
      )
    );
    if (apply) {
      const passwordHash = await bcrypt.hash(PASSWORD, 10);
      const patch = {
        name: NAME,
        email: EMAIL,
        phone,
        passwordHash,
        dateOfBirth: new Date(DOB),
        countryCode: "ZA",
        preferredCurrency: existing.preferredCurrency || "ZAR",
      };
      if (!existing.avatar) patch.avatar = avatar;
      if (!existing.username) patch.username = await uniqueUsername(db, USERNAME_PREFERRED);
      await users.updateOne({ _id: existing._id }, { $set: patch });
      passwordReset = true;
      userDoc = await users.findOne({ _id: existing._id });
    }
  } else if (apply) {
    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    const username = await uniqueUsername(db, USERNAME_PREFERRED);
    const now = new Date();
    const insert = {
      name: NAME,
      email: EMAIL,
      username,
      phone,
      passwordHash,
      role: ["client"],
      dateOfBirth: new Date(DOB),
      avatar,
      countryCode: "ZA",
      preferredCurrency: "ZAR",
      createdAt: now,
      updatedAt: now,
    };
    const r = await users.insertOne(insert);
    created = true;
    userDoc = await users.findOne({ _id: r.insertedId });
    await db.collection("wallets").updateOne(
      { user: r.insertedId },
      { $setOnInsert: { user: r.insertedId, balance: 0, transactions: [], createdAt: now, updatedAt: now } },
      { upsert: true }
    );
  } else {
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          wouldCreate: { name: NAME, email: EMAIL, phone, username: USERNAME_PREFERRED, dateOfBirth: DOB, avatar },
        },
        null,
        2
      )
    );
  }

  if (userDoc && apply) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          created,
          passwordReset,
          id: String(userDoc._id),
          name: userDoc.name,
          email: userDoc.email,
          username: userDoc.username,
          phone: userDoc.phone,
          avatar: userDoc.avatar,
        },
        null,
        2
      )
    );
  }

  if (apply && notify && userDoc) {
    const creds = [
      `Hi ${NAME.split(" ")[0]},`,
      "",
      "Your Qwertymates account is ready. Open the Qwertymates Android app and sign in, then change your password in Settings.",
      "",
      `Name: ${NAME}`,
      `Email: ${EMAIL}`,
      `Username: ${userDoc.username}`,
      `Phone: ${PHONE_RAW} (+${phone})`,
      `Temporary password: ${PASSWORD}`,
      `Date of birth on file: ${DOB}`,
      "",
      "App: Qwertymates on Google Play (com.qwertymates)",
      "Website: https://www.qwertymates.com",
      "",
      "Please change the password after you sign in.",
      "",
      "— Qwertymates support",
    ].join("\n");

    try {
      const mail = await sendEmail({
        to: EMAIL,
        subject: "Your Qwertymates account credentials",
        text: creds,
      });
      console.log("Email sent:", mail.messageId, mail.accepted);
    } catch (e) {
      console.error("Email failed:", e?.message || e);
    }

    try {
      const wa = await sendWhatsApp(phone, creds);
      console.log("WhatsApp sent:", wa.sid);
    } catch (e) {
      console.error("WhatsApp failed:", e?.message || e);
    }

    // Ops copy (no secrets beyond confirming notify) — include password only for ops recovery
    try {
      await sendEmail({
        to: process.env.PLATFORM_OPS_EMAIL || "administrator@qwertymates.com",
        subject: `[Qwertymates] Account provisioned: ${NAME}`,
        text: `Provisioned account for ${NAME}\nEmail: ${EMAIL}\nUsername: ${userDoc.username}\nPhone: +${phone}\nTemp password: ${PASSWORD}\nCreated: ${created}\nPassword reset: ${passwordReset}\nUser id: ${userDoc._id}\n`,
      });
    } catch (e) {
      console.error("Ops email failed:", e?.message || e);
    }
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
