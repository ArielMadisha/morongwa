/**
 * Sync LIVEKIT_* env from local backend/.env to remote backend/.env and restart API.
 * Run from backend/: node scripts/syncLivekitEnvRemote.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { mergeDeployConfig, sshConnect, execSsh, loadKv } from "./lib/deploySsh.mjs";
import { upsertEnvLines, resolveRemoteBackendRoot } from "./lib/livestreamRemoteEnv.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dirname, "..");
const repoRoot = path.join(backendRoot, "..");

const LIVEKIT_KEYS = [
  "LIVEKIT_URL",
  "LIVEKIT_API_KEY",
  "LIVEKIT_API_SECRET",
  "LIVEKIT_TOKEN_TTL_SECONDS",
];

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

function buildLivekitEnvUpdates(local) {
  const updates = {};
  for (const k of LIVEKIT_KEYS) {
    const v = String(local[k] || "").trim();
    if (v) updates[k] = v;
  }
  if (!updates.LIVEKIT_TOKEN_TTL_SECONDS) updates.LIVEKIT_TOKEN_TTL_SECONDS = "3600";
  if (!updates.LIVEKIT_URL || !updates.LIVEKIT_API_KEY || !updates.LIVEKIT_API_SECRET) {
    throw new Error("Local backend/.env must define LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET");
  }
  return updates;
}

async function main() {
  const localEnvPath = path.join(backendRoot, ".env");
  if (!fs.existsSync(localEnvPath)) throw new Error(`Missing ${localEnvPath}`);
  const local = loadKv(localEnvPath);
  const updates = buildLivekitEnvUpdates(local);

  const cfg = mergeDeployConfig(repoRoot);
  const remoteBackendRoot = resolveRemoteBackendRoot(cfg).replace(/\/$/, "");
  const remoteEnv = `${remoteBackendRoot}/.env`;
  const apiContainer = (cfg.MORONGWA_API_DOCKER_NAME || "morongwa-api-test").trim() || "morongwa-api-test";

  console.log("==> LiveKit keys to sync:");
  for (const k of Object.keys(updates)) {
    const hidden = k.includes("SECRET");
    console.log(`  ${k}=${hidden ? "***" : updates[k]}`);
  }

  const conn = await sshConnect(cfg, repoRoot);
  const existing = await sftpReadFile(conn, remoteEnv);
  const merged = upsertEnvLines(existing || "", updates);
  await sftpWriteFile(conn, remoteEnv, merged);
  console.log(`==> Wrote ${remoteEnv}`);

  await execSsh(conn, `docker restart ${apiContainer}`);
  conn.end();
  console.log(`==> Restarted ${apiContainer}. LiveKit config should now be available.`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
