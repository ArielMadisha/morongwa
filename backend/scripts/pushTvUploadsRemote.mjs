/**
 * SFTP local backend/uploads/tv files to production (backend tarball excludes uploads/).
 *
 * Default: only files whose name starts with "tv-boitshepo-" (school seed output).
 *
 * Run from backend/: node scripts/pushTvUploadsRemote.mjs
 * Optional: node scripts/pushTvUploadsRemote.mjs --prefix=tv-boitshepo-
 *
 * Auth: same as other deploy scripts — deploy-server.config + deploy-server.secrets,
 * optional DEPLOY_SECRET / DEPLOY_SSH_PASSWORD / DEPLOY_SSH_PRIVATE_KEY_PATH via backend/.env.
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

function argValue(argv, prefix) {
  const hit = argv.find((a) => a.startsWith(prefix));
  if (!hit) return undefined;
  const rest = hit.slice(prefix.length).trim();
  if (rest) return rest;
  const i = argv.indexOf(hit);
  const next = argv[i + 1];
  return next && !next.startsWith("--") ? next : undefined;
}

async function main() {
  const argv = process.argv.slice(2);
  const prefix = (argValue(argv, "--prefix=") || "tv-boitshepo-").trim();

  const envPass = (process.env.DEPLOY_SSH_PASSWORD || "").trim();
  const cfg = mergeDeployConfig(repoRoot);
  if (envPass) cfg.DEPLOY_SSH_PASSWORD = envPass;

  const backendRoot = path.join(repoRoot, "backend");
  const tvDir = path.join(backendRoot, "uploads", "tv");
  if (!fs.existsSync(tvDir)) {
    console.log(`No local ${tvDir} — nothing to sync.`);
    process.exit(0);
  }

  const files = fs
    .readdirSync(tvDir)
    .filter(
      (f) =>
        f.startsWith(prefix) &&
        /\.(jpe?g|png|gif|webp)$/i.test(f)
    )
    .sort();
  if (files.length === 0) {
    console.log(`No files under uploads/tv matching prefix "${prefix}" — nothing to sync.`);
    process.exit(0);
  }

  const remoteBackendRoot = resolveRemoteBackendRoot(cfg).replace(/\/$/, "");
  const remoteDir = `${remoteBackendRoot}/uploads/tv`;

  console.log(`==> Upload ${files.length} file(s) with prefix "${prefix}" -> ${remoteDir}/`);
  const secretsPath = path.join(repoRoot, "deploy-server.secrets");
  const conn = await sshConnect(cfg, repoRoot, { secretsPath });
  await execSsh(conn, `mkdir -p "${remoteDir}"`);

  for (const name of files) {
    const local = path.join(tvDir, name);
    const remote = `${remoteDir}/${name}`;
    await sftpPut(conn, local, remote);
    console.log(`    ${name}`);
  }
  conn.end();
  console.log("==> TV uploads sync done.");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
