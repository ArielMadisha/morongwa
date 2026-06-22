import path from "path";
import { fileURLToPath } from "url";
import { mergeDeployConfig, sshConnect, execSsh } from "./lib/deploySsh.mjs";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

async function main() {
  const cfg = mergeDeployConfig(repoRoot);
  const live = (cfg.MORONGWA_LIVE_DIR || "/home/zweppe/morongwa-live").replace(/\/$/, "");
  const conn = await sshConnect(cfg, repoRoot);
  await execSsh(
    conn,
    [
      `docker ps -a --filter name=morongwa-api-test --format '{{.Names}} {{.Status}}'`,
      `grep '^AI_SPORTS_CRON=' "${live}/backend/.env" || true`,
      `curl -s -o /dev/null -w 'upstream:%{http_code}\\n' http://127.0.0.1:4010/health || echo upstream:fail`,
      `docker logs morongwa-api-test --tail 50 2>&1`,
    ].join("\n")
  );
  conn.end();
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
