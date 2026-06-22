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
      `echo "env: ${envFile}"`,
      `(grep -iE 'API_FOOTBALL|SCOREBAT' "${envFile}" 2>/dev/null | sed 's/=.*/=.../' || echo '(no API_FOOTBALL keys on production)')`,
      `docker logs morongwa-api-test --tail 300 2>&1 | grep -iE 'api-football|API-Football|worldofsport' | tail -15 || true`,
    ].join("\n")
  );
  conn.end();
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
