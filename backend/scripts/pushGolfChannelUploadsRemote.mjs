/**
 * SFTP golfchannel-* profile images to production.
 *   node scripts/pushGolfChannelUploadsRemote.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { mergeDeployConfig, sshConnect, execSsh } from "./lib/deploySsh.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..", "..");

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
  const profilesDir = path.join(__dirname, "..", "uploads", "profiles");
  if (!fs.existsSync(profilesDir)) {
    console.log("No local backend/uploads/profiles — nothing to sync.");
    process.exit(0);
  }

  const files = fs
    .readdirSync(profilesDir)
    .filter((f) => f.startsWith("golfchannel-") && /\.(jpe?g|png|gif|webp)$/i.test(f));

  if (files.length === 0) {
    console.log("No golfchannel-* profile images — run setupGolfChannelAccount.ts first.");
    process.exit(0);
  }

  const cfg = mergeDeployConfig(repoRoot);
  const remoteDir = `${resolveRemoteBackendRoot(cfg)}/uploads/profiles`;

  console.log(`==> Upload ${files.length} file(s) -> ${remoteDir}/`);
  const conn = await sshConnect(cfg, repoRoot);
  try {
    await execSsh(conn, `mkdir -p "${remoteDir}"`);
    for (const name of files) {
      const local = path.join(profilesDir, name);
      const remote = `${remoteDir}/${name}`;
      await sftpPut(conn, local, remote);
      console.log(`    ${name}`);
    }
    console.log("==> Golf Channel profile uploads sync done.");
  } finally {
    conn.end();
  }
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
