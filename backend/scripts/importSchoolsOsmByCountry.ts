/**
 * Import school org profiles from OpenStreetMap (amenity=school) for a given ISO 3166-1 alpha-2 country.
 * Same rules as Botswana: no invented names — features without a usable name in OSM tags are skipped.
 *
 * Usernames: `{prefix}{n|w|r}{osm-id}` (e.g. Lesotho node 1 → `lsn1`) so they stay distinct from SA numeric handles.
 *
 * From backend/:
 *   npx ts-node-dev --transpile-only --exit-child scripts/importSchoolsOsmByCountry.ts --country=LS --dry-run
 *   npx ts-node-dev --transpile-only --exit-child scripts/importSchoolsOsmByCountry.ts --country=ZM --limit=100
 *   npx ts-node-dev --transpile-only --exit-child scripts/importSchoolsOsmByCountry.ts --all-four
 *
 * To merge extra names from a ministry list / PSLE PDF (after OSM), see `importSchoolOrgListFromJson.ts`
 * and `npm run import:schools-from-json -- --country=LS --json=src/data/lesothoExternalSchoolNames.json`.
 */

import dotenv from "dotenv";
import path from "path";
import crypto from "crypto";
import axios from "axios";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import type { CountryCode } from "libphonenumber-js";
import User from "../src/data/models/User";
import { phoneFromOsmTags } from "./osmSchoolPhone";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const RUN_ALL = args.includes("--all-four");

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
const EMAIL_DOMAIN = (
  process.env.SCHOOL_IMPORT_EMAIL_DOMAIN ||
  process.env.BW_SCHOOL_IMPORT_EMAIL_DOMAIN ||
  "legacy-user.com"
)
  .trim()
  .toLowerCase();

type OsmEl = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

export type SchoolImportCountryKey = "LS" | "ZM" | "ZW" | "NA";

type CountryImportConfig = {
  iso: SchoolImportCountryKey;
  userPrefix: string;
  preferredCurrency: string;
  phoneCountry: CountryCode;
  label: string;
};

const COUNTRY_CONFIG: Record<SchoolImportCountryKey, CountryImportConfig> = {
  LS: { iso: "LS", userPrefix: "ls", preferredCurrency: "LSL", phoneCountry: "LS", label: "Lesotho" },
  ZM: { iso: "ZM", userPrefix: "zm", preferredCurrency: "ZMW", phoneCountry: "ZM", label: "Zambia" },
  ZW: { iso: "ZW", userPrefix: "zw", preferredCurrency: "ZWL", phoneCountry: "ZW", label: "Zimbabwe" },
  NA: { iso: "NA", userPrefix: "na", preferredCurrency: "NAD", phoneCountry: "NA", label: "Namibia" },
};

function typePrefix(t: string): "n" | "w" | "r" {
  if (t === "way") return "w";
  if (t === "relation") return "r";
  return "n";
}

function usernameFor(prefix: string, el: OsmEl): string {
  return `${prefix}${typePrefix(el.type)}${el.id}`;
}

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

  const altFirst = tags.alt_name?.split(/[;/]/)[0]?.trim();
  push(altFirst);

  for (const k of Object.keys(tags).sort()) {
    if (k.startsWith("name:") && k !== "name:en") {
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

function overpassQuery(iso: SchoolImportCountryKey): string {
  return `[out:json][timeout:600];
area["ISO3166-1"="${iso}"]->.a;
(
  node["amenity"="school"](area.a);
  way["amenity"="school"](area.a);
  relation["amenity"="school"](area.a);
);
out center tags;
`;
}

async function fetchOsmSchools(iso: SchoolImportCountryKey, label: string): Promise<OsmEl[]> {
  const { data } = await axios.post(
    OVERPASS_URL,
    new URLSearchParams({ data: overpassQuery(iso) }).toString(),
    {
      timeout: 620_000,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": `MorongwaSchoolImport/1.0 (${label} OSM schools)`,
        Accept: "application/json",
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    }
  );
  const elements = data?.elements;
  if (!Array.isArray(elements)) return [];
  return elements.filter(
    (e: OsmEl) => e && typeof e.id === "number" && ["node", "way", "relation"].includes(e.type)
  );
}

async function importOneCountry(cfg: CountryImportConfig): Promise<void> {
  console.log(`\n======== ${cfg.label} (${cfg.iso}) ========`);
  console.log(`Fetching OSM schools (may take several minutes)…`);
  const elements = await fetchOsmSchools(cfg.iso, cfg.label);
  console.log(`OSM elements (amenity=school): ${elements.length}`);

  let created = 0;
  let skippedExisting = 0;
  let skippedLimit = 0;
  let skippedNoOsmName = 0;

  for (const el of elements) {
    if (LIMIT !== undefined && created >= LIMIT) {
      skippedLimit += 1;
      continue;
    }
    const username = usernameFor(cfg.userPrefix, el);
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

    const emailLocal = `${cfg.userPrefix}-${typePrefix(el.type)}${el.id}`;
    const phone = phoneFromOsmTags(el.tags, cfg.phoneCountry);

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
      countryCode: cfg.iso,
      preferredCurrency: cfg.preferredCurrency,
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

  console.log(
    `${cfg.iso} done. created=${created}, skipped_existing_username=${skippedExisting}, skipped_no_name_in_osm=${skippedNoOsmName}, skipped_after_limit=${skippedLimit}, dry_run=${DRY}`
  );
}

async function main() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error("MONGO_URI not set");
    process.exit(1);
  }

  let countries: SchoolImportCountryKey[];
  if (RUN_ALL) {
    countries = ["LS", "ZM", "ZW", "NA"];
  } else {
    const raw = (argValue("--country=") || "").trim().toUpperCase();
    if (!raw || !(raw in COUNTRY_CONFIG)) {
      console.error(
        "Pass --country=LS|ZM|ZW|NA or --all-four. Example: --country=LS --dry-run"
      );
      process.exit(1);
    }
    countries = [raw as SchoolImportCountryKey];
  }

  await mongoose.connect(mongoUri);

  try {
    for (const code of countries) {
      await importOneCountry(COUNTRY_CONFIG[code]);
    }
  } finally {
    await mongoose.disconnect();
  }

  console.log(
    "\nAttribution: school locations/names from OpenStreetMap, ODbL — https://www.openstreetmap.org/copyright"
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
