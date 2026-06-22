/**
 * Bulk-create Qwertymates accounts from a tab-separated Users.txt export.
 *
 * Usage (from backend/):
 *   npx tsx scripts/importUsersFromTxt.ts --file="C:\Users\Dell\Downloads\Users.txt" --limit=50 --dry-run
 *   npx tsx scripts/importUsersFromTxt.ts --file="C:\Users\Dell\Downloads\Users.txt" --limit=50
 *   npx tsx scripts/importUsersFromTxt.ts --file="..." --limit=50 --push-avatars
 *
 * Default password: Qwertymates2026!  (override with BULK_SIGNUP_DEFAULT_PASSWORD in .env)
 */
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { spawnSync } from "child_process";
import User from "../src/data/models/User";
import Wallet from "../src/data/models/Wallet";
import { canonicalPhoneDigits } from "../src/utils/phoneE164";
import { computePhoneLocale } from "../src/utils/phoneCountryCurrency";
import { inferUserGender, type InferredGender } from "./lib/inferUserGender";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const PUSH_AVATARS = args.includes("--push-avatars");

function argValue(prefix: string): string | undefined {
  const hit = args.find((a) => a.startsWith(prefix));
  if (!hit) return undefined;
  const rest = hit.slice(prefix.length).trim();
  if (rest) return rest;
  const i = args.indexOf(hit);
  const next = args[i + 1];
  return next && !next.startsWith("--") ? next : undefined;
}

const FILE = (
  argValue("--file=") ||
  "C:\\Users\\Dell\\Downloads\\Users.txt"
).trim();
const LIMIT = Math.max(1, parseInt(argValue("--limit=") || "50", 10) || 50);
const DEFAULT_PASSWORD =
  process.env.BULK_SIGNUP_DEFAULT_PASSWORD?.trim() || "Qwertymates2026!";

const ASSETS_DIR = path.resolve(__dirname, "../assets/bulk-signup-avatars");
const UPLOAD_STOCK_DIR = path.resolve(__dirname, "../uploads/avatars/stock");

const MALE_AVATARS = ["male-1.png", "male-2.png", "male-3.png", "male-4.png"];
const FEMALE_AVATARS = ["female-1.png", "female-2.png", "female-3.png"];

type ParsedRow = {
  line: number;
  givenName: string;
  surname: string;
  phoneRaw: string;
  phone: string;
  displayName: string;
  gender: InferredGender;
};

type ResultRow = {
  line: number;
  name: string;
  phone: string;
  username: string;
  email: string;
  gender: InferredGender;
  avatar: string;
  status: "created" | "skipped_exists" | "skipped_invalid" | "dry_run";
  userId?: string;
};

function parseUsersFile(filePath: string): ParsedRow[] {
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  const out: ParsedRow[] = [];
  const seenPhones = new Set<string>();

  const maxLine = Math.min(lines.length, LIMIT + 1);
  for (let i = 1; i < maxLine; i++) {
    const line = lines[i];
    const parts = line.split(/\t/).map((p) => p.trim());
    if (parts.length < 3) continue;

    const givenName = parts[0] || "";
    const surname = parts[1] || "";
    const phoneRaw = parts[2] || "";
    const phone = canonicalPhoneDigits(phoneRaw) || "";
    if (!phone || phone.length < 10) continue;
    if (seenPhones.has(phone)) continue;
    seenPhones.add(phone);

    const displayName = `${givenName} ${surname}`.replace(/\s+/g, " ").trim();
    out.push({
      line: i + 1,
      givenName,
      surname,
      phoneRaw,
      phone,
      displayName,
      gender: inferUserGender(givenName, surname),
    });
  }
  return out;
}

function pickAvatar(gender: InferredGender): string {
  const pool = gender === "female" ? FEMALE_AVATARS : MALE_AVATARS;
  const file = pool[crypto.randomInt(0, pool.length)];
  return `/uploads/avatars/stock/${file}`;
}

