import axios from "axios";
import mongoose from "mongoose";
import TVPost from "../data/models/TVPost";
import User from "../data/models/User";
import {
  buildDownloadedClubLogoMedia,
  type FootballFixtureRow,
} from "./sportsClubMedia";
import { downloadRemoteToTvUploads, looksLikeDirectVideoUrl } from "./tvRemoteDownload";
import { logger } from "./monitoring";

export type WorldCupFixtureRow = FootballFixtureRow & {
  fixture?: {
    id?: number;
    date?: string;
    status?: { short?: string; elapsed?: number | null };
  };
  league?: { name?: string; round?: string; country?: string; logo?: string };
  goals?: { home?: number | null; away?: number | null };
};

type ScorebatVideoRow = {
  title?: string;
  date?: string;
  thumbnail?: string;
  competition?: string;
  side1?: { name?: string };
  side2?: { name?: string };
  videos?: Array<{ title?: string; embed?: string }>;
};

export type WorldCupTvRunResult = {
  created: number;
  postIds: string[];
  message?: string;
};

function readApiKey(): string {
  return String(process.env.API_FOOTBALL_API_KEY || process.env.API_FOOTBALL_KEY || "").trim();
}

function leagueId(): number {
  return Math.max(1, Number(process.env.WORLD_CUP_LEAGUE_ID || "1"));
}

function seasonYear(): number {
  const y = Number(process.env.WORLD_CUP_SEASON || "2026");
  return Number.isFinite(y) ? y : 2026;
}

function maxPostsPerRun(): number {
  return Math.max(1, Math.min(8, Number(process.env.WORLD_CUP_TV_MAX_POSTS_PER_RUN || "4")));
}

/** FIFA World Cup autoposts → @worldofsport (general news stays on @worldnews). */
export function resolveWorldCupCreatorUsername(): string {
  return String(
    process.env.WORLD_CUP_TV_CREATOR_USERNAME ||
      process.env.API_FOOTBALL_TV_CREATOR_USERNAME ||
      "worldofsport"
  )
    .trim()
    .toLowerCase();
}

const WORLD_CUP_HASHTAGS = ["WorldCup", "FIFA", "Football", "WorldOfSport", "QwertySports"];

function mediaRequired(): boolean {
  return String(process.env.WORLD_CUP_TV_REQUIRE_MEDIA || "true").trim() !== "false";
}

function hasVisualMedia(
  postType: "text" | "image" | "video" | "carousel",
  mediaUrls: string[]
): boolean {
  if (postType === "text" || !mediaUrls.length) return false;
  return postType === "image" || postType === "video" || postType === "carousel";
}

async function downloadTeamOrLeagueImage(remoteUrl: string, label: string): Promise<string | null> {
  const saved = await downloadRemoteToTvUploads(remoteUrl, ".png", "tv-wc");
  return saved?.publicPath ?? null;
}

