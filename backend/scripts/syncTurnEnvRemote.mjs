/**
 * Sync TURN/WebRTC env from local backend/.env to remote backend/.env and restart API.
 * Run from backend/: node scripts/syncTurnEnvRemote.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { mergeDeployConfig, sshConnect, execSsh, loadKv } from "./lib/deploySsh.mjs";
import { upsertEnvLines, resolveRemoteBackendRoot } from "./lib/livestreamRemoteEnv.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dirname, "..");
const repoRoot = path.join(backendRoot, "..");

const TURN_KEYS = [
  "TURN_URLS",
  "TURN_REALM",
  "TURN_USERNAME",
  "TURN_PASSWORD",
  "TURN_SHARED_SECRET",
  "TURN_TTL_SECONDS",
  "TURN_ENFORCE_EPHEMERAL",
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

function buildTurnEnvUpdates(local) {
  /** @type {Record<string, string>} */
  const updates = {};
  for (const k of TURN_KEYS) {
    const v = String(local[k] || "").trim();
    if (v) updates[k] = v;
  }
  if (!updates.TURN_URLS) {
    updates.TURN_URLS =
      "turn:165.227.237.142:3478?transport=udp,turn:165.227.237.142:3478?transport=tcp,turns:165.227.237.142:5349?transport=tcp";
  }
  if (!updates.TURN_REALM) updates.TURN_REALM = "qwertymates.com";
  if (!updates.TURN_ENFORCE_EPHEMERAL) updates.TURN_ENFORCE_EPHEMERAL = "1";
  return updates;
}

async function main() {
  const localEnvPath = path.join(backendRoot, ".env");
  if (!fs.existsSync(localEnvPath)) throw new Error(`Missing ${localEnvPath}`);
  const local = loadKv(localEnvPath);
  const updates = buildTurnEnvUpdates(local);
  if (!updates.TURN_SHARED_SECRET && !updates.TURN_PASSWORD) {
    throw new Error("Local backend/.env must define TURN_SHARED_SECRET (or TURN_USERNAME + TURN_PASSWORD)");
  }

  const cfg = mergeDeployConfig(repoRoot);
  const remoteBackendRoot = resolveRemoteBackendRoot(cfg).replace(/\/$/, "");
  const remoteEnv = `${remoteBackendRoot}/.env`;
  const apiContainer = (cfg.MORONGWA_API_DOCKER_NAME || "morongwa-api-test").trim() || "morongwa-api-test";

  console.log("==> TURN keys to sync:");
  for (const k of Object.keys(updates)) {
    console.log(`  ${k}=${k.includes("SECRET") || k.includes("PASSWORD") ? "***" : updates[k]}`);
  }

  const conn = await sshConnect(cfg, repoRoot);
  let existing = null;
  try {
    existing = await sftpReadFile(conn, remoteEnv);
  } catch (e) {
    console.warn("Could not read remote .env:", e?.message || e);
  }
  const merged = upsertEnvLines(existing || "", updates);
  await sftpWriteFile(conn, remoteEnv, merged);
  console.log(`==> Wrote ${remoteEnv}`);

  await execSsh(conn, `docker restart ${apiContainer}`);
  conn.end();
  console.log(`==> Restarted ${apiContainer}. WebRTC TURN credentials should work now.`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