function ensureStockAvatarsOnDisk(): void {
  fs.mkdirSync(UPLOAD_STOCK_DIR, { recursive: true });
  for (const file of [...MALE_AVATARS, ...FEMALE_AVATARS]) {
    const src = path.join(ASSETS_DIR, file);
    const dest = path.join(UPLOAD_STOCK_DIR, file);
    if (!fs.existsSync(src)) {
      throw new Error(`Missing stock avatar asset: ${src}`);
    }
    if (!fs.existsSync(dest)) {
      fs.copyFileSync(src, dest);
    }
  }
}

async function uniqueUsername(base: string): Promise<string> {
  let candidate = base.slice(0, 30);
  let n = 0;
  while (await User.findOne({ username: candidate }).select("_id").lean()) {
    n += 1;
    candidate = `${base}${n}`.slice(0, 30);
  }
  return candidate;
}

async function main() {
  if (!fs.existsSync(FILE)) {
    throw new Error(`Users file not found: ${FILE}`);
  }

  const rows = parseUsersFile(FILE);
  console.log(`Parsed ${rows.length} users from ${FILE} (limit ${LIMIT})`);

  ensureStockAvatarsOnDisk();

  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) throw new Error("MONGO_URI not set");
  await mongoose.connect(mongoUri);

  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
  const results: ResultRow[] = [];
  let created = 0;
  let skipped = 0;

  for (const row of rows) {
    const usernameBase = row.phone;
    const email = `user_${row.phone}@signup.qwertymates.local`;
    const avatar = pickAvatar(row.gender);

    const existing = await User.findOne({
      $or: [{ phone: row.phone }, { username: usernameBase }, { email }],
    })
      .select("_id username phone")
      .lean();

    if (existing) {
      skipped += 1;
      results.push({
        line: row.line,
        name: row.displayName,
        phone: row.phone,
        username: String(existing.username || usernameBase),
        email,
        gender: row.gender,
        avatar,
        status: "skipped_exists",
        userId: String(existing._id),
      });
      continue;
    }

    if (DRY) {
      results.push({
        line: row.line,
        name: row.displayName,
        phone: row.phone,
        username: usernameBase,
        email,
        gender: row.gender,
        avatar,
        status: "dry_run",
      });
      continue;
    }

    const username = await uniqueUsername(usernameBase);
    const userData: Record<string, unknown> = {
      name: row.displayName,
      username,
      email,
      phone: row.phone,
      passwordHash,
      role: ["client"],
      avatar,
      isVerified: true,
      active: true,
      suspended: false,
      locked: false,
    };
    const loc = computePhoneLocale(row.phone);
    if (loc.countryCode) Object.assign(userData, loc);

    const user = await User.create(userData);
    await Wallet.create({ user: user._id });
    created += 1;

    results.push({
      line: row.line,
      name: row.displayName,
      phone: row.phone,
      username,
      email,
      gender: row.gender,
      avatar,
      status: "created",
      userId: String(user._id),
    });
  }

  const reportPath = path.resolve(
    __dirname,
    "../exports",
    `bulk-users-import-${Date.now()}.json`
  );
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        sourceFile: FILE,
        limit: LIMIT,
        dryRun: DRY,
        defaultPassword: DRY ? "(not applied in dry-run)" : DEFAULT_PASSWORD,
        created,
        skipped,
        results,
      },
      null,
      2
    ),
    "utf8"
  );

  console.log(`created=${created} skipped_existing=${skipped} dry_run=${DRY}`);
  console.log(`report=${reportPath}`);

  await mongoose.disconnect();

  if (PUSH_AVATARS && !DRY && created > 0) {
    console.log("Pushing stock avatars to production uploads…");
    const push = spawnSync(
      process.execPath,
      [path.join(__dirname, "pushBulkSignupAvatarsRemote.mjs")],
      { stdio: "inherit", cwd: path.resolve(__dirname, "..") }
    );
    if (push.status !== 0) {
      console.warn("WARN: avatar push failed — run: node scripts/pushBulkSignupAvatarsRemote.mjs");
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
