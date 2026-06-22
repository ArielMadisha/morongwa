/**
 * Create approved Morongwa TV image posts from school profile avatar + gallery URLs (upload paths).
 * Skips URLs that already appear on any post by the same creator (dedupe).
 *
 * From backend/:
 *   npx ts-node-dev --transpile-only --exit-child scripts/postSchoolProfileMediaToTv.ts --dry-run
 *   npx ts-node-dev --transpile-only --exit-child scripts/postSchoolProfileMediaToTv.ts --country-codes=LS,ZM,ZW,NA --max-per-school=4
 */

import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";
import User from "../src/data/models/User";
import TVPost from "../src/data/models/TVPost";
import { buildSchoolTvCaption, buildSchoolTvHashtags } from "./lib/schoolTvPostCopy";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

type FourCountry = "LS" | "ZM" | "ZW" | "NA";

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

const LIMIT_SCHOOLS_RAW = argValue("--limit=");
const LIMIT_SCHOOLS = LIMIT_SCHOOLS_RAW ? Math.max(1, parseInt(LIMIT_SCHOOLS_RAW, 10) || 0) : undefined;

const MAX_PER_SCHOOL_RAW = argValue("--max-per-school=");
const MAX_PER_SCHOOL = MAX_PER_SCHOOL_RAW ? Math.max(1, parseInt(MAX_PER_SCHOOL_RAW, 10) || 1) : 4;

const DEFAULT_COUNTRIES: FourCountry[] = ["LS", "ZM", "ZW", "NA"];

function parseCountryCodes(): FourCountry[] {
  const raw = (argValue("--country-codes=") || "").trim();
  if (!raw) return DEFAULT_COUNTRIES;
  const parts = raw
    .split(/[,;\s]+/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const allowed = new Set<string>(["LS", "ZM", "ZW", "NA"]);
  const out: FourCountry[] = [];
  for (const p of parts) {
    if (allowed.has(p)) out.push(p as FourCountry);
  }
  return out.length ? out : DEFAULT_COUNTRIES;
}

function uniqPaths(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of urls) {
    const t = (u || "").trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

async function main() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error("MONGO_URI not set");
    process.exit(1);
  }

  const countries = parseCountryCodes();
  console.log(`Countries: ${countries.join(", ")}`);
  console.log(`Max images per school: ${MAX_PER_SCHOOL}${DRY ? " (dry-run)" : ""}`);

  await mongoose.connect(mongoUri);

  const all = await User.find({
    isSchoolAccount: true,
    countryCode: { $in: countries },
  })
    .select("name avatar profileGalleryUrls countryCode")
    .sort({ name: 1 })
    .lean();

  let schools = all.filter((s) => {
    const av = typeof s.avatar === "string" && s.avatar.trim().length > 0;
    const gal =
      Array.isArray(s.profileGalleryUrls) && s.profileGalleryUrls.some((u) => typeof u === "string" && u.trim());
    return av || gal;
  });

  if (LIMIT_SCHOOLS !== undefined) {
    schools = schools.slice(0, LIMIT_SCHOOLS);
  }

  console.log(`Schools with avatar or gallery: ${schools.length}`);

  let postsCreated = 0;
  let skippedDup = 0;
  let skippedNoMedia = 0;

  for (const s of schools) {
    const name = (s.name || "").trim() || "School";
    const avatar = typeof s.avatar === "string" ? s.avatar.trim() : "";
    const gallery = Array.isArray(s.profileGalleryUrls) ? s.profileGalleryUrls.filter(Boolean) : [];
    const urls = uniqPaths([...gallery, ...(avatar ? [avatar] : [])]).slice(0, MAX_PER_SCHOOL);

    if (urls.length === 0) {
      skippedNoMedia += 1;
      continue;
    }

    for (const mediaUrl of urls) {
      const dup = await TVPost.findOne({
        creatorId: s._id,
        mediaUrls: mediaUrl,
      })
        .select("_id")
        .lean();
      if (dup) {
        skippedDup += 1;
        continue;
      }

      if (DRY) {
        console.log(`[dry-run] post for ${name}: ${mediaUrl}`);
        postsCreated += 1;
        continue;
      }

      await TVPost.create({
        creatorId: s._id,
        type: "image",
        mediaUrls: [mediaUrl],
        caption: buildSchoolTvCaption(name),
        hashtags: buildSchoolTvHashtags(name),
        genre: "family",
        hasWatermark: true,
        status: "approved",
        likeCount: 0,
        commentCount: 0,
        shareCount: 0,
        viewCount: 0,
      });
      postsCreated += 1;
    }
  }

  await mongoose.disconnect();
  console.log(
    `\nDone. posts_created=${postsCreated}, skipped_duplicate_media=${skippedDup}, skipped_no_media=${skippedNoMedia}, dry_run=${DRY}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
