/**
 * Backfill avatar + gallery for users with isSchoolAccount: true using Google Programmable Search (image search).
 *
 * Prerequisites:
 * 1. Tag school org accounts: e.g. in MongoDB:
 *    db.users.updateMany({ name: /Ramotse Primary School/i }, { $set: { isSchoolAccount: true } })
 * 2. Create a Programmable Search Engine at https://programmablesearchengine.google.com/ (search the entire web, Image search ON).
 * 3. (Recommended) Set in backend/.env for best coverage (Google Image search):
 *    GOOGLE_CUSTOM_SEARCH_API_KEY=<API key from Google Cloud Console>
 *    GOOGLE_CUSTOM_SEARCH_ENGINE_ID=<cx id from the search engine>
 *    Without these, the script falls back to Wikimedia Commons + Openverse (fewer hits for small schools).
 *
 * Run (from backend/):  npm run backfill:school-photos
 * Dry run (no DB writes, no downloads):  npm run backfill:school-photos -- --dry-run
 * Force replace existing avatar/gallery:  npm run backfill:school-photos -- --force
 * Large batches (10k–30k+ schools): use **--bulk** (fewer Google calls per school) + **--only-missing**
 * (DB filter — skips rows that already have avatar + 2 gallery images) + **--checkpoint=** + **--resume**
 * after each batch. Enable **billing** on Google Custom Search for meaningful web-image volume; free tier
 * is ~100 queries/day. Cap total Google calls: **--google-max-total=8000** then re-run with **--resume**.
 * Zero-Google bulk (slower, sparser): **--bulk --no-google --allow-fallback-only**
 *   npm run backfill:school-photos:bulk -- --country-code=BW
 *   npm run backfill:school-photos -- --bulk --country-code=BW --checkpoint=exports/bw-photos.ckpt.json --resume --limit=500
 * Legacy offset paging (no checkpoint):
 *   npm run backfill:school-photos -- --sleep-ms=250 --offset=0 --limit=500
 * Small batches: npm run backfill:school-photos:batch -- --name=school --offset=0
 * When Custom Search quota is exhausted:
 *   npm run backfill:school-photos:fallback-batch -- --name=school --offset=0
 * Profile picture only (fewer queries / downloads):  --avatar-only
 * Only users whose name matches (substring, case-insensitive), e.g. Madutle Primary School:
 *   npm run backfill:school-photos -- --name="Madutle"
 * Tag matched users as school accounts before backfill:
 *   npm run backfill:school-photos -- --name="Madutle" --tag-as-school
 *
 * Legal: You must have rights to use images you store; Google Custom Search JSON API terms apply.
 * Facebook/Instagram do not allow automated scraping. When Google keys are set, optional queries use
 * site:facebook.com so **Google’s image index** may return publicly indexed FB-hosted photos — not logged-in scraping.
 * This tool automates discovery only — review results for each school where needed.
 */

import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import axios, { isAxiosError } from "axios";
import mongoose from "mongoose";
import User from "../src/data/models/User";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const API_KEY = process.env.GOOGLE_CUSTOM_SEARCH_API_KEY;
const CX = process.env.GOOGLE_CUSTOM_SEARCH_ENGINE_ID;
const UPLOADS_REL = "/uploads/profiles";

let warnedGoogleMissing = false;
/** When true, Custom Search is skipped for the rest of the process (bad key / API disabled). */
let googleCircuitOpen = false;
let googleCircuitReasonLogged = false;
let lastGoogleQueryMs = 0;
/** Incremented on each Custom Search HTTP request; optional hard cap via --google-max-total / env. */
let googleCallsThisRun = 0;
let GOOGLE_MAX_TOTAL = 0;

function parseGoogleApiError(data: unknown): { reasons: string; message: string } {
  try {
    const err = (data as { error?: { message?: string; errors?: Array<{ reason?: string }> } })?.error;
    const reasons = Array.isArray(err?.errors)
      ? err.errors.map((e) => String(e?.reason || "")).filter(Boolean).join(", ")
      : "";
    const message = String(err?.message || "");
    return { reasons, message };
  } catch {
    return { reasons: "", message: "" };
  }
}

function googleLooksLikeQuotaIssue(reasons: string, message: string): boolean {
  const r = `${reasons} ${message}`.toLowerCase();
  return (
    r.includes("quota") ||
    r.includes("rate limit") ||
    r.includes("ratelimit") ||
    r.includes("daily limit") ||
    r.includes("dailylimitexceeded") ||
    r.includes("usageratelimit")
  );
}

/** Free tier is ~100 queries/day; further calls return 429 until billing or next day. */
function googleLooksLikeDailyQuotaExhausted(reasons: string, message: string): boolean {
  const r = `${reasons} ${message}`.toLowerCase();
  return r.includes("queries per day") || (r.includes("quota exceeded") && r.includes("per day"));
}

function googleLooksLikeFatalConfig(reasons: string, message: string): boolean {
  const r = `${reasons} ${message}`.toLowerCase();
  return (
    r.includes("accessnotconfigured") ||
    r.includes("api key not valid") ||
    r.includes("keyinvalid") ||
    r.includes("iprefererblocked") ||
    r.includes("refererblocked") ||
    r.includes("forbidden") && r.includes("api key")
  );
}

async function throttleGoogleQuery(): Promise<void> {
  if (GOOGLE_QUERY_PAUSE_MS <= 0) return;
  const now = Date.now();
  const wait = GOOGLE_QUERY_PAUSE_MS - (now - lastGoogleQueryMs);
  if (wait > 0) await sleep(wait);
}

