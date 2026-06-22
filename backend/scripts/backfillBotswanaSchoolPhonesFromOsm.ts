/**
 * One-off: match OSM Botswana school import usernames (bw[nwr]<id>) to latest OSM tags
 * and set `phone` (+267 E.164) when OSM has contact:phone / phone / mobile.
 *
 *   npm run backfill:bw-school-phones-osm -- --dry-run
 *   npm run backfill:bw-school-phones-osm
 *   npm run backfill:bw-school-phones-osm -- --force   # overwrite existing phone
 */

import dotenv from "dotenv";
import path from "path";
import axios from "axios";
import mongoose from "mongoose";
import User from "../src/data/models/User";
import { phoneFromOsmTags } from "./botswanaContact";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const FORCE = args.includes("--force");

const OVERPASS_URL = process.env.OVERPASS_API_URL || "https://overpass-api.de/api/interpreter";

type OsmEl = {
  type: "node" | "way" | "relation";
  id: number;
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
        "User-Agent": "MorongwaSchoolPhoneBackfill/1.0",
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

  console.log("Fetching OSM schools (Botswana)…");
  const elements = await fetchOsmSchools();
  const phoneByUsername = new Map<string, string>();
  for (const el of elements) {
    const ph = phoneFromOsmTags(el.tags);
    if (!ph) continue;
    phoneByUsername.set(usernameFor(el), ph);
  }
  console.log(`OSM schools with a phone tag: ${phoneByUsername.size} / ${elements.length}`);

  await mongoose.connect(mongoUri);

  const users = await User.find({
    countryCode: "BW",
    username: /^bw[nwr]\d+$/i,
  })
    .select("_id username phone")
    .lean();

  let updated = 0;
  let skippedNoOsmPhone = 0;
  let skippedHasPhone = 0;

  for (const u of users) {
    const uname = String(u.username || "");
    const ph = phoneByUsername.get(uname);
    if (!ph) {
      skippedNoOsmPhone += 1;
      continue;
    }
    const existing = (u as { phone?: string }).phone;
    if (existing && String(existing).trim() && !FORCE) {
      skippedHasPhone += 1;
      continue;
    }
    if (DRY) {
      console.log(`[dry-run] would set phone ${uname} -> ${ph}`);
      updated += 1;
      continue;
    }
    await User.updateOne({ _id: u._id }, { $set: { phone: ph } });
    updated += 1;
  }

  await mongoose.disconnect();
  console.log(
    `\nDone. updated=${updated}, skipped_no_osm_phone=${skippedNoOsmPhone}, skipped_already_has_phone=${skippedHasPhone}, dry_run=${DRY}, force=${FORCE}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
