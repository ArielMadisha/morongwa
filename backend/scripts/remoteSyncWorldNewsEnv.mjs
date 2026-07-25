/**
 * Patch production backend/.env for @worldnews autopost (cron, creator, Facebook ingest).
 * Reads FACEBOOK_* and AI_SPORTS_* from local backend/.env when set.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  mergeDeployConfig,
  sshConnect,
  execSsh,
  loadKv,
  buildRemoteEnvPatchScript,
} from "./lib/deploySsh.mjs";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const localEnv = loadKv(path.join(repoRoot, "backend", ".env"));

const PATCH_KEYS = {
  AI_SPORTS_CREATOR_USERNAME: "worldnews",
  AI_NEWS_CREATOR_USERNAME: localEnv.AI_NEWS_CREATOR_USERNAME || "worldnews",
  AI_SPORTS_CRON: "0 8,12,18 * * 2,5",
  AI_SPORTS_ENABLED: "true",
  FACEBOOK_TV_SPORTS_CREATOR_USERNAME: "worldnews",
  FACEBOOK_TV_INGEST_ENABLED: "1",
  FACEBOOK_TV_INGEST_TZ: "Africa/Johannesburg",
  AI_NEWS_INCLUDE_IMAGE: "true",
  WORLD_CUP_TV_ENABLED: "true",
  WORLD_CUP_TV_CREATOR_USERNAME: "worldofsport",
  WORLD_CUP_TV_REQUIRE_MEDIA: "true",
  WORLD_CUP_TV_CRON: "0 7,19 * * *",
  WORLD_CUP_TV_LIVE_INTERVAL_MINUTES: "25",
  WORLD_CUP_LEAGUE_ID: "1",
  WORLD_CUP_SEASON: "2026",
  WORLD_CUP_TV_MAX_POSTS_PER_RUN: "4",
};

function pickApiFootball() {
  const apiKey = (localEnv.API_FOOTBALL_API_KEY || localEnv.API_FOOTBALL_KEY || "").trim();
  const scorebat = (localEnv.SCOREBAT_API_TOKEN || "").trim();
  const out = {};
  if (apiKey) out.API_FOOTBALL_API_KEY = apiKey;
  if (scorebat) out.SCOREBAT_API_TOKEN = scorebat;
  return out;
}

function pickFacebook() {
  const appId = (localEnv.FACEBOOK_APP_ID || "").trim();
  const appSecret = (localEnv.FACEBOOK_APP_SECRET || "").trim();
  const token = (localEnv.FACEBOOK_PAGE_ACCESS_TOKEN || "").trim();
  if (!appId || !appSecret || !token) return {};
  const siteUrl = (localEnv.FACEBOOK_MARKETPLACE_SITE_URL || "https://www.qwertymates.com").trim();
  const mediaOrigin = (localEnv.FACEBOOK_MARKETPLACE_MEDIA_ORIGIN || "https://api.qwertymates.com").trim();
  return {
    FACEBOOK_APP_ID: appId,
    FACEBOOK_APP_SECRET: appSecret,
    FACEBOOK_PAGE_ACCESS_TOKEN: token,
    FACEBOOK_MARKETPLACE_SITE_URL: siteUrl,
    FACEBOOK_MARKETPLACE_MEDIA_ORIGIN: mediaOrigin,
  };
}

async function main() {
  const cfg = mergeDeployConfig(repoRoot);
  const live = (cfg.MORONGWA_LIVE_DIR || "/home/zweppe/morongwa-live").replace(/\/$/, "");
  const envFile = `${live}/backend/.env`;
  const patch = { ...PATCH_KEYS, ...pickFacebook(), ...pickApiFootball() };
  const filtered = Object.fromEntries(Object.entries(patch).filter(([, v]) => v));

  const lines = [
    buildRemoteEnvPatchScript(envFile, filtered),
    `grep -E '^(AI_SPORTS_|AI_NEWS_CREATOR|FACEBOOK_TV_|FACEBOOK_APP|FACEBOOK_PAGE|WORLD_CUP_|API_FOOTBALL|SCOREBAT)' "${envFile}" | sed 's/=.*/=.../'`,
    `docker restart morongwa-api-test`,
  ];

  const conn = await sshConnect(cfg, repoRoot);
  await execSsh(conn, lines.join("\n"));
  conn.end();
  console.log("Production @worldnews env synced.");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
