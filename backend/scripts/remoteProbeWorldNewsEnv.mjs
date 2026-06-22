/**
 * Inspect production .env keys for @worldnews autopost (no secret values printed).
 */
import path from "path";
import { fileURLToPath } from "url";
import { mergeDeployConfig, sshConnect, execSsh } from "./lib/deploySsh.mjs";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const KEYS =
  "AI_SPORTS_|AI_NEWS_CREATOR|FACEBOOK_TV_SPORTS|FACEBOOK_PAGE_ACCESS_TOKEN|FACEBOOK_APP_ID|FACEBOOK_TV_INGEST|API_FOOTBALL_TV";

async function main() {
  const cfg = mergeDeployConfig(repoRoot);
  const live = (cfg.MORONGWA_LIVE_DIR || "/home/zweppe/morongwa-live").replace(/\/$/, "");
  const envFile = `${live}/backend/.env`;
  const conn = await sshConnect(cfg, repoRoot);
  const cmd = [
    `echo "env file: ${envFile}"`,
    `wc -l "${envFile}"`,
    `grep -i facebook "${envFile}" | wc -l`,
    `grep -i openai "${envFile}" | head -1 | sed 's/=.*/=.../'`,
    `docker logs morongwa-api-test --tail 200 2>&1 | grep -iE 'scheduler|worldnews|facebook|sports' | tail -30 || true`,
  ].join("\n");
  await execSsh(conn, cmd);
  conn.end();
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
