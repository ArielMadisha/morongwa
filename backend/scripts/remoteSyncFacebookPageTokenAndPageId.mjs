/**
 * Patch production FACEBOOK_PAGE_ACCESS_TOKEN + FACEBOOK_QWERTYMATES_PAGE_ID
 * from local backend/.env and restart API.
 */
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

async function main() {
  const token = (localEnv.FACEBOOK_PAGE_ACCESS_TOKEN || "").trim();
  const pageId = (localEnv.FACEBOOK_QWERTYMATES_PAGE_ID || "427972753928205").trim();
  const pageToken = (localEnv.FACEBOOK_QWERTYMATES_PAGE_ACCESS_TOKEN || "").trim();
  if (!token || token.length < 40) {
    console.error("FACEBOOK_PAGE_ACCESS_TOKEN missing or too short in backend/.env");
    process.exit(1);
  }

  const cfg = mergeDeployConfig(repoRoot);
  const live = (cfg.MORONGWA_LIVE_DIR || "/home/zweppe/morongwa-live").replace(/\/$/, "");
  const envFile = `${live}/backend/.env`;
  const patch = {
    FACEBOOK_PAGE_ACCESS_TOKEN: token,
    FACEBOOK_QWERTYMATES_PAGE_ID: pageId,
    ...(pageToken.length >= 40 ? { FACEBOOK_QWERTYMATES_PAGE_ACCESS_TOKEN: pageToken } : {}),
  };

  const lines = [
    buildRemoteEnvPatchScript(envFile, patch),
    `grep -E '^FACEBOOK_(PAGE_ACCESS_TOKEN|QWERTYMATES_PAGE_ID)=' "${envFile}" | sed 's/=.*/=.../'`,
    `docker restart morongwa-api-test`,
  ];

  const conn = await sshConnect(cfg, repoRoot);
  await execSsh(conn, lines.join("\n"));
  conn.end();
  console.log(`Production Facebook token+pageId synced (tokenLen=${token.length}, pageId=${pageId}).`);
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
