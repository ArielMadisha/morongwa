/**
 * API-Sports live scores → QwertyTV (NOT Facebook ingest).
 *
 * Default publisher: @worldofsport (set API_FOOTBALL_TV_CREATOR_USERNAME).
 * @worldnews is reserved for Facebook sports + AI sports on Tue/Fri only.
 *
 *   npm run api-football:post
 *   npm run api-football:post -- --dry-run
 *   npm run api-football:post -- --repair-broken
 */

import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import axios from "axios";
import mongoose from "mongoose";
import TVPost from "../src/data/models/TVPost";
import User from "../src/data/models/User";
import { isWorldNewsAutopostDay } from "../src/utils/worldNewsSchedule";
import { downloadRemoteToTvUploads, looksLikeDirectVideoUrl } from "../src/services/tvRemoteDownload";
import { buildDownloadedClubLogoMedia, type FootballFixtureRow } from "../src/services/sportsClubMedia";

const ENV_PATH = path.resolve(process.cwd(), ".env");
dotenv.config({ path: ENV_PATH });

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const FORCE = args.includes("--force");
const REPAIR_BROKEN = args.includes("--repair-broken");
const MAX_POSTS = Math.max(1, Number(process.env.API_FOOTBALL_MAX_POSTS_PER_RUN || "3"));
const LOOP_MINUTES = Math.max(0, Number(process.env.API_FOOTBALL_LOOP_MINUTES || "0"));

