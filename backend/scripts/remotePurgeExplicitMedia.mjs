/**
 * Run purge:explicit-media on the production API host (same uploads volume as live site).
 */
import path from "path";
import { fileURLToPath } from "url";
import { mergeDeployConfig, sshConnect, execSsh } from "./lib/deploySsh.mjs";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const dry = process.argv.includes("--dry-run");
const args = process.argv.slice(2).filter((a) => a !== "--dry-run");
const flag = dry ? "--dry-run" : "";
const extra = args.join(" ");

async function main() {
  const cfg = mergeDeployConfig(repoRoot);
  const live = (cfg.MORONGWA_LIVE_DIR || "/home/zweppe/morongwa-live").replace(/\/$/, "");
  const conn = await sshConnect(cfg, repoRoot);
  const cmd = `cd ${live}/backend && npm run purge:explicit-media -- ${flag} ${extra}`.trim();
  console.log("Remote:", cmd);
  await execSsh(conn, cmd);
  conn.end();
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
