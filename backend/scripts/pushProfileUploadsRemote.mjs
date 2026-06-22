/**
 * SFTP local backend/uploads/profiles/school-* images to the production host
 * (backend tarball deploy excludes uploads/, so backfill output must be synced separately).
 *
 *   node scripts/pushProfileUploadsRemote.mjs
 *   node scripts/pushProfileUploadsRemote.mjs --user-id=69cd1cb9703cf9d7f5bb8575
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
  const userIdArg = process.argv.find((a) => a.startsWith("--user-id="));
  const userId = userIdArg ? userIdArg.split("=")[1]?.trim() : "";

  const profilesDir = path.join(__dirname, "..", "uploads", "profiles");
  if (!fs.existsSync(profilesDir)) {
    console.log("No local backend/uploads/profiles — nothing to sync.");
    process.exit(0);
  }

  let files = fs
    .readdirSync(profilesDir)
    .filter((f) => f.startsWith("school-") && /\.(jpe?g|png|gif|webp)$/i.test(f));
  if (userId) {
    files = files.filter((f) => f.includes(`school-${userId}-`));
  }
  if (files.length === 0) {
    console.log("No matching school profile images — nothing to sync.");
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
    console.log("==> Profile uploads sync done.");
  } finally {
    conn.end();
  }
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
