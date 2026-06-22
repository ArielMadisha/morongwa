/**
 * Ensure production backend .env enables strict content moderation flags.
 */
import path from "path";
import { fileURLToPath } from "url";
import { mergeDeployConfig, sshConnect, execSsh } from "./lib/deploySsh.mjs";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

async function main() {
  const cfg = mergeDeployConfig(repoRoot);
  const live = (cfg.MORONGWA_LIVE_DIR || "/home/zweppe/morongwa-live").replace(/\/$/, "");
  const envFile = `${live}/backend/.env`;
  const conn = await sshConnect(cfg, repoRoot);
  const cmd = `
set -e
touch "${envFile}"
grep -q '^CONTENT_MODERATION_REQUIRED=' "${envFile}" 2>/dev/null || echo 'CONTENT_MODERATION_REQUIRED=1' >> "${envFile}"
grep -q '^CONTENT_MODERATION_BLOCK_SUGGESTIVE=' "${envFile}" 2>/dev/null || echo 'CONTENT_MODERATION_BLOCK_SUGGESTIVE=1' >> "${envFile}"
grep '^CONTENT_MODERATION_' "${envFile}" || true
docker restart morongwa-api-test 2>/dev/null || true
`.trim();
  console.log(await execSsh(conn, cmd));
  conn.end();
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