async function probeGoogleCustomSearchOnce(): Promise<void> {
  if (!API_KEY || !CX || googleCircuitOpen) return;
  if (GOOGLE_MAX_TOTAL > 0 && googleCallsThisRun >= GOOGLE_MAX_TOTAL) {
    googleCircuitOpen = true;
    return;
  }
  await throttleGoogleQuery();
  lastGoogleQueryMs = Date.now();
  try {
    googleCallsThisRun += 1;
    await axios.get("https://www.googleapis.com/customsearch/v1", {
      params: {
        key: API_KEY,
        cx: CX,
        q: "school",
        searchType: "image",
        num: 1,
        safe: "active",
      },
      timeout: 20000,
    });
    console.log("Google Custom Search probe: OK (image search responding).");
  } catch (e: unknown) {
    if (!isAxiosError(e)) {
      console.warn("Google Custom Search probe failed:", e instanceof Error ? e.message : e);
      return;
    }
    const status = e.response?.status;
    const { reasons, message } = parseGoogleApiError(e.response?.data);
    const detail = [reasons && `reasons=${reasons}`, message && message.slice(0, 280)].filter(Boolean).join(" | ");
    console.error(`Google Custom Search probe failed: HTTP ${status ?? "?"}${detail ? ` — ${detail}` : ""}`);
    console.error(
      "Fix checklist: (1) Google Cloud Console → enable API 'Custom Search API'. " +
        "(2) API key: Application restrictions = None (server script) or IP; do not use HTTP referrer only. " +
        "(3) API key: API restrictions = Custom Search API. " +
        "(4) programmablesearchengine.google.com → Image search ON, Search entire web. " +
        "(5) Free tier ~100 queries/day; enable billing for higher quota. " +
        "Use --google-sleep-ms=300..500 and small --limit to reduce 429s."
    );
    if (
      status === 429 &&
      googleLooksLikeDailyQuotaExhausted(reasons, message)
    ) {
      googleCircuitOpen = true;
      console.log(
        "Disabling Google Custom Search for this run: daily query quota exhausted. " +
          "Link billing on the GCP project or wait until the quota resets; then re-run. Wikimedia/Openverse still used."
      );
      return;
    }
    if (status === 403 && !googleLooksLikeQuotaIssue(reasons, message) && googleLooksLikeFatalConfig(reasons, message)) {
      googleCircuitOpen = true;
      console.log("Disabling Google Custom Search for this run (configuration error). Wikimedia/Openverse still used.");
    }
  }
}

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const FORCE = args.includes("--force");
const TAG_AS_SCHOOL = args.includes("--tag-as-school");
const ALLOW_FALLBACK_ONLY = args.includes("--allow-fallback-only");
const AVATAR_ONLY = args.includes("--avatar-only");
const SKIP_FACEBOOK_SITE = args.includes("--skip-facebook-site");
const SKIP_GOOGLE_PROBE = args.includes("--skip-google-probe");
/** Wikidata + Wikimedia + Openverse only; no Custom Search (use when quota exhausted). */
const NO_GOOGLE = args.includes("--no-google");
/** Fewer Google calls per school; Wikimedia/Openverse for most discovery; implies --only-missing unless --force. */
const BULK = args.includes("--bulk");
/** Continue after last _id stored in checkpoint file (use with --checkpoint=). */
const RESUME = args.includes("--resume");
const HELP = args.includes("--help") || args.includes("-h");
const LIMIT_RAW = argValue("--limit=");
const LIMIT = LIMIT_RAW ? Math.max(1, parseInt(LIMIT_RAW, 10) || 0) : undefined;
const OFFSET_RAW = argValue("--offset=");
const OFFSET = OFFSET_RAW ? Math.max(0, parseInt(OFFSET_RAW, 10) || 0) : 0;
const CHECKPOINT_PATH_RAW = (argValue("--checkpoint=") || "").trim();
const CHECKPOINT_PATH = CHECKPOINT_PATH_RAW
  ? path.isAbsolute(CHECKPOINT_PATH_RAW)
    ? CHECKPOINT_PATH_RAW
    : path.resolve(__dirname, "..", CHECKPOINT_PATH_RAW)
  : "";
const GOOGLE_MAX_TOTAL_RAW = argValue("--google-max-total=");
/** Only process school accounts still missing avatar or (unless --avatar-only) fewer than 2 gallery images. */
const ONLY_MISSING =
  args.includes("--only-missing") || (BULK && !FORCE);
const SLEEP_MS_RAW = argValue("--sleep-ms=");
const SLEEP_MS = SLEEP_MS_RAW ? Math.max(0, parseInt(SLEEP_MS_RAW, 10) || 0) : 0;
const GOOGLE_SLEEP_MS_RAW = argValue("--google-sleep-ms=");
const GOOGLE_QUERY_PAUSE_MS =
  GOOGLE_SLEEP_MS_RAW !== undefined
    ? Math.max(0, parseInt(GOOGLE_SLEEP_MS_RAW, 10) || 0)
    : Math.max(0, parseInt(process.env.GOOGLE_CUSTOM_SEARCH_QUERY_PAUSE_MS || "0", 10) || 0);

function argValue(prefix: string): string | undefined {
  const hit = args.find((a) => a.startsWith(prefix));
  if (!hit) return undefined;
  const rest = hit.slice(prefix.length).trim();
  if (rest) return rest;
  const i = args.indexOf(hit);
  const next = args[i + 1];
  return next && !next.startsWith("--") ? next : undefined;
}

function getNameSubstring(): string {
  const eq = argValue("--name=");
  if (eq) return eq.trim();
  const idx = args.indexOf("--name");
  if (idx >= 0 && args[idx + 1] && !args[idx + 1].startsWith("--")) {
    return args[idx + 1].trim();
  }
  return "";
}

