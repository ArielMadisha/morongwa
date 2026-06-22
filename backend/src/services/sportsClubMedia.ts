import fs from "fs";
import path from "path";
import crypto from "crypto";
import axios from "axios";

const UPLOADS_TV = path.join(process.cwd(), "uploads", "tv");

export type FootballFixtureRow = {
  fixture?: { id?: number; date?: string; status?: { short?: string } };
  league?: { name?: string; logo?: string };
  teams?: {
    home?: { name?: string; logo?: string };
    away?: { name?: string; logo?: string };
  };
};

function isHttpUrl(input: string): boolean {
  return /^https?:\/\//i.test(String(input || "").trim());
}

function normalizeTeamName(input: string): string {
  return String(input || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function readApiFootballKey(): string {
  return String(process.env.API_FOOTBALL_API_KEY || process.env.API_FOOTBALL_KEY || "").trim();
}

/** Skip Google News branding, puzzles, and other non-club lead art. */
export function isGenericSportsNewsImage(url: string): boolean {
  const u = String(url || "").toLowerCase();
  if (!u) return true;
  return (
    /news\.google/i.test(u) ||
    /googleusercontent\.com.*(news|favicon|logo)/i.test(u) ||
    /\/branding\//i.test(u) ||
    /gstatic\.com.*(news|logo)/i.test(u) ||
    /favicon/i.test(u) ||
    /placeholder/i.test(u)
  );
}

export function isLowValueSportsHeadline(title: string): boolean {
  const t = String(title || "").toLowerCase();
  return (
    /\bconnections\b/.test(t) ||
    /\bwordle\b/.test(t) ||
    /\bpuzzle\b/.test(t) ||
    /\bquiz\b/.test(t) ||
    /\bcrossword\b/.test(t) ||
    /\bsudoku\b/.test(t)
  );
}

async function downloadLogoToTvUploads(remoteUrl: string, label: string): Promise<string | null> {
  const url = String(remoteUrl || "").trim();
  if (!isHttpUrl(url)) return null;
  try {
    fs.mkdirSync(UPLOADS_TV, { recursive: true });
    const ext = url.toLowerCase().includes(".png") ? ".png" : ".png";
    const safe = label.replace(/[^a-z0-9]+/gi, "-").slice(0, 24) || "club";
    const filename = `tv-club-${safe}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}${ext}`;
    const dest = path.join(UPLOADS_TV, filename);
    const res = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 45000,
      maxContentLength: 8 * 1024 * 1024,
      headers: { "User-Agent": "Qwertymates-SportsMedia/1.0", Accept: "image/*,*/*" },
    });
    const mime = String(res.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
    if (mime && !mime.startsWith("image/")) return null;
    const buf = Buffer.from(res.data);
    if (buf.length < 200) return null;
    fs.writeFileSync(dest, buf);
    return `/uploads/tv/${filename}`;
  } catch {
    return null;
  }
}

export async function fetchFootballFixtures(apiKey?: string): Promise<FootballFixtureRow[]> {
  const key = (apiKey || readApiFootballKey()).trim();
  if (!key) return [];
  const headers = { "x-apisports-key": key };
  try {
    const live = await axios.get("https://v3.football.api-sports.io/fixtures", {
      headers,
      params: { live: "all" },
      timeout: 20000,
    });
    const liveRows = Array.isArray(live.data?.response)
      ? (live.data.response as FootballFixtureRow[])
      : [];
    if (liveRows.length > 0) return liveRows;
  } catch {
    /* try daily */
  }
  try {
    const today = new Date().toISOString().slice(0, 10);
    const daily = await axios.get("https://v3.football.api-sports.io/fixtures", {
      headers,
      params: { date: today },
      timeout: 20000,
    });
    return Array.isArray(daily.data?.response) ? (daily.data.response as FootballFixtureRow[]) : [];
  } catch {
    return [];
  }
}

export function findFixtureForHeadline(
  headline: string,
  fixtures: FootballFixtureRow[]
): FootballFixtureRow | null {
  const text = String(headline || "");
  const textNorm = normalizeTeamName(text);
  if (!textNorm || !fixtures.length) return null;

  let best: FootballFixtureRow | null = null;
  let bestScore = 0;
  for (const row of fixtures) {
    const home = String(row.teams?.home?.name || "").trim();
    const away = String(row.teams?.away?.name || "").trim();
    if (!home || !away) continue;
    const homeNorm = normalizeTeamName(home);
    const awayNorm = normalizeTeamName(away);
    let score = 0;
    if (homeNorm.length >= 4 && textNorm.includes(homeNorm)) score += 2;
    if (awayNorm.length >= 4 && textNorm.includes(awayNorm)) score += 2;
    if (score >= 3 && score > bestScore) {
      best = row;
      bestScore = score;
    }
  }
  return best;
}

/** Download home + away club badges (local paths). Skips league shield — it read as a generic emblem in feed. */
export async function buildDownloadedClubLogoMedia(
  fixture: FootballFixtureRow
): Promise<{ type: "text" | "image" | "carousel"; mediaUrls: string[] }> {
  const homeLogo = String(fixture.teams?.home?.logo || "").trim();
  const awayLogo = String(fixture.teams?.away?.logo || "").trim();
  const homeName = String(fixture.teams?.home?.name || "home");
  const awayName = String(fixture.teams?.away?.name || "away");

  const downloads = await Promise.all([
    homeLogo ? downloadLogoToTvUploads(homeLogo, homeName) : Promise.resolve(null),
    awayLogo ? downloadLogoToTvUploads(awayLogo, awayName) : Promise.resolve(null),
  ]);
  const mediaUrls = downloads.filter((p): p is string => Boolean(p));
  if (mediaUrls.length >= 2) return { type: "carousel", mediaUrls };
  if (mediaUrls.length === 1) return { type: "image", mediaUrls };
  return { type: "text", mediaUrls: [] };
}

export async function resolveSportsClubMediaFromHeadline(
  headline: string,
  fixtures?: FootballFixtureRow[]
): Promise<{ type: "text" | "image" | "carousel"; mediaUrls: string[] }> {
  const rows = fixtures ?? (await fetchFootballFixtures());
  const match = findFixtureForHeadline(headline, rows);
  if (!match) return { type: "text", mediaUrls: [] };
  return buildDownloadedClubLogoMedia(match);
}

/** Prefer a live fixture visual when headline has no team names (e.g. general sports wire). */
export async function resolveSportsClubMediaFallback(
  fixtures?: FootballFixtureRow[]
): Promise<{ type: "text" | "image" | "carousel"; mediaUrls: string[] }> {
  const rows = fixtures ?? (await fetchFootballFixtures());
  const live = rows.find(
    (r) =>
      String(r.fixture?.status?.short || "").toUpperCase() !== "NS" &&
      r.teams?.home?.logo &&
      r.teams?.away?.logo
  );
  const pick = live || rows.find((r) => r.teams?.home?.logo && r.teams?.away?.logo);
  if (!pick) return { type: "text", mediaUrls: [] };
  return buildDownloadedClubLogoMedia(pick);
}