function readEnvFallback(key: string): string {
  try {
    const raw = fs.readFileSync(ENV_PATH, "utf8");
    const line = raw
      .split(/\r?\n/)
      .map((x) => x.trim())
      .find((x) => x.startsWith(`${key}=`));
    if (!line) return "";
    const value = line.slice(key.length + 1).trim();
    return value.replace(/^['"]|['"]$/g, "");
  } catch {
    return "";
  }
}

type FixtureRow = FootballFixtureRow & {
  fixture?: { id?: number; date?: string; status?: { short?: string; elapsed?: number | null } };
  league?: { name?: string; round?: string; country?: string; logo?: string };
  goals?: { home?: number | null; away?: number | null };
};

type ScorebatVideoRow = {
  title?: string;
  date?: string;
  thumbnail?: string;
  side1?: { name?: string };
  side2?: { name?: string };
  videos?: Array<{ title?: string; embed?: string }>;
};

function sanitizeText(input: string, max = 1200): string {
  return String(input || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function statusLabel(row: FixtureRow): string {
  const short = String(row.fixture?.status?.short || "").trim().toUpperCase();
  const elapsed = row.fixture?.status?.elapsed;
  if (short === "FT") return "Full time";
  if (short === "HT") return "Half time";
  if (short === "NS") return "Starting soon";
  if (typeof elapsed === "number" && elapsed > 0) return `${elapsed}'`;
  return short || "Live";
}

function normalizeTeamName(input: string): string {
  return String(input || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function parseEmbedSrc(embedHtml?: string): string {
  const raw = String(embedHtml || "");
  const m = raw.match(/src=["']([^"']+)["']/i);
  return m?.[1] ? String(m[1]).trim() : "";
}

async function fetchScorebatRows(): Promise<ScorebatVideoRow[]> {
  const token = String(process.env.SCOREBAT_API_TOKEN || readEnvFallback("SCOREBAT_API_TOKEN") || "").trim();
  if (!token) return [];
  const url = `https://www.scorebat.com/video-api/v3/?token=${encodeURIComponent(token)}`;
  const res = await axios.get(url, { timeout: 20000 });
  const rows = Array.isArray(res.data?.response) ? (res.data.response as ScorebatVideoRow[]) : [];
  return rows;
}

function pickScorebatHighlight(
  fixturesHome: string,
  fixturesAway: string,
  fixtureDateIso?: string,
  rows: ScorebatVideoRow[]
): { videoUrl?: string; thumbnailUrl?: string; pageUrl?: string } | null {
  if (!rows.length) return null;
  const homeN = normalizeTeamName(fixturesHome);
  const awayN = normalizeTeamName(fixturesAway);
  const day = String(fixtureDateIso || "").slice(0, 10);
  for (const row of rows) {
    const s1 = normalizeTeamName(String(row.side1?.name || ""));
    const s2 = normalizeTeamName(String(row.side2?.name || ""));
    const sameTeams = (homeN === s1 && awayN === s2) || (homeN === s2 && awayN === s1);
    if (!sameTeams) continue;
    const rowDay = String(row.date || "").slice(0, 10);
    if (day && rowDay && day !== rowDay) continue;
    const firstEmbed = parseEmbedSrc(row.videos?.[0]?.embed);
    const thumb = String(row.thumbnail || "").trim();
    return {
      videoUrl: firstEmbed || undefined,
      thumbnailUrl: thumb || undefined,
      pageUrl: firstEmbed || undefined,
    };
  }
  return null;
}

async function fetchFixtures(apiKey: string): Promise<FixtureRow[]> {
  const headers = {
    "x-apisports-key": apiKey,
  };

  const live = await axios.get("https://v3.football.api-sports.io/fixtures", {
    headers,
    params: { live: "all" },
    timeout: 20000,
  });
  const liveRows = Array.isArray(live.data?.response) ? (live.data.response as FixtureRow[]) : [];
  if (liveRows.length > 0) return liveRows;

  const today = new Date().toISOString().slice(0, 10);
  const daily = await axios.get("https://v3.football.api-sports.io/fixtures", {
    headers,
    params: { date: today },
    timeout: 20000,
  });
  return Array.isArray(daily.data?.response) ? (daily.data.response as FixtureRow[]) : [];
}

function resolveCreatorUsername(): string {
  return String(
    process.env.API_FOOTBALL_TV_CREATOR_USERNAME ||
      process.env.AI_SPORTS_CREATOR_USERNAME ||
      "worldofsport"
  )
    .trim()
    .toLowerCase();
}

function isRemoteApiSportsLogoCarousel(mediaUrls: string[]): boolean {
  if (!mediaUrls.length) return false;
  return mediaUrls.every((u) => /api-sports\.io/i.test(u) || /media\.api-sports/i.test(u));
}

/** Fix posts that show a broken 3-logo API-Sports carousel (not Facebook). */
async function repairBrokenApiSportsPosts(creatorIds: mongoose.Types.ObjectId[]): Promise<number> {
  if (!creatorIds.length) return 0;
  const rows = await TVPost.find({
    creatorId: { $in: creatorIds },
    subject: /API-Sports/i,
    type: { $in: ["image", "carousel", "video"] },
    mediaUrls: { $exists: true, $ne: [] },
  })
    .select("_id mediaUrls type subject")
    .limit(200)
    .lean();

  let fixed = 0;
  for (const row of rows) {
    const urls = Array.isArray(row.mediaUrls) ? row.mediaUrls.map(String) : [];
    const brokenCarousel = urls.length >= 2 && isRemoteApiSportsLogoCarousel(urls);
    const brokenEmbedVideo =
      row.type === "video" && urls.some((u) => u.includes("scorebat.com") && !looksLikeDirectVideoUrl(u));
    if (!brokenCarousel && !brokenEmbedVideo) continue;

    if (DRY_RUN) {
      console.log(`REPAIR would fix post ${row._id} (${row.type}, ${urls.length} remote urls)`);
      fixed += 1;
      continue;
    }

    await TVPost.updateOne(
      { _id: row._id },
      {
        $set: {
          type: "text",
          mediaUrls: [],
        },
      }
    );
    fixed += 1;
    console.log(`REPAIR fixed post ${row._id} → text-only (removed broken API-Sports media)`);
  }
  return fixed;
}

async function buildPostMedia(
  highlight: ReturnType<typeof pickScorebatHighlight>,
  fixture: FixtureRow
): Promise<{
  type: "text" | "image" | "video" | "carousel";
  mediaUrls: string[];
}> {
  if (highlight?.videoUrl && looksLikeDirectVideoUrl(highlight.videoUrl)) {
    const saved = await downloadRemoteToTvUploads(highlight.videoUrl, ".mp4", "tv-af");
    if (saved) return { type: "video", mediaUrls: [saved.publicPath] };
  }

  const thumb = highlight?.thumbnailUrl || "";
  if (thumb) {
    const saved = await downloadRemoteToTvUploads(thumb, ".jpg", "tv-af");
    if (saved) return { type: "image", mediaUrls: [saved.publicPath] };
  }

  const logos = await buildDownloadedClubLogoMedia(fixture);
  if (logos.mediaUrls.length > 0) return logos;

  return { type: "text", mediaUrls: [] };
}

async function runOnce() {
  const mongoUri = String(process.env.MONGO_URI || "").trim();
  const apiKey = String(
    process.env.API_FOOTBALL_API_KEY ||
      process.env.API_FOOTBALL_KEY ||
      readEnvFallback("API_FOOTBALL_API_KEY") ||
      readEnvFallback("API_FOOTBALL_KEY")
  ).trim();
  const creatorUsername = resolveCreatorUsername();
  const tz = String(process.env.API_FOOTBALL_TIMEZONE || process.env.AI_NEWS_TIMEZONE || "Africa/Johannesburg").trim();

  if (!mongoUri) throw new Error("MONGO_URI missing");
  if (!apiKey) throw new Error("API_FOOTBALL_API_KEY missing");

  await mongoose.connect(mongoUri);
  try {
    const creator = await User.findOne({ username: creatorUsername }).select("_id username name").lean();
    if (!creator?._id) {
      throw new Error(`TV creator user not found: ${creatorUsername}`);
    }

    if (REPAIR_BROKEN) {
      const extra = await User.find({ username: { $in: ["worldnews", "worldofsport"] } })
        .select("_id")
        .lean();
      const ids = [
        ...new Set([
          String(creator._id),
          ...extra.map((u) => String(u._id)),
        ]),
      ].map((id) => new mongoose.Types.ObjectId(id));
      const repaired = await repairBrokenApiSportsPosts(ids);
      console.log(`Repair pass: ${repaired} post(s)${DRY_RUN ? " (dry-run)" : ""}`);
      if (!args.includes("--also-post")) return;
    }

    const postingToWorldNews = creatorUsername === "worldnews";
    if (postingToWorldNews && !FORCE && !isWorldNewsAutopostDay(new Date(), tz)) {
      console.log(`Skip API-Football post: @worldnews sports runs Tue/Fri only (${tz}). Use @worldofsport or --force.`);
      return;
    }

    const [fixtures, scorebatRows] = await Promise.all([
      fetchFixtures(apiKey),
      fetchScorebatRows().catch(() => [] as ScorebatVideoRow[]),
    ]);
    if (!fixtures.length) {
      console.log("No football fixtures returned right now.");
      return;
    }

    let created = 0;
    for (const row of fixtures) {
      if (created >= MAX_POSTS) break;
      const fid = Number(row.fixture?.id || 0);
      if (!fid) continue;

      const existing = await TVPost.findOne({
        creatorId: creator._id,
        subject: { $regex: `AF:${fid}`, $options: "i" },
        createdAt: { $gte: new Date(Date.now() - 12 * 60 * 60 * 1000) },
      })
        .select("_id")
        .lean();
      if (existing) continue;

      const home = sanitizeText(String(row.teams?.home?.name || "Home"));
      const away = sanitizeText(String(row.teams?.away?.name || "Away"));
      const homeGoals = row.goals?.home;
      const awayGoals = row.goals?.away;
      const score =
        typeof homeGoals === "number" && typeof awayGoals === "number" ? `${homeGoals}-${awayGoals}` : "vs";
      const league = sanitizeText(String(row.league?.name || "Football"), 140);
      const round = sanitizeText(String(row.league?.round || ""), 120);
      const country = sanitizeText(String(row.league?.country || ""), 80);
      const status = statusLabel(row);
      const highlight = pickScorebatHighlight(home, away, row.fixture?.date, scorebatRows);
      const { type: postType, mediaUrls } = DRY_RUN
        ? {
            type: (highlight?.thumbnailUrl || (highlight?.videoUrl && looksLikeDirectVideoUrl(highlight.videoUrl))
              ? "image"
              : "text") as "text" | "image" | "video",
            mediaUrls: [] as string[],
          }
        : await buildPostMedia(highlight, row);

      const heading = sanitizeText(`${home} ${score} ${away}`, 160);
      let caption = sanitizeText(
        `${status}: ${home} ${score} ${away}. ${league}${round ? ` · ${round}` : ""}${country ? ` (${country})` : ""}.`,
        1200
      );
      if (highlight?.pageUrl && !looksLikeDirectVideoUrl(highlight.pageUrl)) {
        caption = sanitizeText(`${caption} Highlights: ${highlight.pageUrl}`, 1200);
      }
      const subject = sanitizeText(`Source: API-Sports (live scores) · AF:${fid}`, 220);

      console.log(
        `POST fixture ${fid}: ${heading} (${postType}${mediaUrls.length ? `, media=${mediaUrls.length}` : ", text-only"}) → @${creatorUsername}`
      );
      if (DRY_RUN) {
        created += 1;
        continue;
      }

      await TVPost.create({
        creatorId: creator._id,
        type: postType,
        mediaUrls,
        heading,
        caption,
        subject,
        hashtags: ["Football", "QwertySports", "API-Sports", "LiveMatch"],
        genre: "sport",
        status: "approved",
        hasWatermark: true,
      });
      created += 1;
    }

    console.log(`API-Football ingestion done: created=${created}${DRY_RUN ? " (dry-run)" : ""}`);
  } finally {
    await mongoose.disconnect();
  }
}

async function runLoop() {
  if (LOOP_MINUTES <= 0) {
    await runOnce();
    return;
  }
  const waitMs = LOOP_MINUTES * 60 * 1000;
  console.log(`API-Sports auto-post loop started (every ${LOOP_MINUTES} minute(s)).`);
  for (;;) {
    try {
      await runOnce();
    } catch (err) {
      console.error(err instanceof Error ? err.message : err);
    }
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
}

runLoop().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
