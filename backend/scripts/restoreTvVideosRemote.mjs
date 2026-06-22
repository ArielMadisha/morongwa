/**
 * Restore deleted TV video posts on production using uploads/tv + docker logs.
 *
 *   npm run restore:tv-videos:remote:dry
 *   npm run restore:tv-videos:remote
 */
import path from "path";
import { fileURLToPath } from "url";
import { mergeDeployConfig, sshConnect } from "./lib/deploySsh.mjs";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const apply = process.argv.includes("--apply");

function execSsh(conn, cmd) {
  return new Promise((resolve, reject) => {
    let out = "";
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      stream.on("data", (d) => {
        out += String(d);
        process.stdout.write(String(d));
      });
      stream.stderr.on("data", (d) => process.stderr.write(String(d)));
      stream.on("close", (code) => resolve({ code, stdout: out }));
    });
  });
}

async function main() {
  const cfg = mergeDeployConfig(repoRoot);
  const api = (cfg.MORONGWA_API_DOCKER_NAME || "morongwa-api-test").trim();
  const remoteBackend = (cfg.MORONGWA_REMOTE_BACKEND_PATH || "/home/zweppe/morongwa-live/backend").trim();
  const logPathHost = `${remoteBackend}/tv-upload-recovery.log`;
  const logPathContainer = "/app/tv-upload-recovery.log";
  const flag = apply ? "--apply" : "";
  const conn = await sshConnect(cfg, repoRoot);

  console.log(`==> Export TV upload log lines to ${logPathHost}`);
  await execSsh(
    conn,
    `docker logs ${api} 2>&1 | grep -F 'TV media uploaded' > ${logPathHost} || true; wc -l ${logPathHost}`
  );

  console.log(`==> ${apply ? "Restore" : "Dry-run restore"} TV videos inside ${api}`);
  await execSsh(
    conn,
    `docker exec -e TV_UPLOAD_LOG_FILE=${logPathContainer} -e RESTORE_TV_ORPHAN_USER_ID=69d4c476574fc61dbbeee3a0 ${api} bash -lc 'cd /app && npx ts-node-dev --transpile-only --exit-child scripts/restoreTvVideosFromDisk.ts ${flag}'`
  );

  if (apply) {
    console.log("==> Restart API to clear TV feed cache");
    await execSsh(conn, `docker restart ${api}`);
  }

  conn.end();
  console.log("==> Done.");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
