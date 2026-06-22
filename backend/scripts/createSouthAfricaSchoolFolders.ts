/**
 * Create one local folder per South African school (gallery / media staging).
 *
 * Sources:
 *   --source=osm     All named OSM amenity=school in ZA (thousands; default for full coverage)
 *   --source=mongo   Qwertymates DB school orgs only (~500 legacy SA imports)
 *   --source=both    Union of both (unique folders)
 *
 * Usage (from backend/):
 *   npx ts-node-dev --transpile-only --exit-child scripts/createSouthAfricaSchoolFolders.ts --source=osm --root="C:/path/to/Schools"
 *   ... --dry-run
 */

import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import axios from "axios";
import mongoose from "mongoose";
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

const ROOT_RAW = (argValue("--root=") || "").trim();
const SOURCE_RAW = (argValue("--source=") || "osm").trim().toLowerCase();

if (!ROOT_RAW) {
  console.error('Provide --root="C:\\path\\to\\Schools"');
  process.exit(1);
}
if (!["osm", "mongo", "both"].includes(SOURCE_RAW)) {
  console.error("--source must be osm, mongo, or both");
  process.exit(1);
}

const ROOT = path.resolve(ROOT_RAW);

const OVERPASS_MIRRORS = [
  process.env.OVERPASS_API_URL,
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
].filter(Boolean) as string[];

/** Query smaller areas if the country-wide query fails or times out. */
const ZA_PROVINCES = [
  "Eastern Cape",
  "Free State",
  "Gauteng",
  "KwaZulu-Natal",
  "Limpopo",
  "Mpumalanga",
  "Northern Cape",
  "North West",
  "Western Cape",
];

type OsmEl = {
  type: string;
  id: number;
  tags?: Record<string, string>;
};

type SchoolEntry = {
  name: string;
  osmType: string;
  osmId: number;
};

function sanitizeFolderName(name: string): string {
  let s = String(name || "")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.+$/g, "");
  if (!s) s = "Unnamed school";
  if (s.length > 160) s = s.slice(0, 160).trim();
  return s;
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
  push(tags.alt_name?.split(/[;/]/)[0]?.trim());
  push(tags["name:af"]);
  push(tags["name:zu"]);
  push(tags["name:xh"]);
  for (const c of ordered) {
    const t = c.trim();
    if (t.length >= 2) return t.slice(0, 200);
  }
  return null;
}

/** Display label for every OSM feature — unnamed rows use operator/ref/OSM id (no invented proper names). */
function displayNameFromOsm(el: OsmEl): string {
  const named = schoolNameFromOsmTags(el.tags);
  if (named) return named;
  const tags = el.tags || {};
  const operator = String(tags.operator || "").trim();
  if (operator.length >= 2) return operator.slice(0, 200);
  const brand = String(tags.brand || "").trim();
  if (brand.length >= 2) return brand.slice(0, 200);
  const ref = String(tags.ref || tags["ref:school"] || "").trim();
  if (ref.length >= 1) return `School ref ${ref}`.slice(0, 200);
  const amenity = String(tags.amenity || tags.building || "school").trim();
  return `School ${amenity} ${el.type.charAt(0)}${el.id}`;
}

function folderNameForEntry(entry: SchoolEntry, usedBase: Map<string, number>): string {
  const base = sanitizeFolderName(entry.name);
  const key = base.toLowerCase();
  const count = (usedBase.get(key) || 0) + 1;
  usedBase.set(key, count);
  if (count === 1) return base;
  const suffix = `${entry.osmType.charAt(0)}${entry.osmId}`;
  const candidate = `${base} (${suffix})`;
  if (candidate.length <= 200) return candidate;
  return `${base.slice(0, 180).trim()} (${suffix})`;
}

