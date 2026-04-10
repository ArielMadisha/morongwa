import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "../src/data/models/User";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

type LegacyAccount = { login: string; password: string };

const LEGACY_ACCOUNTS: LegacyAccount[] = [
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

function isEmail(value: string): boolean {
  return /\S+@\S+\.\S+/.test(value);
}

function usernameFromLogin(login: string): string {
  const base = String(login || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "");
  return base || "legacyuser";
}

function emailFromUsername(username: string): string {
  return `${username}@legacy-user.com`;
}

async function uniqueEmail(baseEmail: string): Promise<string> {
  const [local, domain] = baseEmail.split("@");
  let candidate = baseEmail.toLowerCase();
  let n = 0;
  while (await User.findOne({ email: candidate }).select("_id").lean()) {
    n += 1;
    candidate = `${local}${n}@${domain}`.toLowerCase();
  }
  return candidate;
}

async function findExistingByLogin(login: string) {
  const value = String(login || "").trim();
  if (!value) return null;
  if (isEmail(value)) {
    return User.findOne({
      $or: [
        { email: value.toLowerCase() },
        { email: new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
      ],
    });
  }
  const uname = usernameFromLogin(value);
  return User.findOne({
    $or: [
      { username: uname },
      { username: new RegExp(`^${uname.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
    ],
  });
}

async function main() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error("MONGO_URI not set");
  }

  await mongoose.connect(mongoUri);

  let created = 0;
  let updated = 0;
  let withAvatar = 0;

  for (const account of LEGACY_ACCOUNTS) {
    const login = String(account.login || "").trim();
    const password = String(account.password || "");
    const passwordHash = await bcrypt.hash(password, 10);

    const existing = await findExistingByLogin(login);
    if (existing) {
      existing.passwordHash = passwordHash;
      existing.active = true;
      existing.locked = false;
      existing.suspended = false;
      existing.importedFromLegacy = true;
      if (existing.avatar) withAvatar += 1;
      await existing.save();
      updated += 1;
      continue;
    }

    const uname = usernameFromLogin(login);
    const email = isEmail(login) ? login.toLowerCase() : await uniqueEmail(emailFromUsername(uname));
    const username = isEmail(login) ? usernameFromLogin(login.split("@")[0]) : uname;

    await User.create({
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

