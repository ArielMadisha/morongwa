/**
 * Patch production .env with API-Football keys from local backend/.env
 */
import path from "path";
import { fileURLToPath } from "url";
import { mergeDeployConfig, sshConnect, execSsh, loadKv } from "./lib/deploySsh.mjs";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const localEnv = loadKv(path.join(repoRoot, "backend", ".env"));

function shellQuote(val) {
  return `'${String(val).replace(/'/g, `'\\''`)}'`;
}

async function main() {
  const patch = {
    API_FOOTBALL_API_KEY: (localEnv.API_FOOTBALL_API_KEY || localEnv.API_FOOTBALL_KEY || "").trim(),
    API_FOOTBALL_TV_CREATOR_USERNAME: (localEnv.API_FOOTBALL_TV_CREATOR_USERNAME || "worldofsport").trim(),
    API_FOOTBALL_MAX_POSTS_PER_RUN: (localEnv.API_FOOTBALL_MAX_POSTS_PER_RUN || "3").trim(),
    API_FOOTBALL_LOOP_MINUTES: (localEnv.API_FOOTBALL_LOOP_MINUTES || "0").trim(),
    WORLD_CUP_TV_ENABLED: "true",
    WORLD_CUP_TV_CREATOR_USERNAME: (localEnv.WORLD_CUP_TV_CREATOR_USERNAME || "worldofsport").trim(),
    WORLD_CUP_TV_REQUIRE_MEDIA: "true",
    WORLD_CUP_TV_CRON: (localEnv.WORLD_CUP_TV_CRON || "0 7,19 * * *").trim(),
    WORLD_CUP_TV_LIVE_INTERVAL_MINUTES: (localEnv.WORLD_CUP_TV_LIVE_INTERVAL_MINUTES || "25").trim(),
    WORLD_CUP_LEAGUE_ID: (localEnv.WORLD_CUP_LEAGUE_ID || "1").trim(),
    WORLD_CUP_SEASON: (localEnv.WORLD_CUP_SEASON || "2026").trim(),
  };
  const scorebat = (localEnv.SCOREBAT_API_TOKEN || "").trim();
  if (scorebat) patch.SCOREBAT_API_TOKEN = scorebat;
  if (!patch.API_FOOTBALL_API_KEY) throw new Error("API_FOOTBALL_API_KEY missing in local backend/.env");

  const cfg = mergeDeployConfig(repoRoot);
  const live = (cfg.MORONGWA_LIVE_DIR || "/home/zweppe/morongwa-live").replace(/\/$/, "");
  const envFile = `${live}/backend/.env`;
  const lines = [];
  for (const [key, value] of Object.entries(patch)) {
    if (!value) continue;
    lines.push(
      `if grep -q '^${key}=' "${envFile}" 2>/dev/null; then`,
      `  sed -i 's|^${key}=.*|${key}=${shellQuote(value)}|' "${envFile}"`,
      `else`,
      `  echo '${key}=${shellQuote(value)}' >> "${envFile}"`,
      `fi`
    );
  }
  lines.push(
    `grep -E '^(API_FOOTBALL|WORLD_CUP_|SCOREBAT)' "${envFile}" | sed 's/=.*/=.../'`,
    `docker restart morongwa-api-test`
  );
  const conn = await sshConnect(cfg, repoRoot);
  await execSsh(conn, lines.join("\n"));
  conn.end();
  console.log("Production API-Football env synced.");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
