/**
 * Upload one file under backend/uploads/profiles/ to production.
 *   node scripts/pushProfileFileRemote.mjs worldnews-69d4c50a8f33602fafe4e1b6-avatar-1780555303070.png
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { mergeDeployConfig, sshConnect } from "./lib/deploySsh.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..", "..");
const basename = (process.argv[2] || "").trim();
if (!basename) {
  console.error("Usage: node scripts/pushProfileFileRemote.mjs <filename-in-uploads/profiles>");
  process.exit(1);
}

const localPath = path.join(__dirname, "../uploads/profiles", basename);
if (!fs.existsSync(localPath)) {
  console.error(`Not found: ${localPath}`);
  process.exit(1);
}

function sftpPut(conn, local, remote) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err);
      sftp.fastPut(local, remote, (e) => (e ? reject(e) : resolve()));
    });
  });
}

const cfg = mergeDeployConfig(repoRoot);
const remoteRoot =
  (cfg.MORONGWA_BACKEND_HOST_PATH || "/home/zweppe/morongwa-live/backend").replace(/\/$/, "") +
  "/uploads/profiles";

const conn = await sshConnect(cfg, repoRoot);
try {
  await sftpPut(conn, localPath, `${remoteRoot}/${basename}`);
  console.log(`Uploaded ${basename} -> ${remoteRoot}/`);
} finally {
  conn.end();
}