async function postOverpass(query: string): Promise<OsmEl[]> {
  let lastErr: unknown;
  for (const url of OVERPASS_MIRRORS) {
    try {
      const { data } = await axios.post(
        url,
        new URLSearchParams({ data: query }).toString(),
        {
          timeout: 900_000,
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "QwertymatesSchoolFolderSetup/1.0 (ZA OSM school folders)",
            Accept: "application/json",
          },
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
          validateStatus: (s) => s >= 200 && s < 300,
        }
      );
      const elements = data?.elements;
      if (!Array.isArray(elements)) return [];
      return elements.filter(
        (e: OsmEl) => e && typeof e.id === "number" && ["node", "way", "relation"].includes(e.type)
      );
    } catch (e) {
      lastErr = e;
      console.warn(`Overpass ${url} failed:`, e instanceof Error ? e.message : e);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("All Overpass mirrors failed");
}

function elementsToEntries(elements: OsmEl[]): SchoolEntry[] {
  const byOsm = new Map<string, SchoolEntry>();
  for (const el of elements) {
    const key = `${el.type}/${el.id}`;
    if (byOsm.has(key)) continue;
    byOsm.set(key, { name: displayNameFromOsm(el), osmType: el.type, osmId: el.id });
  }
  return [...byOsm.values()];
}

/** Broad ZA coverage (~19k–20k OSM features; national EMIS lists ~25k — not all are in OSM yet). */
const ZA_SCHOOL_OVERPASS_UNION = `(
  nwr["amenity"~"^(school|kindergarten|college|preschool|university|childcare|language_school)$"](area.a);
  nwr["building"~"^(school|kindergarten)$"](area.a);
  nwr["landuse"="education"](area.a);
  nwr["school"](area.a);
  nwr["isced:level"](area.a);
);`;

async function fetchOsmZaByProvince(province: string): Promise<SchoolEntry[]> {
  const query = `[out:json][timeout:300];
area["name"="${province}"]["admin_level"="4"]["is_in:country_code"="ZA"]->.a;
${ZA_SCHOOL_OVERPASS_UNION}
out tags;`;
  return elementsToEntries(await postOverpass(query));
}

async function fetchOsmZaCountry(): Promise<SchoolEntry[]> {
  const query = `[out:json][timeout:900];
area["ISO3166-1"="ZA"]->.a;
${ZA_SCHOOL_OVERPASS_UNION}
out tags;`;
  return elementsToEntries(await postOverpass(query));
}

async function fetchOsmZaSchoolEntries(): Promise<SchoolEntry[]> {
  console.log(
    "Fetching OSM schools for South Africa (broad education tags; all features including unnamed)…"
  );
  const merged = new Map<string, SchoolEntry>();

  try {
    const country = await fetchOsmZaCountry();
    for (const e of country) merged.set(`${e.osmType}/${e.osmId}`, e);
    console.log(`Country-wide query: ${country.length} features (${merged.size} unique)`);
  } catch (e) {
    console.warn("Country-wide Overpass query failed:", e instanceof Error ? e.message : e);
  }

  for (const prov of ZA_PROVINCES) {
    console.log(`  Province: ${prov}…`);
    try {
      const batch = await fetchOsmZaByProvince(prov);
      let added = 0;
      for (const e of batch) {
        const k = `${e.osmType}/${e.osmId}`;
        if (!merged.has(k)) added += 1;
        merged.set(k, e);
      }
      console.log(`    batch ${batch.length}, +${added} new (total ${merged.size})`);
    } catch (err) {
      console.warn(`    skipped ${prov}:`, err instanceof Error ? err.message : err);
    }
    await new Promise((r) => setTimeout(r, 1200));
  }

  return [...merged.values()];
}

const SA_SCHOOL_MONGO_FILTER = {
  isSchoolAccount: true,
  countryCode: { $ne: "BW" },
  username: { $not: /^bw[nwr]/i },
};

async function entriesFromMongo(): Promise<SchoolEntry[]> {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) return [];
  await mongoose.connect(mongoUri);
  const rows = await User.find(SA_SCHOOL_MONGO_FILTER).select("name _id").sort({ name: 1 }).lean();
  await mongoose.disconnect();
  return rows
    .map((r) => ({
      name: String(r.name || "").trim(),
      osmType: "db",
      osmId: Number.parseInt(String(r._id).slice(-8), 16) || 0,
    }))
    .filter((e) => e.name.length >= 2);
}