/** Substring match on display name (case-insensitive). */
const NAME_SUBSTRING = getNameSubstring();

const COUNTRY_CODE_RAW = (argValue("--country-code=") || "").trim().toUpperCase();
const COUNTRY_CODE_FILTER =
  COUNTRY_CODE_RAW && /^[A-Z]{2}$/.test(COUNTRY_CODE_RAW) ? COUNTRY_CODE_RAW : "";

const ISO_TO_SCENE_REGION: Record<string, string> = {
  LS: "Lesotho",
  ZM: "Zambia",
  ZW: "Zimbabwe",
  NA: "Namibia",
  BW: "Botswana",
  ZA: "South Africa",
};

const SCENE_REGION =
  COUNTRY_CODE_FILTER && ISO_TO_SCENE_REGION[COUNTRY_CODE_FILTER]
    ? ISO_TO_SCENE_REGION[COUNTRY_CODE_FILTER]
    : "South Africa";

function printHelp(): void {
  console.log(`
School profile image backfill

Usage:
  npm run backfill:school-photos -- [options]

Options:
  --dry-run                  Preview only (no downloads, no DB writes)
  --force                    Replace avatar/gallery even when already set
  --name="<substring>"       Only users whose display name includes substring
  --country-code=LS        Only school accounts with this ISO country (e.g. LS,ZM,ZW,NA); improves scene image queries
  --tag-as-school            When used with --name, sets isSchoolAccount=true first
  --limit=<n>                Process at most n matching users
  --offset=<n>               Skip first n matching users (stable sort by name)
  --sleep-ms=<n>             Pause n ms between schools (rate limits / politeness)
  --avatar-only              Only set avatar; skip gallery (fewer API calls)
  --skip-facebook-site       Omit extra Google queries site:facebook.com (saves API quota)
  --google-sleep-ms=<n>    Pause n ms between each Custom Search API call (reduces 429 bursts)
  --skip-google-probe        Skip one-query startup check (saves 1 API call)
  --no-google                Never call Custom Search (Wikidata/Wikimedia/Openverse only; quota-safe)
  --allow-fallback-only      Allow Wikimedia/Openverse-only mode at large scale
  --bulk                     Low-API mode for 10k+ schools (skips heavy Google query chains; uses Commons/Openverse more)
  --only-missing             Mongo filter: only users missing avatar or gallery (default with --bulk unless --force)
  --checkpoint=<path>        JSON file storing lastProcessedId for resume (relative to backend/ if not absolute)
  --resume                   With --checkpoint, continue after lastProcessedId (sorts by _id ascending)
  --google-max-total=<n>     Stop all Google Custom Search calls after n requests this run (then use --resume)
  --help, -h                 Show this help

Required for high coverage at scale:
  GOOGLE_CUSTOM_SEARCH_API_KEY
  GOOGLE_CUSTOM_SEARCH_ENGINE_ID
`);
}

/** Mongo fragment: needs avatar or more gallery slots (unless --avatar-only handled in main). */
function needsMediaMongoFilter(avatarOnly: boolean): Record<string, unknown> {
  const missingAvatar = {
    $or: [{ avatar: { $exists: false } }, { avatar: null }, { avatar: "" }],
  } as Record<string, unknown>;
  if (avatarOnly) return missingAvatar;
  const missingGallery = {
    $or: [
      { profileGalleryUrls: { $exists: false } },
      { profileGalleryUrls: { $size: 0 } },
      { $expr: { $lt: [{ $size: { $ifNull: ["$profileGalleryUrls", []] } }, 2] } },
    ],
  };
  return { $or: [missingAvatar, missingGallery] };
}

const WikidataUa = { "User-Agent": "QwertymatesSchoolMediaBot/1.0 (profile backfill; +https://qwertymates.com)" };

