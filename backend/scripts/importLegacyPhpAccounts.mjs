import "dotenv/config";
import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const repoRoot = path.resolve(process.cwd(), "..");
const envPath = path.join(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  // dotenv/config already loaded, this keeps script self-contained when run from backend/
}

const LEGACY_ACCOUNTS = [
  { login: "Arielm", password: "761208@Am" },
  { login: "Secretsofthebible", password: "761208@Am" },
  { login: "UAT", password: "XmN6u#nnwW" },
  { login: "Worldofsport", password: "Ytrewq1234" },
  { login: "Burkinafaso", password: "11111111" },
  { login: "Entertainment", password: "Entertain@1234" },
  { login: "MyUnisa", password: "761208@Am" },
  { login: "Qwerty_motoring", password: "Qgear@1234" },
  { login: "Qwertymates@icloud.com", password: "XmN6u#nnwW" },
  { login: "Uatnational", password: "xmN6u#nnwW" },
];

function isEmail(value) {
  return /\S+@\S+\.\S+/.test(String(value || ""));
}

function usernameFromLogin(login) {
  const base = String(login || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "");
  return base || "legacyuser";
}

function escapeRegExp(input) {
  return String(input).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function uniqueEmail(users, baseEmail) {
  const [local, domain] = String(baseEmail).toLowerCase().split("@");
  let candidate = `${local}@${domain}`;
  let i = 0;
  while (await users.findOne({ email: candidate }, { projection: { _id: 1 } })) {
    i += 1;
    candidate = `${local}${i}@${domain}`;
  }
  return candidate;
}

async function findByLogin(users, login) {
  const raw = String(login || "").trim();
  if (!raw) return null;
  if (isEmail(raw)) {
    return users.findOne({
      $or: [{ email: raw.toLowerCase() }, { email: { $regex: `^${escapeRegExp(raw)}$`, $options: "i" } }],
    });
  }
  const uname = usernameFromLogin(raw);
  return users.findOne({
    $or: [{ username: uname }, { username: { $regex: `^${escapeRegExp(uname)}$`, $options: "i" } }],
  });
}

async function main() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) throw new Error("MONGO_URI not set");

  await mongoose.connect(mongoUri);
  const users = mongoose.connection.collection("users");

  let created = 0;
  let updated = 0;
  let withAvatar = 0;

  for (const row of LEGACY_ACCOUNTS) {
    const login = String(row.login || "").trim();
    const password = String(row.password || "");
    const passwordHash = await bcrypt.hash(password, 10);

    const existing = await findByLogin(users, login);
    if (existing) {
      if (existing.avatar) withAvatar += 1;
      await users.updateOne(
        { _id: existing._id },
        {
          $set: {
            passwordHash,
            active: true,
            locked: false,
            suspended: false,
            importedFromLegacy: true,
            updatedAt: new Date(),
          },
        }
      );
      updated += 1;
      continue;
    }

    const username = isEmail(login) ? usernameFromLogin(login.split("@")[0]) : usernameFromLogin(login);
    const baseEmail = isEmail(login) ? login.toLowerCase() : `${username}@legacy-user.com`;
    const email = await uniqueEmail(users, baseEmail);

    await users.insertOne({
      name: login,
      username,
      email,
      passwordHash,
      role: ["client"],
      isVerified: true,
      active: true,
      suspended: false,
      locked: false,
      importedFromLegacy: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      __v: 0,
    });
    created += 1;
  }

  console.log(`legacy_accounts_processed=${LEGACY_ACCOUNTS.length}`);
  console.log(`created=${created}`);
  console.log(`updated=${updated}`);
  console.log(`existing_with_avatar=${withAvatar}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});

