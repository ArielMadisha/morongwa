/**
 * Import "notable schools" listed on Wikipedia: List of schools in Botswana.
 *
 * Source (CC BY-SA; check Wikipedia terms): https://en.wikipedia.org/wiki/List_of_schools_in_Botswana
 * Only the **explicit school names** in `WIKIPEDIA_SCHOOL_NAMES` are imported — no extra fields
 * beyond what the User model requires (synthetic email, random password hash, BW / school flags).
 * Wikipedia notes this is a dynamic / incomplete list — supplement with OSM import
 * (`importBotswanaSchoolsOsm`) or official registers as needed.
 *
 * Usernames: `bwwiki` + 14 hex (sha256 of normalized name) — distinct from OSM `bwn…` ids.
 * Skips if a Botswana school user with the same normalized display name already exists.
 *
 * From backend/:
 *   npm run import:bw-schools-wiki -- --dry-run
 *   npm run import:bw-schools-wiki
 */

import dotenv from "dotenv";
import path from "path";
import crypto from "crypto";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "../src/data/models/User";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");

function argValue(prefix: string): string | undefined {
  const hit = args.find((a) => a.startsWith(prefix));
  if (!hit) return undefined;
  const rest = hit.slice(prefix.length).trim();
  if (rest) return rest;
  const i = args.indexOf(hit);
  const next = args[i + 1];
  return next && !next.startsWith("--") ? next : undefined;
}

const LIMIT_RAW = argValue("--limit=");
const LIMIT = LIMIT_RAW ? Math.max(1, parseInt(LIMIT_RAW, 10) || 0) : undefined;

const EMAIL_DOMAIN = (process.env.BW_SCHOOL_IMPORT_EMAIL_DOMAIN || "legacy-user.com").trim().toLowerCase();

/** Snapshot aligned with Wikipedia article sections (not exhaustive nationally). */
const WIKIPEDIA_SCHOOL_NAMES: string[] = [
  // Francistown
  "Francistown Senior Secondary School",
  "John Mackenzie School",
  "Mater Spei College",
  "Eastern Gate Academy",
  // Gaborone
  "Botho University",
  "Maru a Pula School",
  "St. Joseph's College, Kgale",
  "Westwood International School",
  "Rainbow High School",
  "Botswana Accountancy College",
  "University of Botswana",
  "Limkokwing University of Creative Technology",
  "University of Agriculture and Natural Resources",
  "Naledi Senior Secondary School",
  "Gaborone Senior Secondary School",
  "Gaborone International School (GIS)",
  "Al-nur International School",
  "Livingstone Kolobeng College (LKC)",
  // Lobatse
  "Lobatse Senior Secondary School",
  "Itireleng Community Junior Secondary School",
  "Ipelegeng Community Junior Secondary School",
  "Letsopa Community Junior Secondary School",
  "Crescent School",
  // North-East District
  "Masunga Senior Secondary School",
];

function normName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\s*\(GIS\)/gi, " (GIS)")
    .replace(/\s*GIS\s*$/i, " (GIS)");
}

function wikiUsername(name: string): string {
  const key = normName(name).toLowerCase();
  const h = crypto.createHash("sha256").update(key).digest("hex").slice(0, 14);
  return `bwwiki${h}`;
}

async function uniqueEmail(localBase: string): Promise<string> {
  const local = localBase.toLowerCase().replace(/[^a-z0-9._+-]/g, "").slice(0, 60) || "school";
  let candidate = `${local}@${EMAIL_DOMAIN}`;
  let n = 0;
  while (await User.findOne({ email: candidate }).select("_id").lean()) {
    n += 1;
    candidate = `${local}+${n}@${EMAIL_DOMAIN}`;
  }
  return candidate;
}

async function hasBwSchoolByNormName(norm: string): Promise<boolean> {
  const esc = norm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^${esc}$`, "i");
  const hit = await User.findOne({
    countryCode: "BW",
    isSchoolAccount: true,
    name: re,
  })
    .select("_id")
    .lean();
  return !!hit;
}

async function main() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error("MONGO_URI not set");
    process.exit(1);
  }

  await mongoose.connect(mongoUri);

  let created = 0;
  let skippedDupName = 0;
  let skippedUsername = 0;
  let skippedLimit = 0;

  for (const raw of WIKIPEDIA_SCHOOL_NAMES) {
    if (LIMIT !== undefined && created >= LIMIT) {
      skippedLimit += 1;
      continue;
    }
    const name = normName(raw);
    if (name.length < 2) continue;

    if (await hasBwSchoolByNormName(name)) {
      skippedDupName += 1;
      if (DRY) console.log(`[dry-run] skip (BW school name exists): ${name}`);
      continue;
    }

    const username = wikiUsername(name);
    if (await User.findOne({ username }).select("_id").lean()) {
      skippedUsername += 1;
      if (DRY) console.log(`[dry-run] skip (username exists): ${username} ${name}`);
      continue;
    }

    const emailLocal = `wiki-${username}`;
    if (DRY) {
      console.log(`[dry-run] would create: ${username} | ${name} | ${emailLocal}@${EMAIL_DOMAIN}`);
      created += 1;
      continue;
    }

    const email = await uniqueEmail(emailLocal);
    const passwordHash = await bcrypt.hash(
      crypto.randomBytes(24).toString("hex") + username + name,
      10
    );

    await User.create({
      name,
      username,
      email,
      passwordHash,
      role: ["client"],
      countryCode: "BW",
      preferredCurrency: "BWP",
      isVerified: false,
      active: true,
      suspended: false,
      locked: false,
      isSchoolAccount: true,
      importedFromLegacy: false,
    });
    created += 1;
    console.log(`Created: ${name} (${username})`);
  }

  await mongoose.disconnect();
  console.log(
    `\nDone. created=${created}, skipped_dup_bw_name=${skippedDupName}, skipped_username=${skippedUsername}, skipped_limit_tail=${skippedLimit}, dry_run=${DRY}`
  );
  console.log("Source: https://en.wikipedia.org/wiki/List_of_schools_in_Botswana (CC BY-SA).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