function commonsFilePathUrl(filename: string): string {
  const trimmed = filename.trim().replace(/^File:/i, "");
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(trimmed).replace(/%20/g, "_")}`;
}

/** Wikidata P154 (logo) / P18 (image) on educational institutions — no API key. */
async function wikidataSchoolImageCandidates(schoolName: string): Promise<string[]> {
  const api = "https://www.wikidata.org/w/api.php";
  try {
    const { data: searchData } = await axios.get(api, {
      params: {
        action: "wbsearchentities",
        search: schoolName,
        language: "en",
        type: "item",
        format: "json",
        limit: 12,
      },
      timeout: 18000,
      headers: WikidataUa,
    });
    const search = searchData?.search;
    if (!Array.isArray(search) || search.length === 0) return [];

    const ids = search.map((s: { id?: string }) => String(s.id || "")).filter(Boolean).slice(0, 10);
    const { data: entData } = await axios.get(api, {
      params: {
        action: "wbgetentities",
        ids: ids.join("|"),
        props: "claims",
        format: "json",
      },
      timeout: 22000,
      headers: WikidataUa,
    });
    const entities = entData?.entities;
    if (!entities || typeof entities !== "object") return [];

    const urls: string[] = [];
    for (const ent of Object.values(entities) as Array<{ claims?: Record<string, unknown> }>) {
      const claims = ent?.claims;
      if (!claims || typeof claims !== "object") continue;
      for (const prop of ["P154", "P18"]) {
        const stmts = claims[prop];
        if (!Array.isArray(stmts)) continue;
        for (const st of stmts) {
          const dv = (st as { mainsnak?: { datavalue?: { value?: unknown } } })?.mainsnak?.datavalue?.value;
          if (typeof dv === "string" && dv.length > 1) {
            urls.push(commonsFilePathUrl(dv));
          }
        }
      }
      if (urls.length >= 6) break;
    }
    return filterRasterImageUrls(urls);
  } catch {
    return [];
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}


function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Drop PDFs, DjVu, Office docs — Wikimedia search can return non-image "File:" titles. */
function filterRasterImageUrls(urls: string[]): string[] {
  return urls.filter((u) => {
    const p = u.split("?")[0].toLowerCase();
    if (/\.(pdf|djvu|svg|doc|docx|ppt|pptx|zip|mp4|webm)$/i.test(p)) return false;
    if (/commons\.wikimedia\.org\/wiki\/special:filepath\//i.test(u)) return true;
    if (/googleusercontent|gstatic|ggpht|encrypted-tbn\d*\./i.test(u)) return true;
    // Facebook CDN URLs often have no file extension in the path but serve raster images.
    if (/fbcdn\.net|lookaside\.fbsbx\.com\/platform\/profilepic/i.test(u)) return true;
    return /\.(jpe?g|png|gif|webp)$/i.test(p) || /\/thumb\//i.test(u) || /imgur|flickr|staticflickr/i.test(u);
  });
}

async function googleImageSearch(query: string, num: number): Promise<Array<{ link: string; width?: number; height?: number }>> {
  if (!API_KEY || !CX || googleCircuitOpen) {
    return [];
  }
  if (GOOGLE_MAX_TOTAL > 0 && googleCallsThisRun >= GOOGLE_MAX_TOTAL) {
    if (!googleCircuitOpen) {
      googleCircuitOpen = true;
      console.warn(
        `  Google Custom Search: per-run budget reached (${GOOGLE_MAX_TOTAL} calls). Stopping further Google calls; use --resume + checkpoint to continue later.`
      );
    }
    return [];
  }
  const url = "https://www.googleapis.com/customsearch/v1";
  const maxAttempts = 5;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await throttleGoogleQuery();
    lastGoogleQueryMs = Date.now();
    try {
      googleCallsThisRun += 1;
      const { data } = await axios.get(url, {
        params: {
          key: API_KEY,
          cx: CX,
          q: query,
          searchType: "image",
          num: Math.min(10, num),
          safe: "active",
        },
        timeout: 25000,
      });
      const items = Array.isArray(data?.items) ? data.items : [];
      return items
        .map((it: { link?: string; image?: { width?: number; height?: number } }) => ({
          link: String(it.link || ""),
          width: it.image?.width,
          height: it.image?.height,
        }))
        .filter((x: { link: string }) => /^https?:\/\//i.test(x.link));
    } catch (e: unknown) {
      if (!isAxiosError(e)) {
        console.warn("  Google image search error:", e instanceof Error ? e.message : e);
        return [];
      }
      const status = e.response?.status;
      const { reasons, message } = parseGoogleApiError(e.response?.data);

      if (status === 403) {
        if (googleLooksLikeQuotaIssue(reasons, message)) {
          const backoff = 8000 + attempt * 4000;
          console.warn(`  Google quota/limit (403), backing off ${backoff}ms...`);
          await sleep(backoff);
          continue;
        }
        if (!googleCircuitReasonLogged) {
          console.error(
            `  Google Custom Search error: 403 — ${[reasons, message].filter(Boolean).join(" | ").slice(0, 400)}`
          );
          console.error(
            "  If this persists: enable Custom Search API, fix API key restrictions (no HTTP-referrer-only for server scripts), enable billing for >100 queries/day."
          );
          googleCircuitReasonLogged = true;
        }
        if (googleLooksLikeFatalConfig(reasons, message)) {
          googleCircuitOpen = true;
          console.error("  Disabling further Google Custom Search calls this run.");
        }
        return [];
      }

      if (status === 429) {
        if (googleLooksLikeDailyQuotaExhausted(reasons, message)) {
          if (!googleCircuitReasonLogged) {
            console.error(
              "  Google Custom Search: daily quota exceeded; disabling further Google calls this run. Enable billing or retry tomorrow."
            );
            googleCircuitReasonLogged = true;
          }
          googleCircuitOpen = true;
          return [];
        }
        const backoff = 2500 * Math.pow(2, attempt);
        console.warn(`  Google rate limited (429), waiting ${backoff}ms (attempt ${attempt + 1}/${maxAttempts})...`);
        await sleep(backoff);
        continue;
      }

      console.warn("  Google image search error:", message || e.message || status || e);
      return [];
    }
  }

  return [];
}

/** No API key — good for notable institutions; often empty for very small schools. */
async function wikimediaCommonsImageUrls(searchQuery: string, limit: number): Promise<string[]> {
  const api = "https://commons.wikimedia.org/w/api.php";
  const headers = { "User-Agent": "QwertymatesSchoolMediaBot/1.0 (profile backfill)" };

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { data } = await axios.get(api, {
        params: {
          action: "query",
          list: "search",
          srsearch: searchQuery,
          srnamespace: 6,
          srlimit: Math.min(20, limit + 8),
          format: "json",
          origin: "*",
        },
        timeout: 22000,
        headers,
      });
      const hits = data?.query?.search;
      if (!Array.isArray(hits) || hits.length === 0) return [];
      const titles = hits
        .map((h: { title?: string }) => String(h.title || "").trim())
        .filter((t: string) => t.startsWith("File:"))
        .filter((t: string) => /\.(jpe?g|png|gif|webp)$/i.test(t))
        .slice(0, Math.min(12, limit + 4));
      if (titles.length === 0) return [];

      const { data: info } = await axios.get(api, {
        params: {
          action: "query",
          titles: titles.join("|"),
          prop: "imageinfo",
          iiprop: "url",
          format: "json",
          origin: "*",
        },
        timeout: 22000,
        headers,
      });
      const pages = info?.query?.pages;
      if (!pages || typeof pages !== "object") return [];
      const urls: string[] = [];
      for (const p of Object.values(pages) as Array<{ imageinfo?: Array<{ url?: string }> }>) {
        const u = p?.imageinfo?.[0]?.url;
        if (typeof u === "string" && /^https?:\/\//i.test(u)) urls.push(u);
        if (urls.length >= limit) break;
      }
      return urls;
    } catch (e: unknown) {
      if (isAxiosError(e) && e.response?.status === 429 && attempt < 2) {
        await sleep(4000 * (attempt + 1));
        continue;
      }
      return [];
    }
  }
  return [];
}

/** Creative Commons index — no key; use when Google/Wikimedia have no hits. */
async function openverseImageUrls(searchQuery: string, limit: number): Promise<string[]> {
  const headers = { "User-Agent": "QwertymatesSchoolMediaBot/1.0 (profile backfill)" };
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { data } = await axios.get("https://api.openverse.engineering/v1/images/", {
        params: {
          q: searchQuery,
          page_size: Math.min(20, limit + 5),
          page: 1,
        },
        timeout: 22000,
        headers,
      });
      const results = Array.isArray(data?.results) ? data.results : [];
      const urls: string[] = [];
      for (const r of results) {
        const u = r?.url;
        if (typeof u === "string" && /^https?:\/\//i.test(u)) {
          urls.push(u);
          if (urls.length >= limit) break;
        }
      }
      return urls;
    } catch (e: unknown) {
      if (isAxiosError(e) && e.response?.status === 429 && attempt < 2) {
        await sleep(4000 * (attempt + 1));
        continue;
      }
      return [];
    }
  }
  return [];
}

async function discoverImages(query: string, num: number): Promise<Array<{ link: string; width?: number; height?: number }>> {
  let rows: Array<{ link: string; width?: number; height?: number }> = [];
  if (API_KEY && CX) {
    try {
      rows = await googleImageSearch(query, num);
    } catch (e) {
      console.warn("  Google image search error:", e instanceof Error ? e.message : e);
    }
  } else if (!warnedGoogleMissing) {
    warnedGoogleMissing = true;
    console.warn(
      "  (No GOOGLE_CUSTOM_SEARCH_* in .env — using Wikimedia Commons + Openverse; add Google keys for best results.)"
    );
  }
  if (rows.length > 0) {
    const kept = filterRasterImageUrls(rows.map((r) => r.link));
    if (kept.length > 0) return kept.map((link) => ({ link }));
  }

  let urls = filterRasterImageUrls(await wikimediaCommonsImageUrls(query, num));
  if (urls.length > 0) return urls.map((link) => ({ link }));

  urls = filterRasterImageUrls(await openverseImageUrls(query, num));
  return urls.map((link) => ({ link }));
}

function extFromUrlOrContentType(url: string, contentType: string | undefined): string {
  const lower = (contentType || "").toLowerCase();
  if (lower.includes("png")) return ".png";
  if (lower.includes("webp")) return ".webp";
  if (lower.includes("gif")) return ".gif";
  const m = url.split("?")[0].match(/\.(jpe?g|png|gif|webp)$/i);
  if (m) return m[0].toLowerCase();
  return ".jpg";
}

function refererForImageUrl(imageUrl: string): string | undefined {
  if (/flickr|staticflickr/i.test(imageUrl)) return "https://www.flickr.com/";
  if (/wikimedia|wikipedia/i.test(imageUrl)) return "https://commons.wikimedia.org/";
  if (/fbcdn\.net|fbsbx\.com/i.test(imageUrl)) return "https://www.facebook.com/";
  return undefined;
}

async function downloadToUploads(
  imageUrl: string,
  destBasename: string
): Promise<{ relativePath: string; absPath: string } | null> {
  const uploadsAbs = path.resolve(__dirname, "../uploads/profiles");
  if (!fs.existsSync(uploadsAbs)) {
    fs.mkdirSync(uploadsAbs, { recursive: true });
  }

  try {
    const ref = refererForImageUrl(imageUrl);
    const res = await axios.get<ArrayBuffer>(imageUrl, {
      responseType: "arraybuffer",
      timeout: 35000,
      maxRedirects: 5,
      validateStatus: (s) => s >= 200 && s < 400,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        ...(ref ? { Referer: ref } : {}),
      },
    });
    const ct = res.headers["content-type"] as string | undefined;
    if (ct && !ct.startsWith("image/") && !ct.includes("octet-stream")) {
      return null;
    }
    const ext = extFromUrlOrContentType(imageUrl, ct);
    const filename = `${destBasename}${ext}`;
    const absPath = path.join(uploadsAbs, filename);
    fs.writeFileSync(absPath, Buffer.from(res.data));
    return { relativePath: `${UPLOADS_REL}/${filename}`, absPath };
  } catch {
    return null;
  }
}

function uniqUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of urls) {
    if (!u || seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

async function main() {
  if (HELP) {
    printHelp();
    return;
  }
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error("MONGO_URI not set");
    process.exit(1);
  }

  await mongoose.connect(mongoUri);

  googleCallsThisRun = 0;
  GOOGLE_MAX_TOTAL = GOOGLE_MAX_TOTAL_RAW
    ? Math.max(1, parseInt(GOOGLE_MAX_TOTAL_RAW, 10) || 0)
    : Math.max(0, parseInt(process.env.GOOGLE_CUSTOM_SEARCH_MAX_CALLS_PER_RUN || "0", 10) || 0);
  if (GOOGLE_MAX_TOTAL > 0) {
    console.log(`Google Custom Search per-run cap: ${GOOGLE_MAX_TOTAL} calls (--google-max-total / GOOGLE_CUSTOM_SEARCH_MAX_CALLS_PER_RUN)`);
  }

  let filter: Record<string, unknown>;
  if (NAME_SUBSTRING) {
    filter = { name: new RegExp(escapeRegex(NAME_SUBSTRING), "i") };
    console.log(`Filter: name contains (case-insensitive): ${JSON.stringify(NAME_SUBSTRING)}`);
  } else if (COUNTRY_CODE_FILTER) {
    filter = { isSchoolAccount: true, countryCode: COUNTRY_CODE_FILTER };
    console.log(`Filter: school accounts with countryCode=${COUNTRY_CODE_FILTER} (scene queries: ${SCENE_REGION})`);
  } else {
    filter = { isSchoolAccount: true };
  }

  const filterParts: Record<string, unknown>[] = [filter];
  if (ONLY_MISSING) {
    filterParts.push(needsMediaMongoFilter(AVATAR_ONLY));
    console.log("Filter: only accounts still missing profile media (--only-missing, or implied by --bulk unless --force)");
  }
  let mongoFilter: Record<string, unknown> = filterParts.length > 1 ? { $and: filterParts } : filter;

  if (CHECKPOINT_PATH && RESUME && fs.existsSync(CHECKPOINT_PATH)) {
    try {
      const ck = JSON.parse(fs.readFileSync(CHECKPOINT_PATH, "utf8")) as { lastProcessedId?: string };
      if (ck.lastProcessedId && mongoose.Types.ObjectId.isValid(ck.lastProcessedId)) {
        mongoFilter = {
          $and: [mongoFilter, { _id: { $gt: new mongoose.Types.ObjectId(ck.lastProcessedId) } }],
        };
        console.log(`Resume: continuing after _id > ${ck.lastProcessedId}`);
      }
    } catch (e) {
      console.warn("Could not read checkpoint; starting from beginning:", e instanceof Error ? e.message : e);
    }
  } else if (RESUME && CHECKPOINT_PATH) {
    console.log("Note: --resume was set but checkpoint file not found; starting from beginning.");
  }

  const sortById = !!(BULK || (CHECKPOINT_PATH && RESUME));
  if (OFFSET > 0 && RESUME && CHECKPOINT_PATH) {
    console.warn("Ignoring --offset because --resume + --checkpoint is active (pagination uses _id).");
  }
  const effectiveSkip = RESUME && CHECKPOINT_PATH && fs.existsSync(CHECKPOINT_PATH) ? 0 : OFFSET;
  const effectiveLimit = LIMIT !== undefined ? LIMIT : BULK ? 500 : undefined;
  if (BULK && LIMIT === undefined) {
    console.log("Bulk mode: default --limit=500 per run (override with --limit=). Use --checkpoint + --resume to chain runs until all schools are covered.");
  }

  let q = User.find(mongoFilter)
    .select("name avatar profileGalleryUrls isSchoolAccount")
    .sort(sortById ? { _id: 1 } : { name: 1 });
  if (effectiveSkip > 0) q = q.skip(effectiveSkip);
  if (effectiveLimit !== undefined) q = q.limit(effectiveLimit);
  let schools = await q.lean();

  /** Apply after offset/limit so --tag-as-school only marks the batch being processed. */
  if (NAME_SUBSTRING && TAG_AS_SCHOOL && schools.length > 0 && !DRY) {
    const ids = schools.map((s) => s._id);
    const r = await User.updateMany({ _id: { $in: ids } }, { $set: { isSchoolAccount: true } });
    console.log(`Tagged ${r.modifiedCount} user(s) with isSchoolAccount: true`);
    schools = await User.find({ _id: { $in: ids } })
      .select("name avatar profileGalleryUrls isSchoolAccount")
      .sort(sortById ? { _id: 1 } : { name: 1 })
      .lean();
  }

  console.log(`Found ${schools.length} user(s) to process`);
  if (effectiveLimit !== undefined) console.log(`Limit: at most ${effectiveLimit} user(s) in this run`);
  if (AVATAR_ONLY) console.log("Mode: --avatar-only (profile picture only; fewer searches/downloads)");
  if (SKIP_FACEBOOK_SITE) console.log("Mode: --skip-facebook-site (no site:facebook.com image queries)");
  if (BULK) {
    console.log(
      "Mode: --bulk (≤1 Google image search per school when keys are set; no Facebook queries; extra Wikimedia/Openverse)"
    );
  }
  if (CHECKPOINT_PATH) console.log(`Checkpoint file: ${CHECKPOINT_PATH}`);
  if (NO_GOOGLE) {
    googleCircuitOpen = true;
    console.log("Mode: --no-google (Wikidata + Wikimedia + Openverse only; zero Custom Search calls)");
  }
  if (SLEEP_MS > 0) console.log(`Throttle: ${SLEEP_MS} ms pause between schools`);

  if (schools.length === 0) {
    console.log(
      NAME_SUBSTRING
        ? "No users matched the name filter. Check spelling or create the account first."
        : COUNTRY_CODE_FILTER
          ? `No school accounts for countryCode=${COUNTRY_CODE_FILTER}. Import OSM schools first.`
          : "Nothing to do. Mark accounts with isSchoolAccount: true, or pass --name=\"Partial School Name\"."
    );
    await mongoose.disconnect();
    return;
  }

  const googleConfigured = !!(API_KEY && CX);
  if (googleConfigured && GOOGLE_QUERY_PAUSE_MS > 0 && !NO_GOOGLE) {
    console.log(`Google Custom Search spacing: ${GOOGLE_QUERY_PAUSE_MS} ms between API calls (--google-sleep-ms / GOOGLE_CUSTOM_SEARCH_QUERY_PAUSE_MS)`);
  }
  if (googleConfigured && !DRY && !SKIP_GOOGLE_PROBE && !NO_GOOGLE && !BULK) {
    await probeGoogleCustomSearchOnce();
  }
  if (googleConfigured && BULK) {
    console.log("Bulk mode: skipped Google startup probe (saves 1 API call).");
  }
  // Large runs without Google need explicit acceptance of sparse coverage.
  if (!googleConfigured && schools.length > 200 && !ALLOW_FALLBACK_ONLY && !BULK) {
    console.error(
      `Google Custom Search is not configured and ${schools.length} users were selected. ` +
      `For large runs this will miss most schools. Set GOOGLE_CUSTOM_SEARCH_API_KEY + GOOGLE_CUSTOM_SEARCH_ENGINE_ID, ` +
      `or re-run with --allow-fallback-only if you intentionally accept low coverage.`
    );
    await mongoose.disconnect();
    process.exit(2);
  }
  if (!googleConfigured && schools.length > 200 && BULK) {
    console.log(
      "Bulk mode without Google: continuing with Wikidata + Wikimedia + Openverse only (many schools may get generic or no images)."
    );
  }

  let processed = 0;
  let skippedExisting = 0;
  let noImageResults = 0;
  let updated = 0;

  function writeCheckpoint(lastId: string) {
    if (!CHECKPOINT_PATH || DRY) return;
    try {
      fs.mkdirSync(path.dirname(CHECKPOINT_PATH), { recursive: true });
      fs.writeFileSync(
        CHECKPOINT_PATH,
        JSON.stringify({ lastProcessedId: lastId, updatedAt: new Date().toISOString() }, null, 0),
        "utf8"
      );
    } catch (e) {
      console.warn("  Checkpoint write failed:", e instanceof Error ? e.message : e);
    }
  }

  for (let si = 0; si < schools.length; si++) {
    const doc = schools[si];
    const id = String(doc._id);
    const name = (doc.name || "").trim() || "School";
    console.log(`\n── ${name} (${id})`);

    const hasAvatar = !!(doc as { avatar?: string }).avatar;
    const hasGallery = Array.isArray((doc as { profileGalleryUrls?: string[] }).profileGalleryUrls) &&
      ((doc as { profileGalleryUrls?: string[] }).profileGalleryUrls?.length ?? 0) >= 2;
    if (!FORCE && hasAvatar && (AVATAR_ONLY || hasGallery)) {
      console.log(
        AVATAR_ONLY
          ? "  Skip (already has avatar). Use --force to replace."
          : "  Skip (already has avatar + 2+ gallery images). Use --force to replace."
      );
      skippedExisting += 1;
      processed += 1;
      writeCheckpoint(id);
      continue;
    }

    let badgeUrls: string[] = [];
    let sceneUrls: string[] = [];
    try {
      if (BULK) {
        const wikiUrls = filterRasterImageUrls(await wikidataSchoolImageCandidates(name));
        let plainNameUrls: string[] = [];
        if (API_KEY && CX) {
          try {
            plainNameUrls = filterRasterImageUrls((await googleImageSearch(name, 10)).map((x) => x.link));
          } catch (e: unknown) {
            console.warn("  Google plain-name search error:", e instanceof Error ? e.message : e);
          }
        }
        const wmLogo = filterRasterImageUrls(await wikimediaCommonsImageUrls(`${name} school logo`, 4));
        const wmCrest = filterRasterImageUrls(await wikimediaCommonsImageUrls(`${name} school crest`, 3));
        badgeUrls = uniqUrls([...wikiUrls, ...plainNameUrls, ...wmLogo, ...wmCrest]);
        if (!AVATAR_ONLY) {
          const wmScene = filterRasterImageUrls(await wikimediaCommonsImageUrls(`${name} school ${SCENE_REGION}`, 6));
          let ovScene = filterRasterImageUrls(await openverseImageUrls(`${name} school ${SCENE_REGION}`, 8));
          sceneUrls = uniqUrls([...wmScene, ...ovScene]);
          if (sceneUrls.length < 2) {
            ovScene = filterRasterImageUrls(await openverseImageUrls(`school learners ${SCENE_REGION}`, 10));
            sceneUrls = uniqUrls([...sceneUrls, ...ovScene]);
          }
        }
      } else {
        const wikiUrls = filterRasterImageUrls(await wikidataSchoolImageCandidates(name));
        let plainNameUrls: string[] = [];
        if (API_KEY && CX) {
          try {
            plainNameUrls = filterRasterImageUrls((await googleImageSearch(name, 10)).map((x) => x.link));
          } catch (e: unknown) {
            console.warn("  Google plain-name search error:", e instanceof Error ? e.message : e);
          }
        }
        const crestUrls = (await discoverImages(`${name} school badge logo crest`, 8)).map((x) => x.link);
        let fbPageUrls: string[] = [];
        if (API_KEY && CX && !SKIP_FACEBOOK_SITE) {
          try {
            fbPageUrls = filterRasterImageUrls(
              (await googleImageSearch(`${name} school site:facebook.com`, 8)).map((x) => x.link)
            );
          } catch (e: unknown) {
            console.warn("  Google Facebook-site search error:", e instanceof Error ? e.message : e);
          }
        }
        badgeUrls = uniqUrls([...wikiUrls, ...plainNameUrls, ...crestUrls, ...fbPageUrls]);

        if (!AVATAR_ONLY) {
          sceneUrls = (await discoverImages(`${name} school ${SCENE_REGION}`, 10)).map((x) => x.link);
          if (API_KEY && CX && !SKIP_FACEBOOK_SITE) {
            try {
              const fbLearners = filterRasterImageUrls(
                (await googleImageSearch(`${name} school learners site:facebook.com`, 8)).map((x) => x.link)
              );
              sceneUrls = uniqUrls([...sceneUrls, ...fbLearners]);
            } catch (e: unknown) {
              console.warn("  Google FB learners search error:", e instanceof Error ? e.message : e);
            }
            if (sceneUrls.length < 4) {
              try {
                const classPhoto = filterRasterImageUrls(
                  (await googleImageSearch(`${name} school class photo learners ${SCENE_REGION}`, 6)).map((x) => x.link)
                );
                sceneUrls = uniqUrls([...sceneUrls, ...classPhoto]);
              } catch (e: unknown) {
                console.warn("  Google class-photo search error:", e instanceof Error ? e.message : e);
              }
            }
          }
          if (sceneUrls.length < 2) {
            sceneUrls = uniqUrls([
              ...sceneUrls,
              ...(await discoverImages(`${name} primary school`, 8)).map((x) => x.link),
            ]);
          }
        }
      }
    } catch (e: unknown) {
      console.error("  Image discovery failed:", e instanceof Error ? e.message : e);
      writeCheckpoint(id);
      continue;
    }

    let allCandidates = uniqUrls(AVATAR_ONLY ? [...badgeUrls] : [...badgeUrls, ...sceneUrls]);
    if (allCandidates.length === 0) {
      console.log(
        "  No images for this exact school name in Wikimedia/Openverse. Trying Openverse stock queries (add GOOGLE_CUSTOM_SEARCH_* for school-specific web images)."
      );
      try {
        const firstWord = name.split(/\s+/).filter(Boolean)[0] || name;
        badgeUrls = filterRasterImageUrls(
          await openverseImageUrls(`${firstWord} school emblem logo crest`, 8)
        );
        if (badgeUrls.length === 0) {
          badgeUrls = filterRasterImageUrls(
            await openverseImageUrls(`school emblem logo education ${SCENE_REGION}`, 8)
          );
        }
        if (!AVATAR_ONLY) {
          sceneUrls = filterRasterImageUrls(
            await openverseImageUrls(`primary school ${SCENE_REGION} classroom learners`, 12)
          );
          if (sceneUrls.length < 2) {
            sceneUrls = uniqUrls([
              ...sceneUrls,
              ...filterRasterImageUrls(
                await openverseImageUrls(`${SCENE_REGION} school education building`, 10)
              ),
            ]);
          }
        } else {
          sceneUrls = [];
        }
        allCandidates = uniqUrls(AVATAR_ONLY ? [...badgeUrls] : [...badgeUrls, ...sceneUrls]);
      } catch (e: unknown) {
        console.error("  Fallback discovery failed:", e instanceof Error ? e.message : e);
      }
    }

    if (allCandidates.length === 0) {
      console.log("  No image results.");
      noImageResults += 1;
      processed += 1;
      writeCheckpoint(id);
      if (SLEEP_MS > 0 && si < schools.length - 1) await sleep(SLEEP_MS);
      continue;
    }

    const avatarUrlPick = badgeUrls[0] || allCandidates[0];
    // Prefer general "school" photos for the two gallery slots; fall back to other results.
    const galleryPool = uniqUrls([
      ...sceneUrls.filter((u) => u && u !== avatarUrlPick),
      ...badgeUrls.filter((u) => u && u !== avatarUrlPick),
      ...allCandidates.filter((u) => u !== avatarUrlPick),
    ]);

    if (DRY) {
      console.log("  [dry-run] Would set avatar from:", avatarUrlPick);
      console.log("  [dry-run] Would add gallery from:", AVATAR_ONLY ? "(skipped)" : galleryPool.slice(0, 2));
      processed += 1;
      writeCheckpoint(id);
      if (SLEEP_MS > 0 && si < schools.length - 1) await sleep(SLEEP_MS);
      continue;
    }

    const updates: { avatar?: string; profileGalleryUrls?: string[] } = {};
    const ts = Date.now();

    if (FORCE || !hasAvatar) {
      const avatarTries = uniqUrls([avatarUrlPick, ...allCandidates.filter((u) => u && u !== avatarUrlPick)]);
      let avatarSaved: { relativePath: string } | null = null;
      let avatarAttempt = 0;
      for (const u of avatarTries) {
        const saved = await downloadToUploads(u, `school-${id}-avatar-${ts}-${avatarAttempt}`);
        avatarAttempt += 1;
        if (saved) {
          avatarSaved = saved;
          break;
        }
      }
      if (avatarSaved) {
        updates.avatar = avatarSaved.relativePath;
        console.log("  Avatar:", avatarSaved.relativePath);
      } else {
        console.log("  Failed to download any avatar candidate.");
      }
    }

    if (!AVATAR_ONLY && (FORCE || !hasGallery)) {
      const galleryRel: string[] = [];
      let idx = 0;
      for (const u of galleryPool) {
        if (galleryRel.length >= 2) break;
        const saved = await downloadToUploads(u, `school-${id}-gallery-${ts}-${idx}`);
        idx += 1;
        if (saved) {
          galleryRel.push(saved.relativePath);
          console.log("  Gallery:", saved.relativePath);
        }
      }
      if (galleryRel.length > 0) {
        updates.profileGalleryUrls = galleryRel;
      }
    }

    if (Object.keys(updates).length > 0) {
      await User.updateOne({ _id: doc._id }, { $set: updates });
      console.log("  Saved to database.");
      updated += 1;
    }
    processed += 1;
    writeCheckpoint(id);
    if (SLEEP_MS > 0 && si < schools.length - 1) await sleep(SLEEP_MS);
  }

  await mongoose.disconnect();
  console.log(
    `\nDone. processed=${processed}, updated=${updated}, skipped_existing=${skippedExisting}, no_image_results=${noImageResults}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
