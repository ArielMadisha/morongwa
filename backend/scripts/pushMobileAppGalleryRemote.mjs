/**
 * Sync backend/uploads/mobile-releases/** to production (Android AAB + Huawei APK + manifest + gallery).
 *
 *   node scripts/pushMobileAppGalleryRemote.mjs
 */
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { mergeDeployConfig, sshConnect, execSsh } from "./lib/deploySsh.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..", "..");
const backendRoot = path.join(repoRoot, "backend");
const localBase = path.join(backendRoot, "uploads", "mobile-releases");

function sftpPut(conn, localPath, remotePath) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err);
      sftp.fastPut(localPath, remotePath, (e) => (e ? reject(e) : resolve()));
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

async function syncTarball(cfg, conn, remoteBackendRoot) {
  const uploadsParent = path.dirname(localBase);
  const dirName = path.basename(localBase);
  const bundleLocal = path.join(uploadsParent, `${dirName}-sync.tgz`);
  const remoteBundle = `/tmp/${dirName}-sync.tgz`;
  const remoteRoot = `${remoteBackendRoot}/uploads/${dirName}`;

  console.log(`==> Creating tarball ${bundleLocal} …`);
  if (fs.existsSync(bundleLocal)) fs.unlinkSync(bundleLocal);

  const tar = spawnSync("tar", ["-czf", bundleLocal, "-C", uploadsParent, dirName], {
    stdio: "inherit",
    shell: false,
  });
  if (tar.status !== 0) throw new Error(`tar failed (exit ${tar.status})`);

  const mb = (fs.statSync(bundleLocal).size / (1024 * 1024)).toFixed(1);
  console.log(`==> Bundle ${mb} MB — uploading …`);
  await sftpPut(conn, bundleLocal, remoteBundle);

  await execSsh(
    conn,
    `mkdir -p "${remoteBackendRoot}/uploads" && tar xzf "${remoteBundle}" -C "${remoteBackendRoot}/uploads" && rm -f "${remoteBundle}" && find "${remoteRoot}" -type f | wc -l`
  );

  try {
    fs.unlinkSync(bundleLocal);
  } catch {
    /* ignore */
  }
}

async function main() {
  if (!fs.existsSync(localBase)) {
    console.error(`Missing ${localBase} — run npm run mobile:fetch-artifacts first`);
    process.exit(1);
  }

  const cfg = mergeDeployConfig(repoRoot);
  const remoteBackendRoot = resolveRemoteBackendRoot(cfg).replace(/\/$/, "");
  console.log(`==> Push mobile-releases -> ${remoteBackendRoot}/uploads/mobile-releases/`);

  const conn = await sshConnect(cfg, repoRoot);
  try {
    await syncTarball(cfg, conn, remoteBackendRoot);
    const listing = await execSsh(
      conn,
      `ls -la "${remoteBackendRoot}/uploads/mobile-releases" 2>/dev/null; ls -la "${remoteBackendRoot}/uploads/mobile-releases/android" 2>/dev/null; ls -la "${remoteBackendRoot}/uploads/mobile-releases/huawei" 2>/dev/null`
    );
    console.log(listing);
  } finally {
    conn.end();
  }

  console.log("==> Mobile app gallery sync done.");
  console.log("    Manifest: https://api.qwertymates.com/uploads/mobile-releases/manifest.json");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