function sanitizeText(input: string, max = 1200): string {
  return String(input || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function statusLabel(row: WorldCupFixtureRow): string {
  const short = String(row.fixture?.status?.short || "").trim().toUpperCase();
  const elapsed = row.fixture?.status?.elapsed;
  if (short === "FT") return "Full time";
  if (short === "HT") return "Half time";
  if (short === "NS") return "Kick-off";
  if (short === "PST") return "Postponed";
  if (typeof elapsed === "number" && elapsed > 0) return `${elapsed}'`;
  return short || "Update";
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

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysYmd(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function apiGet<T>(apiKey: string, path: string, params: Record<string, string | number>): Promise<T[]> {
  const res = await axios.get(`https://v3.football.api-sports.io${path}`, {
    headers: { "x-apisports-key": apiKey },
    params,
    timeout: 25000,
  });
  return Array.isArray(res.data?.response) ? (res.data.response as T[]) : [];
}

export async function fetchWorldCupFixtures(apiKey?: string): Promise<WorldCupFixtureRow[]> {
  const key = (apiKey || readApiKey()).trim();
  if (!key) return [];
  const league = leagueId();
  const season = seasonYear();

  const live = await apiGet<WorldCupFixtureRow>(key, "/fixtures", {
    league,
    season,
    live: "all",
  });
  if (live.length) return live;

  const today = await apiGet<WorldCupFixtureRow>(key, "/fixtures", {
    league,
    season,
    date: todayYmd(),
  });
  if (today.length) return today;

  return apiGet<WorldCupFixtureRow>(key, "/fixtures", {
    league,
    season,
    from: todayYmd(),
    to: addDaysYmd(6),
  });
}

type StandingRow = {
  rank?: number;
  team?: { name?: string };
  points?: number;
};

async function fetchWorldCupStandings(apiKey: string): Promise<string> {
  const rows = await apiGet<{ league?: { standings?: StandingRow[][] } }>(apiKey, "/standings", {
    league: leagueId(),
    season: seasonYear(),
  });
  const groups = rows[0]?.league?.standings;
  if (!groups?.length) return "";
  const lines: string[] = [];
  for (let i = 0; i < Math.min(groups.length, 4); i += 1) {
    const table = groups[i] || [];
    const label = `Group ${String.fromCharCode(65 + i)}`;
    const snippet = table
      .slice(0, 4)
      .map((r) => `${r.rank}. ${r.team?.name || "?"} (${r.points ?? 0} pts)`)
      .join("; ");
    if (snippet) lines.push(`${label}: ${snippet}`);
  }
  return lines.join(" · ");
}

async function fetchScorebatRows(): Promise<ScorebatVideoRow[]> {
  const token = String(process.env.SCOREBAT_API_TOKEN || "").trim();
  if (!token) return [];
  try {
    const url = `https://www.scorebat.com/video-api/v3/?token=${encodeURIComponent(token)}`;
    const res = await axios.get(url, { timeout: 20000 });
    return Array.isArray(res.data?.response) ? (res.data.response as ScorebatVideoRow[]) : [];
  } catch {
    return [];
  }
}

function isWorldCupScorebatRow(row: ScorebatVideoRow): boolean {
  const comp = String(row.competition || row.title || "").toLowerCase();
  return comp.includes("world cup") || comp.includes("fifa");
}

function worldCupScorebatRows(rows: ScorebatVideoRow[]): ScorebatVideoRow[] {
  return rows.filter(isWorldCupScorebatRow);
}

function pickScorebatHighlight(
  fixturesHome: string,
  fixturesAway: string,
  fixtureDateIso?: string,
  rows: ScorebatVideoRow[] = []
): { videoUrl?: string; thumbnailUrl?: string } | null {
  if (!rows.length) return null;
  const homeN = normalizeTeamName(fixturesHome);
  const awayN = normalizeTeamName(fixturesAway);
  const day = String(fixtureDateIso || "").slice(0, 10);
  const pool = worldCupScorebatRows(rows);
  if (!pool.length) return null;

  for (const row of pool) {
    const s1 = normalizeTeamName(String(row.side1?.name || ""));
    const s2 = normalizeTeamName(String(row.side2?.name || ""));
    const sameTeams = (homeN === s1 && awayN === s2) || (homeN === s2 && awayN === s1);
    if (!sameTeams) continue;
    const rowDay = String(row.date || "").slice(0, 10);
    if (day && rowDay && day !== rowDay) continue;
    const firstEmbed = parseEmbedSrc(row.videos?.[0]?.embed);
    const thumb = String(row.thumbnail || "").trim();
    return { videoUrl: firstEmbed || undefined, thumbnailUrl: thumb || undefined };
  }
  return null;
}

/** Latest FIFA / World Cup clip from Scorebat when no fixture-specific highlight exists. */
function pickLatestWorldCupScorebatHighlight(
  rows: ScorebatVideoRow[]
): { videoUrl?: string; thumbnailUrl?: string } | null {
  const pool = worldCupScorebatRows(rows);
  if (!pool.length) return null;
  const row = pool[0];
  const firstEmbed = parseEmbedSrc(row.videos?.[0]?.embed);
  const thumb = String(row.thumbnail || "").trim();
  return { videoUrl: firstEmbed || undefined, thumbnailUrl: thumb || undefined };
}

async function mediaFromHighlight(
  highlight: { videoUrl?: string; thumbnailUrl?: string } | null
): Promise<{ type: "image" | "video"; mediaUrls: string[] } | null> {
  if (!highlight) return null;
  if (highlight.videoUrl && looksLikeDirectVideoUrl(highlight.videoUrl)) {
    const saved = await downloadRemoteToTvUploads(highlight.videoUrl, ".mp4", "tv-wc");
    if (saved) return { type: "video", mediaUrls: [saved.publicPath] };
  }
  const thumb = highlight.thumbnailUrl || "";
  if (thumb) {
    const saved = await downloadRemoteToTvUploads(thumb, ".jpg", "tv-wc");
    if (saved) return { type: "image", mediaUrls: [saved.publicPath] };
  }
  return null;
}

async function buildPostMedia(
  highlight: ReturnType<typeof pickScorebatHighlight>,
  fixture: WorldCupFixtureRow
): Promise<{ type: "text" | "image" | "video" | "carousel"; mediaUrls: string[] }> {
  const fromHighlight = await mediaFromHighlight(highlight);
  if (fromHighlight) return fromHighlight;

  const logos = await buildDownloadedClubLogoMedia(fixture);
  if (logos.mediaUrls.length > 0) return logos;

  const leagueLogo = String(fixture.league?.logo || "").trim();
  if (leagueLogo) {
    const path = await downloadTeamOrLeagueImage(leagueLogo, "fifa-wc");
    if (path) return { type: "image", mediaUrls: [path] };
  }

  const homeLogo = String(fixture.teams?.home?.logo || "").trim();
  const awayLogo = String(fixture.teams?.away?.logo || "").trim();
  const flagPaths: string[] = [];
  if (homeLogo) {
    const p = await downloadTeamOrLeagueImage(homeLogo, "home");
    if (p) flagPaths.push(p);
  }
  if (awayLogo) {
    const p = await downloadTeamOrLeagueImage(awayLogo, "away");
    if (p) flagPaths.push(p);
  }
  if (flagPaths.length >= 2) return { type: "carousel", mediaUrls: flagPaths };
  if (flagPaths.length === 1) return { type: "image", mediaUrls: flagPaths };

  return { type: "text", mediaUrls: [] };
}

async function buildDigestMedia(
  fixtures: WorldCupFixtureRow[],
  scorebatRows: ScorebatVideoRow[]
): Promise<{ type: "text" | "image" | "video" | "carousel"; mediaUrls: string[] }> {
  const fromScorebat = await mediaFromHighlight(pickLatestWorldCupScorebatHighlight(scorebatRows));
  if (fromScorebat) return fromScorebat;

  const paths: string[] = [];
  for (const row of fixtures.slice(0, 4)) {
    const logos = await buildDownloadedClubLogoMedia(row);
    paths.push(...logos.mediaUrls);
  }
  const unique = [...new Set(paths)];
  if (unique.length >= 2) return { type: "carousel", mediaUrls: unique.slice(0, 8) };
  if (unique.length === 1) return { type: "image", mediaUrls: unique };

  const leagueLogo = String(fixtures[0]?.league?.logo || "").trim();
  if (leagueLogo) {
    const path = await downloadTeamOrLeagueImage(leagueLogo, "fifa-wc-digest");
    if (path) return { type: "image", mediaUrls: [path] };
  }

  return { type: "text", mediaUrls: [] };
}

function formatKickoff(iso?: string): string {
  if (!iso) return "TBC";
  try {
    return new Intl.DateTimeFormat("en-ZA", {
      timeZone: process.env.WORLD_CUP_TV_TIMEZONE || process.env.AI_NEWS_TIMEZONE || "Africa/Johannesburg",
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 16).replace("T", " ");
  }
}

async function postExistsToday(creatorId: mongoose.Types.ObjectId, marker: string): Promise<boolean> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const count = await TVPost.countDocuments({
    creatorId,
    subject: { $regex: marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" },
    createdAt: { $gte: start },
  });
  return count > 0;
}

async function publishFixturePost(
  creatorId: mongoose.Types.ObjectId,
  row: WorldCupFixtureRow,
  scorebatRows: ScorebatVideoRow[],
  dryRun: boolean
): Promise<string | null> {
  const fid = Number(row.fixture?.id || 0);
  if (!fid) return null;

  const dayKey = todayYmd();
  const marker = `WC:${fid}:${dayKey}`;
  if (await postExistsToday(creatorId, marker)) return null;

  const home = sanitizeText(String(row.teams?.home?.name || "Home"));
  const away = sanitizeText(String(row.teams?.away?.name || "Away"));
  const homeGoals = row.goals?.home;
  const awayGoals = row.goals?.away;
  const score =
    typeof homeGoals === "number" && typeof awayGoals === "number" ? `${homeGoals}-${awayGoals}` : "vs";
  const round = sanitizeText(String(row.league?.round || ""), 120);
  const status = statusLabel(row);
  const highlight = pickScorebatHighlight(home, away, row.fixture?.date, scorebatRows);
  const { type: postType, mediaUrls } = dryRun
    ? { type: "text" as const, mediaUrls: [] as string[] }
    : await buildPostMedia(highlight, row);

  const heading = sanitizeText(`World Cup: ${home} ${score} ${away}`, 180);
  let caption = sanitizeText(
    `${status} — ${home} ${score} ${away}.${round ? ` ${round}.` : ""} FIFA World Cup ${seasonYear()}.`,
    1200
  );
  if (highlight?.videoUrl && !looksLikeDirectVideoUrl(highlight.videoUrl)) {
    caption = sanitizeText(`${caption} Watch highlights on Scorebat.`, 1200);
  }
  const subject = sanitizeText(`Source: API-Sports World Cup · ${marker}`, 220);

  if (!dryRun && mediaRequired() && !hasVisualMedia(postType, mediaUrls)) {
    logger.info(`World Cup TV skip fixture ${fid}: no image/video media available`);
    return null;
  }

  if (dryRun) {
    logger.info(`[World Cup TV dry-run] ${heading} (${postType}, media=${mediaUrls.length})`);
    return "dry-run";
  }

  const post = await TVPost.create({
    creatorId,
    type: postType,
    mediaUrls,
    heading,
    caption,
    subject,
    hashtags: WORLD_CUP_HASHTAGS,
    genre: "sport",
    status: "approved",
    hasWatermark: true,
  });
  return String(post._id);
}

async function publishDailyDigest(
  creatorId: mongoose.Types.ObjectId,
  fixtures: WorldCupFixtureRow[],
  apiKey: string,
  scorebatRows: ScorebatVideoRow[],
  dryRun: boolean
): Promise<string | null> {
  const marker = `WC:digest:${todayYmd()}`;
  if (await postExistsToday(creatorId, marker)) return null;

  const standings = await fetchWorldCupStandings(apiKey);
  const schedule = fixtures
    .slice(0, 8)
    .map((r) => {
      const h = String(r.teams?.home?.name || "?");
      const a = String(r.teams?.away?.name || "?");
      return `${h} vs ${a} (${formatKickoff(r.fixture?.date)})`;
    })
    .join(" · ");

  const heading = sanitizeText(`World Cup ${seasonYear()} — daily update`, 160);
  const parts = [
    fixtures.length
      ? `Fixtures: ${schedule}.`
      : `No World Cup fixtures scheduled in the next week.`,
    standings ? `Standings snapshot: ${standings}` : "",
  ].filter(Boolean);
  const caption = sanitizeText(parts.join(" "), 1200);
  const subject = sanitizeText(`Source: API-Sports World Cup · ${marker}`, 220);

  const { type: postType, mediaUrls } = dryRun
    ? { type: "text" as const, mediaUrls: [] as string[] }
    : await buildDigestMedia(fixtures, scorebatRows);

  if (!dryRun && mediaRequired() && !hasVisualMedia(postType, mediaUrls)) {
    logger.info("World Cup TV skip daily digest: no image/video media available");
    return null;
  }

  if (dryRun) {
    logger.info(`[World Cup TV dry-run digest] ${heading} (${postType}, media=${mediaUrls.length})`);
    return "dry-run";
  }

  const post = await TVPost.create({
    creatorId,
    type: postType,
    mediaUrls,
    heading,
    caption,
    subject,
    hashtags: [...WORLD_CUP_HASHTAGS, "DailyUpdate"],
    genre: "sport",
    status: "approved",
    hasWatermark: true,
  });
  return String(post._id);
}

export async function publishWorldCupTvUpdates(opts?: {
  /** daily = digest + today's matches; live = in-progress matches only */
  mode?: "daily" | "live";
  dryRun?: boolean;
}): Promise<WorldCupTvRunResult> {
  const apiKey = readApiKey();
  if (!apiKey) {
    return { created: 0, postIds: [], message: "API_FOOTBALL_API_KEY missing" };
  }

  const mode = opts?.mode || "daily";
  const dryRun = !!opts?.dryRun;
  const creatorUsername = resolveWorldCupCreatorUsername();
  const creator = await User.findOne({ username: creatorUsername }).select("_id username").lean();
  if (!creator?._id) {
    return { created: 0, postIds: [], message: `Creator not found: ${creatorUsername}` };
  }

  const creatorId = creator._id as mongoose.Types.ObjectId;
  const [fixtures, scorebatRows] = await Promise.all([
    fetchWorldCupFixtures(apiKey),
    fetchScorebatRows(),
  ]);

  if (!fixtures.length && mode === "live") {
    return { created: 0, postIds: [], message: "No World Cup fixtures" };
  }

  const liveStatuses = new Set(["1H", "2H", "HT", "ET", "BT", "P", "LIVE"]);
  const matchPool =
    mode === "live"
      ? fixtures.filter((r) => liveStatuses.has(String(r.fixture?.status?.short || "").toUpperCase()))
      : fixtures;

  const postIds: string[] = [];
  let created = 0;
  const max = maxPostsPerRun();

  for (const row of matchPool) {
    if (created >= max) break;
    const id = await publishFixturePost(creatorId, row, scorebatRows, dryRun);
    if (id) {
      postIds.push(id);
      created += 1;
    }
  }

  if (mode === "daily" && created < max) {
    const digestId = await publishDailyDigest(creatorId, fixtures, apiKey, scorebatRows, dryRun);
    if (digestId) {
      postIds.push(digestId);
      created += 1;
    }
  }

  return {
    created,
    postIds,
    message: created ? undefined : "Nothing new to publish",
  };
}
