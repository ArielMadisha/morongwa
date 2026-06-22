import path from "path";
import { fileURLToPath } from "url";
import { mergeDeployConfig, sshConnect, execSsh } from "./lib/deploySsh.mjs";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

async function main() {
  const cfg = mergeDeployConfig(repoRoot);
  const live = (cfg.MORONGWA_LIVE_DIR || "/home/zweppe/morongwa-live").replace(/\/$/, "");
  const envFile = `${live}/backend/.env`;
  const conn = await sshConnect(cfg, repoRoot);
  await execSsh(
    conn,
    [
      `grep -E '^(PORT|FRONTEND_URL|AI_SPORTS_CRON|AI_NEWS_INCLUDE|MONGO)' "${envFile}" | sed 's/\\(KEY\\|URI\\|SECRET\\|TOKEN\\)=.*/\\1=.../'`,
      `docker exec morongwa-api-test sh -lc 'node -e "const c=require(\\\"node-cron\\\"); console.log(\\\"sports\\\", c.validate(process.env.AI_SPORTS_CRON||\\\"0 8 * * 2\\\"));"' 2>&1 || true`,
    ].join("\n")
  );
  conn.end();
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