function mergeEntries(a: SchoolEntry[], b: SchoolEntry[]): SchoolEntry[] {
  const m = new Map<string, SchoolEntry>();
  for (const e of [...a, ...b]) {
    const k = e.osmType === "db" ? `db/${e.osmId}` : `${e.osmType}/${e.osmId}`;
    if (!m.has(k)) m.set(k, e);
  }
  return [...m.values()].sort((x, y) => x.name.localeCompare(y.name, "en"));
}

async function mkdirBatch(dirs: string[]): Promise<{ created: number; existed: number }> {
  let created = 0;
  let existed = 0;
  const batch = 200;
  for (let i = 0; i < dirs.length; i += batch) {
    const slice = dirs.slice(i, i + batch);
    await Promise.all(
      slice.map(async (dir) => {
        try {
          await fs.promises.mkdir(dir, { recursive: true });
          created += 1;
        } catch (e: unknown) {
          const err = e as NodeJS.ErrnoException;
          if (err?.code === "EEXIST") existed += 1;
          else throw e;
        }
      })
    );
    if ((i + batch) % 2000 === 0 || i + batch >= dirs.length) {
      console.log(`  …${Math.min(i + batch, dirs.length)} / ${dirs.length} folders`);
    }
  }
  return { created, existed };
}

async function main() {
  if (!fs.existsSync(ROOT)) fs.mkdirSync(ROOT, { recursive: true });
  if (!fs.statSync(ROOT).isDirectory()) {
    console.error("Not a directory:", ROOT);
    process.exit(1);
  }

  let osmEntries: SchoolEntry[] = [];
  let mongoEntries: SchoolEntry[] = [];

  if (SOURCE_RAW === "osm" || SOURCE_RAW === "both") {
    osmEntries = await fetchOsmZaSchoolEntries();
  }
  if (SOURCE_RAW === "mongo" || SOURCE_RAW === "both") {
    console.log("Loading Qwertymates school org names from MongoDB…");
    mongoEntries = await entriesFromMongo();
    console.log(`MongoDB: ${mongoEntries.length} schools`);
  }

  const entries =
    SOURCE_RAW === "both" ? mergeEntries(osmEntries, mongoEntries) : SOURCE_RAW === "mongo" ? mongoEntries : osmEntries;

  if (entries.length === 0) {
    console.error("No school entries found.");
    process.exit(1);
  }

  const usedBase = new Map<string, number>();
  const folderPaths: string[] = [];
  const manifest: Array<{ folder: string; name: string; osmType: string; osmId: number }> = [];

  for (const entry of entries) {
    const folder = folderNameForEntry(entry, usedBase);
    folderPaths.push(path.join(ROOT, folder));
    manifest.push({ folder, name: entry.name, osmType: entry.osmType, osmId: entry.osmId });
  }

  let created = 0;
  let existed = 0;
  if (DRY) {
    created = folderPaths.filter((d) => !fs.existsSync(d)).length;
    existed = folderPaths.length - created;
  } else {
    console.log(`Creating ${folderPaths.length} folders under ${ROOT}…`);
    const r = await mkdirBatch(folderPaths.filter((d) => !fs.existsSync(d)));
    created = r.created;
    existed = folderPaths.length - created;
    const manifestPath = path.join(ROOT, "_osm-school-folders-manifest.json");
    fs.writeFileSync(manifestPath, JSON.stringify({ generatedAt: new Date().toISOString(), source: SOURCE_RAW, count: manifest.length, schools: manifest }, null, 2));
    console.log(`Wrote manifest: ${manifestPath}`);
  }

  console.log(`Source: ${SOURCE_RAW}`);
  console.log(`OSM entries: ${osmEntries.length}`);
  if (SOURCE_RAW === "both" || SOURCE_RAW === "mongo") console.log(`Mongo entries: ${mongoEntries.length}`);
  console.log(`Total folders: ${folderPaths.length}`);
  console.log(`Created: ${created}${DRY ? " (dry-run)" : ""}`);
  console.log(`Already existed: ${existed}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
