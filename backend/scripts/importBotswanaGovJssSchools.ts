/**
 * Import Government Junior Secondary Schools (CJSS) from curated JSON (parsed from official Gov BW PDF).
 *
 * Primary source PDF: https://gov.bw/sites/default/files/2020-03/Government%20Junior%20Secondary%20Schools.pdf
 * Listing is often mirrored on Scribd; the canonical machine-readable list in-repo is:
 *   `src/data/botswanaGovJssSchoolNames.json`
 * Refresh JSON after updating the PDF: `npm run parse:bw-gov-jss-pdf`
 *
 * Deduping (no duplicate schools):
 * - Exact display name match (case-insensitive) on existing BW `isSchoolAccount` users
 * - Normalized “dedupe key” match: strips CJSS / Community / Junior / Secondary / School and compares;
 *   also skips if an existing name’s key strictly contains the new key (≥8 chars) or vice versa
 *
 * Usernames: `bwjss` + 14 hex (sha256 of normalized name) — distinct from OSM `bwn…` / Wikipedia `bwwiki…`.
 *
 * From backend/:
 *   npm run import:bw-gov-jss -- --dry-run
 *   npm run import:bw-gov-jss
 *   npm run import:bw-gov-jss -- --limit=20
 */

import dotenv from "dotenv";
import path from "path";
import fs from "fs";
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

const JSON_PATH = path.resolve(__dirname, "../src/data/botswanaGovJssSchoolNames.json");

const MIN_SUBKEY = 8;

export function normName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\s*\(GIS\)/gi, " (GIS)")
    .replace(/\s*GIS\s*$/i, " (GIS)");
}

/** Collapses “Badale CJSS”, “Badale Community Junior Secondary School”, etc. to one comparable token. */
export function schoolDedupeKey(name: string): string {
  return normName(name)
    .toLowerCase()
    .replace(/\bcjss\b/g, "")
    .replace(/\bc\.?j\.?s\.?s\.?\b/g, "")
    .replace(/\bcommunity\b/g, "")
    .replace(/\bjunior\b/g, "")
    .replace(/\bsecondary\b/g, "")
    .replace(/\bschool\b/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function keysConflict(a: string, b: string): boolean {
  if (a === b) return true;
  const L = MIN_SUBKEY;
  if (a.length >= L && b.length >= L && (a.includes(b) || b.includes(a))) return true;
  return false;
}

function jssUsername(displayName: string): string {
  const key = schoolDedupeKey(displayName);
  const h = crypto.createHash("sha256").update(key).digest("hex").slice(0, 14);
  return `bwjss${h}`;
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

type DedupeState = { keys: Set<string> };

function buildDedupeState(names: { name: string; key: string }[]): DedupeState {
  return { keys: new Set(names.map((n) => n.key).filter(Boolean)) };
}

function conflictsWithState(state: DedupeState, key: string): boolean {
  if (!key) return false;
  if (state.keys.has(key)) return true;
  for (const ek of state.keys) {
    if (keysConflict(ek, key)) return true;
  }
  return false;
}

function addToState(state: DedupeState, key: string) {
  state.keys.add(key);
}

async function main() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error("MONGO_URI not set");
    process.exit(1);
  }
  if (!fs.existsSync(JSON_PATH)) {
    console.error(`Missing ${JSON_PATH} — run npm run parse:bw-gov-jss-pdf first`);
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(JSON_PATH, "utf8")) as { names?: string[]; sourceUrl?: string };
  const list = Array.isArray(raw.names) ? raw.names.map((n) => normName(String(n))).filter((n) => n.length >= 2) : [];

  await mongoose.connect(mongoUri);

  const existingDocs = await User.find({ countryCode: "BW", isSchoolAccount: true })
    .select("name")
    .lean();

  const existingPairs = existingDocs
    .map((u: any) => ({
      name: String(u.name || ""),
      key: schoolDedupeKey(String(u.name || "")),
    }))
    .filter((p) => p.key.length > 0);

  const state = buildDedupeState(existingPairs);

  let created = 0;
  let skippedDupExact = 0;
  let skippedDedupeKey = 0;
  let skippedLimit = 0;
  let skippedUsername = 0;

  for (const rawName of list) {
    if (LIMIT !== undefined && created >= LIMIT) {
      skippedLimit += 1;
      continue;
    }

    const name = normName(rawName);
    const key = schoolDedupeKey(name);

    if (await hasBwSchoolByNormName(name)) {
      skippedDupExact += 1;
      if (DRY) console.log(`[dry-run] skip exact BW name: ${name}`);
      continue;
    }

    if (conflictsWithState(state, key)) {
      skippedDedupeKey += 1;
      if (DRY) console.log(`[dry-run] skip dedupe-key overlap: ${name} (${key})`);
      continue;
    }

    const username = jssUsername(name);
    if (await User.findOne({ username }).select("_id").lean()) {
      skippedUsername += 1;
      if (DRY) console.log(`[dry-run] skip username exists: ${username}`);
      continue;
    }

    if (DRY) {
      console.log(`[dry-run] would create: ${username} | ${name}`);
      created += 1;
      addToState(state, key);
      continue;
    }

    const emailLocal = `jss-${username}`;
    const email = await uniqueEmail(emailLocal);
    const passwordHash = await bcrypt.hash(crypto.randomBytes(24).toString("hex") + username + name, 10);

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
    addToState(state, key);
    created += 1;
    console.log(`Created: ${name} (${username})`);
  }

  await mongoose.disconnect();
  console.log(
    `\nDone. created=${created}, skipped_exact_name=${skippedDupExact}, skipped_dedupe_key=${skippedDedupeKey}, skipped_username=${skippedUsername}, skipped_limit_tail=${skippedLimit}, dry_run=${DRY}`
  );
  console.log(`Source list: ${raw.sourceUrl || "see botswanaGovJssSchoolNames.json"}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
