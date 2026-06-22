/**
 * Import Botswana school profiles from OpenStreetMap (amenity=school inside BW).
 *
 * Data is © OpenStreetMap contributors, ODbL — https://www.openstreetmap.org/copyright
 *
 * Usernames are `bwn{id}` / `bww{id}` / `bwr{id}` (node/way/relation) so they do not match
 * the numeric-only SA handle pattern (avoids wrong "ZA" badge on Botswana schools).
 * When OSM has `phone` / `contact:phone` / `contact:mobile`, it is normalized to E.164 **+267…** and stored on the user.
 * **No placeholder names:** features without a name (or `name:*` / `official_name` / `short_name` / `alt_name` in OSM)
 * are **skipped** — we do not invent school titles.
 *
 * From backend/:
 *   npx ts-node-dev --transpile-only --exit-child scripts/importBotswanaSchoolsOsm.ts --dry-run
 *   npx ts-node-dev --transpile-only --exit-child scripts/importBotswanaSchoolsOsm.ts --limit=200
 *   npx ts-node-dev --transpile-only --exit-child scripts/importBotswanaSchoolsOsm.ts
 *
 * Options:
 *   --dry-run              Log only, no DB writes
 *   --limit=<n>            Import at most n schools (after dedupe / skip existing)
 */

import dotenv from "dotenv";
import path from "path";
import crypto from "crypto";
import axios from "axios";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "../src/data/models/User";
import { phoneFromOsmTags } from "./botswanaContact";

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

const OVERPASS_URL = process.env.OVERPASS_API_URL || "https://overpass-api.de/api/interpreter";
const EMAIL_DOMAIN = (process.env.BW_SCHOOL_IMPORT_EMAIL_DOMAIN || "legacy-user.com").trim().toLowerCase();

type OsmEl = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

function typePrefix(t: string): "n" | "w" | "r" {
  if (t === "way") return "w";
  if (t === "relation") return "r";
  return "n";
}

function usernameFor(el: OsmEl): string {
  return `bw${typePrefix(el.type)}${el.id}`;
}

/**
 * School display name only from OSM tags present on the feature (no invented labels).
 */
function schoolNameFromOsmTags(tags: Record<string, string> | undefined): string | null {
  if (!tags) return null;

  const ordered: string[] = [];
  const push = (v: string | undefined) => {
    if (v && typeof v === "string") ordered.push(v);
  };

  push(tags.name);
  push(tags["name:en"]);
  push(tags.official_name);
  push(tags.short_name);
  push(tags["name:tn"]);
  push(tags["name:af"]);

  const altFirst = tags.alt_name?.split(/[;/]/)[0]?.trim();
  push(altFirst);

  for (const k of Object.keys(tags).sort()) {
    if (k.startsWith("name:") && !["name:en", "name:tn", "name:af"].includes(k)) {
      push(tags[k]);
    }
  }

  for (const c of ordered) {
    const t = c.trim();
    if (t.length >= 2) return t.slice(0, 200);
  }
  return null;
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

const OVERPASS_QUERY = `[out:json][timeout:600];
area["ISO3166-1"="BW"]->.a;
(
  node["amenity"="school"](area.a);
  way["amenity"="school"](area.a);
  relation["amenity"="school"](area.a);
);
out center tags;
`;

async function fetchOsmSchools(): Promise<OsmEl[]> {
  const { data } = await axios.post(
    OVERPASS_URL,
    new URLSearchParams({ data: OVERPASS_QUERY }).toString(),
    {
      timeout: 620_000,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "MorongwaSchoolImport/1.0 (Botswana OSM school import)",
        Accept: "application/json",
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    }
  );
  const elements = data?.elements;
  if (!Array.isArray(elements)) return [];
  return elements.filter((e: OsmEl) => e && typeof e.id === "number" && ["node", "way", "relation"].includes(e.type));
}

async function main() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error("MONGO_URI not set");
    process.exit(1);
  }

  console.log("Fetching OSM schools in Botswana (may take several minutes)…");
  const elements = await fetchOsmSchools();
  console.log(`OSM elements (school): ${elements.length}`);

  await mongoose.connect(mongoUri);

  let created = 0;
  let skippedExisting = 0;
  let skippedLimit = 0;
  let skippedNoOsmName = 0;

  for (const el of elements) {
    if (LIMIT !== undefined && created >= LIMIT) {
      skippedLimit += 1;
      continue;
    }
    const username = usernameFor(el);
    const exists = await User.findOne({ username }).select("_id").lean();
    if (exists) {
      skippedExisting += 1;
      continue;
    }

    const name = schoolNameFromOsmTags(el.tags);
    if (!name) {
      skippedNoOsmName += 1;
      continue;
    }

    const emailLocal = `bw-${typePrefix(el.type)}${el.id}`;

    const phone = phoneFromOsmTags(el.tags);

    if (DRY) {
      console.log(
        `[dry-run] would create: ${username} | ${name} | ${emailLocal}@${EMAIL_DOMAIN}${phone ? ` | ${phone}` : ""}`
      );
      created += 1;
      continue;
    }

    const email = await uniqueEmail(emailLocal);

    const passwordHash = await bcrypt.hash(
      crypto.randomBytes(24).toString("hex") + username + String(el.id),
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
      ...(phone ? { phone } : {}),
    });
    created += 1;
    if (created % 50 === 0) {
      console.log(`…created ${created}`);
    }
  }

  await mongoose.disconnect();
  console.log(
    `\nDone. created=${created}, skipped_existing_username=${skippedExisting}, skipped_no_name_in_osm=${skippedNoOsmName}, skipped_after_limit=${skippedLimit}, dry_run=${DRY}`
  );
  console.log("Attribution: school locations/names from OpenStreetMap, ODbL — display on a public credits page if required.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
