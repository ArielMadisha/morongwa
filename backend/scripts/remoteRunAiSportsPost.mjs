/**
 * Run one AI sports post on production API container (@worldnews, --force).
 */
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
    `docker exec morongwa-api-test sh -lc 'cd /app && npm run ai-sports:post -- --force'`
  );
  conn.end();
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
