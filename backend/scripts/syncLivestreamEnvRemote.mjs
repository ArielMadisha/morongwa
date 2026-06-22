/**
 * Merge livestream-related vars from local backend/.env into the remote backend/.env
 * and restart morongwa-api-test so /api/live/start returns OBS + HLS URLs.
 *
 * Reads (when set locally, non-empty):
 *   HLS_PLAYBACK_BASE_URL or LIVESTREAM_HLS_PUBLIC_BASE
 *   RTMP_INGEST_URL — or derive from LIVESTREAM_RTMP_PUBLIC_HOST + LIVESTREAM_RTMP_APP (default app: live)
 *
 * Run from backend/:  npm run sync:livestream-env-remote
 * Requires: repo-root deploy-server.config + deploy-server.secrets (and/or SSH key via deploySsh).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { mergeDeployConfig, sshConnect, execSsh, loadKv } from "./lib/deploySsh.mjs";
import {
  upsertEnvLines,
  resolveRemoteBackendRoot,
  buildLivestreamEnvUpdates,
} from "./lib/livestreamRemoteEnv.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dirname, "..");
const repoRoot = path.join(backendRoot, "..");

function sftpReadFile(conn, remotePath) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err);
      sftp.readFile(remotePath, (e, buf) => {
        if (e) {
          if (e.code === 2 || e.code === "ENOENT") return resolve(null);
          return reject(e);
        }
        resolve(buf.toString("utf8"));
      });
    });
  });
}

function sftpWriteFile(conn, remotePath, content) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err);
      sftp.writeFile(remotePath, Buffer.from(content, "utf8"), (e) => {
        if (e) reject(e);
        else resolve();
      });
    });
  });
}

async function main() {
  const envPass = (process.env.DEPLOY_SSH_PASSWORD || "").trim();
  const cfg = mergeDeployConfig(repoRoot);
  if (envPass) cfg.DEPLOY_SSH_PASSWORD = envPass;

  const localEnvPath = path.join(backendRoot, ".env");
  if (!fs.existsSync(localEnvPath)) {
    throw new Error(`Missing ${localEnvPath}`);
  }
  const local = loadKv(localEnvPath);
  const { hls, rtmp, updates, ok } = buildLivestreamEnvUpdates(local);

  if (!ok) {
    throw new Error(
      "Local backend/.env must define LIVESTREAM_HLS_PUBLIC_BASE (or HLS_PLAYBACK_BASE_URL) and either RTMP_INGEST_URL or LIVESTREAM_RTMP_PUBLIC_HOST (RTMP URL can be derived as rtmp://HOST/live)."
    );
  }

  console.log("==> Livestream keys to sync on server:");
  console.log(` HLS_PLAYBACK_BASE_URL=${hls}`);
  console.log(`     RTMP_INGEST_URL=${rtmp}`);
  for (const k of ["LIVESTREAM_HLS_PUBLIC_BASE", "LIVESTREAM_RTMP_PUBLIC_HOST", "LIVESTREAM_RTMP_APP", "TV_CHANNEL_FFMPEG_RTMP_URL"]) {
    if (updates[k]) console.log(`     ${k}=${updates[k]}`);
  }

  const remoteBackendRoot = resolveRemoteBackendRoot(cfg).replace(/\/$/, "");
  const remoteEnv = `${remoteBackendRoot}/.env`;
  const apiContainer = (cfg.MORONGWA_API_DOCKER_NAME || "morongwa-api-test").trim() || "morongwa-api-test";

  console.log(`==> Remote .env: ${remoteEnv}`);
  console.log(`==> Container: ${apiContainer}`);

  const conn = await sshConnect(cfg, repoRoot);
  let existing = null;
  try {
    existing = await sftpReadFile(conn, remoteEnv);
  } catch (e) {
    console.warn("==> Could not read remote .env (will create):", String(e?.message || e));
  }
  const merged = upsertEnvLines(existing || "", updates);
  await sftpWriteFile(conn, remoteEnv, merged);
  console.log("==> Wrote merged .env on server.");

  await execSsh(conn, `docker restart ${apiContainer}`);
  conn.end();
  console.log(
    `==> Restarted ${apiContainer}. Test GET ${(local.BACKEND_URL || "https://api.qwertymates.com").replace(/\/$/, "")}/api/live/config`
  );
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
