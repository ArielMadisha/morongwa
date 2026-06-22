/**
 * Sync backend/uploads/avatars/stock/** to production API uploads.
 *   node scripts/pushBulkSignupAvatarsRemote.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { mergeDeployConfig, sshConnect, execSsh } from "./lib/deploySsh.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..", "..");
const localDir = path.join(__dirname, "..", "uploads", "avatars", "stock");

function sftpPut(conn, localPath, remotePath) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err);
      sftp.fastPut(localPath, remotePath, (e) => {
        if (e) reject(e);
        else resolve();
      });
    });
  });
}

function resolveRemoteBackendRoot(cfg) {
  const explicit = (cfg.MORONGWA_BACKEND_HOST_PATH || "").trim().replace(/\/$/, "");
  if (explicit) return explicit;
  const live = (cfg.MORONGWA_LIVE_DIR || "").trim().replace(/\/$/, "");
  if (live) return `${live}/backend`;
  const deployPath = (cfg.DEPLOY_REMOTE_PATH || "").trim().replace(/\/$/, "");
  if (deployPath) return `${deployPath}/backend`;
  return "/home/zweppe/morongwa-live/backend";
}

async function main() {
  if (!fs.existsSync(localDir)) {
    throw new Error(`Missing local stock avatars: ${localDir}`);
  }
  const files = fs.readdirSync(localDir).filter((f) => /\.png$/i.test(f));
  if (!files.length) throw new Error("No PNG files in stock avatars folder");

  const cfg = mergeDeployConfig(repoRoot);
  const remoteRoot = resolveRemoteBackendRoot(cfg);
  const remoteDir = `${remoteRoot}/uploads/avatars/stock`;

  const conn = await sshConnect(cfg, repoRoot);
  try {
    await execSsh(conn, `mkdir -p "${remoteDir}"`);
    for (const file of files) {
      const local = path.join(localDir, file);
      const remote = `${remoteDir}/${file}`;
      console.log(`upload ${file} -> ${remote}`);
      await sftpPut(conn, local, remote);
    }
    console.log(`Done. ${files.length} stock avatar(s) on production.`);
  } finally {
    conn.end();
  }
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
