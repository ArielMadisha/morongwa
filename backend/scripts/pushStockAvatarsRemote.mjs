#!/usr/bin/env node
/**
 * Push stock avatar PNGs to production (assets + uploads + dist/assets for old path bug).
 *   node scripts/pushStockAvatarsRemote.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { mergeDeployConfig, sshConnect, execSsh } from "./lib/deploySsh.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dirname, "..");
const localDir = path.join(backendRoot, "assets", "bulk-signup-avatars");
const FILES = [
  "male-1.png",
  "male-2.png",
  "male-3.png",
  "male-4.png",
  "female-1.png",
  "female-2.png",
  "female-3.png",
];

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
  return "/home/zweppe/morongwa-live/backend";
}

async function main() {
  for (const f of FILES) {
    if (!fs.existsSync(path.join(localDir, f))) throw new Error(`Missing local ${f}`);
  }
  const repoRoot = path.join(backendRoot, "..");
  const cfg = mergeDeployConfig(repoRoot);
  const remoteRoot = resolveRemoteBackendRoot(cfg);
  const conn = await sshConnect(cfg, repoRoot);
  try {
    const dirs = [
      `${remoteRoot}/assets/bulk-signup-avatars`,
      `${remoteRoot}/uploads/avatars/stock`,
      `${remoteRoot}/dist/assets/bulk-signup-avatars`,
    ];
    for (const d of dirs) {
      await execSsh(conn, `mkdir -p ${JSON.stringify(d)}`);
    }
    for (const f of FILES) {
      const local = path.join(localDir, f);
      for (const d of dirs) {
        const remote = `${d}/${f}`;
        await sftpPut(conn, local, remote);
        console.log("put", remote);
      }
    }
    console.log("Stock avatars pushed to", remoteRoot);
  } finally {
    conn.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
