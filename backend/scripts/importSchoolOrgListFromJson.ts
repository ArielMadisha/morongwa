/**
 * Import school organisation users from a JSON name list (supplements OSM import).
 *
 * **Lesotho context:** A common reference is the 2010 PSLE results document (school names as
 * examination centres), often shared on Scribd:
 *   https://www.scribd.com/doc/44890069/2010-PSLE-Results-Lesotho
 * That site usually blocks automated downloads — paste unique school names into the JSON `names`
 * array (or a UTF-8 text file, one name per line, and convert to JSON). Prefer official sources when
 * possible, e.g. Ministry of Education and Training Lesotho school listings:
 *   http://www.education.gov.ls/schools.php
 *
 * **Recommended first step for Lesotho:** OpenStreetMap (no manual list needed):
 *   npm run import:schools-osm -- --country=LS --dry-run
 *   npm run import:schools-osm -- --country=LS
 *
 * This script then adds any **extra** names from JSON without duplicating existing school accounts
 * for the same country (exact name + normalised key overlap, same rules as Botswana Gov JSS import).
 *
 * From backend/:
 *   npm run import:schools-from-json -- --country=LS --json=src/data/lesothoExternalSchoolNames.json --dry-run
 *   npm run import:schools-from-json -- --country=LS --json=src/data/lesothoExternalSchoolNames.json
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
const EMAIL_DOMAIN = (
  process.env.SCHOOL_IMPORT_EMAIL_DOMAIN ||
  process.env.BW_SCHOOL_IMPORT_EMAIL_DOMAIN ||
  "legacy-user.com"
)
  .trim()
  .toLowerCase();

type SupportedIso = "LS" | "ZM" | "ZW" | "NA" | "BW";

const COUNTRY_META: Record<
  SupportedIso,
  { preferredCurrency: string; usernamePrefix: string }
> = {
  LS: { preferredCurrency: "LSL", usernamePrefix: "lslist" },
  ZM: { preferredCurrency: "ZMW", usernamePrefix: "zmlist" },
  ZW: { preferredCurrency: "ZWL", usernamePrefix: "zwlist" },
  NA: { preferredCurrency: "NAD", usernamePrefix: "nalist" },
  BW: { preferredCurrency: "BWP", usernamePrefix: "bwlist" },
};

const MIN_SUBKEY = 8;

function normName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\s*\(GIS\)/gi, " (GIS)")
    .replace(/\s*GIS\s*$/i, " (GIS)");
}

/** Normalised token for dedupe across “X High School”, “X”, “X H.S.”, etc. */
export function schoolDedupeKey(name: string): string {
  return normName(name)
    .toLowerCase()
    .replace(/\bcjss\b/g, "")
    .replace(/\bc\.?j\.?s\.?s\.?\b/g, "")
    .replace(/\bcommunity\b/g, "")
    .replace(/\bjunior\b/g, "")
    .replace(/\bsecondary\b/g, "")
    .replace(/\bhigh\b/g, "")
    .replace(/\bprimary\b/g, "")
    .replace(/\bpreparatory\b/g, "")
    .replace(/\bschool\b/g, "")
    .replace(/\bcollege\b/g, "")
    .replace(/\bmedium\b/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function keysConflict(a: string, b: string): boolean {
  if (a === b) return true;
  const L = MIN_SUBKEY;
  if (a.length >= L && b.length >= L && (a.includes(b) || b.includes(a))) return true;
  return false;
}

function listImportUsername(prefix: string, displayName: string): string {
  const key = schoolDedupeKey(displayName);
  const h = crypto.createHash("sha256").update(`${prefix}:${key}`).digest("hex").slice(0, 14);
  return `${prefix}${h}`;
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

async function hasSchoolByNormName(iso: SupportedIso, norm: string): Promise<boolean> {
  const esc = norm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^${esc}$`, "i");
  const hit = await User.findOne({
    countryCode: iso,
    isSchoolAccount: true,
    name: re,
  })
    .select("_id")
    .lean();
  return !!hit;
}

type DedupeState = { keys: Set<string> };

function buildDedupeState(keys: string[]): DedupeState {
  return { keys: new Set(keys.filter(Boolean)) };
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

  const rawIso = (argValue("--country=") || "").trim().toUpperCase();
  if (!rawIso || !(rawIso in COUNTRY_META)) {
    console.error("Pass --country=LS|ZM|ZW|NA|BW");
    process.exit(1);
  }
  const iso = rawIso as SupportedIso;
  const meta = COUNTRY_META[iso];

  const jsonPath = path.resolve(
    __dirname,
    "..",
    argValue("--json=") ||
      (iso === "LS" ? "src/data/lesothoExternalSchoolNames.json" : `src/data/${iso.toLowerCase()}ExternalSchoolNames.json`)
  );

  if (!fs.existsSync(jsonPath)) {
    console.error(`Missing JSON file: ${jsonPath}`);
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(jsonPath, "utf8")) as { names?: string[] };
  const list = Array.isArray(raw.names) ? raw.names.map((n) => normName(String(n))).filter((n) => n.length >= 2) : [];

  if (list.length === 0) {
    console.error(`No names in ${jsonPath} — add a JSON array "names": ["School A", ...]`);
    process.exit(1);
  }

  await mongoose.connect(mongoUri);

  const existingDocs = await User.find({ countryCode: iso, isSchoolAccount: true })
    .select("name")
    .lean();

  const existingKeys = existingDocs.map((u: any) => schoolDedupeKey(String(u.name || ""))).filter((k) => k.length > 0);
  const state = buildDedupeState(existingKeys);

  let created = 0;
  let skippedDupExact = 0;
  let skippedDedupeKey = 0;
  let skippedLimit = 0;
  let skippedUsername = 0;

  for (const name of list) {
    if (LIMIT !== undefined && created >= LIMIT) {
      skippedLimit += 1;
      continue;
    }

    const key = schoolDedupeKey(name);

    if (await hasSchoolByNormName(iso, name)) {
      skippedDupExact += 1;
      if (DRY) console.log(`[dry-run] skip exact name: ${name}`);
      continue;
    }

    if (conflictsWithState(state, key)) {
      skippedDedupeKey += 1;
      if (DRY) console.log(`[dry-run] skip dedupe overlap: ${name}`);
      continue;
    }

    const username = listImportUsername(meta.usernamePrefix, name);
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

    const emailLocal = `list-${username}`;
    const email = await uniqueEmail(emailLocal);
    const passwordHash = await bcrypt.hash(crypto.randomBytes(24).toString("hex") + username + name, 10);

    await User.create({
      name,
      username,
      email,
      passwordHash,
      role: ["client"],
      countryCode: iso,
      preferredCurrency: meta.preferredCurrency,
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
    `\nDone (${iso}). created=${created}, skipped_exact_name=${skippedDupExact}, skipped_dedupe_key=${skippedDedupeKey}, skipped_username=${skippedUsername}, skipped_limit_tail=${skippedLimit}, dry_run=${DRY}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
