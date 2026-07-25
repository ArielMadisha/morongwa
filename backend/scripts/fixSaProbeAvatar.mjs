#!/usr/bin/env node
/**
 * Replace SA Probe (@saprobe006466) profile picture with a stock avatar.
 *
 *   node scripts/fixSaProbeAvatar.mjs --apply --push-remote
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import { mergeDeployConfig, sshConnect, execSsh } from "./lib/deploySsh.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dirname, "..");
const repoRoot = path.join(backendRoot, "..");
const apply = process.argv.includes("--apply");
const pushRemote = process.argv.includes("--push-remote");

const USERNAME = "saprobe006466";
const STOCK_FILE = "male-2.png";
const STOCK_SRC = path.join(backendRoot, "assets", "bulk-signup-avatars", STOCK_FILE);
const STOCK_UPLOAD = path.join(backendRoot, "uploads", "avatars", "stock", STOCK_FILE);
const STOCK_URL = `/uploads/avatars/stock/${STOCK_FILE}`;

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

async function main() {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI missing");
  if (!fs.existsSync(STOCK_SRC)) {
    console.error("Missing stock asset:", STOCK_SRC);
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(STOCK_UPLOAD), { recursive: true });
  fs.copyFileSync(STOCK_SRC, STOCK_UPLOAD);

  await mongoose.connect(process.env.MONGO_URI);
  const users = mongoose.connection.db.collection("users");
  const user = await users.findOne({
    $or: [
      { username: USERNAME },
      { username: { $regex: /^saprobe/i } },
      { name: { $regex: /^SA\s*Probe$/i } },
    ],
  });
  if (!user) {
    console.error("SA Probe not found");
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        dryRun: !apply,
        id: String(user._id),
        name: user.name,
        username: user.username,
        oldAvatar: user.avatar || null,
        newAvatar: STOCK_URL,
      },
      null,
      2
    )
  );

  if (!apply) {
    console.log("Re-run with --apply --push-remote");
    await mongoose.disconnect();
    return;
  }

  await users.updateOne(
    { _id: user._id },
    {
      $set: { avatar: STOCK_URL, updatedAt: new Date() },
      $unset: { stockAvatarKey: "", avatarLetter: "" },
    }
  );

  if (pushRemote) {
    const cfg = mergeDeployConfig(repoRoot);
    const remoteRoot = resolveRemoteBackendRoot(cfg);
    const conn = await sshConnect(cfg, repoRoot);
    try {
      await execSsh(conn, `mkdir -p "${remoteRoot}/uploads/avatars/stock"`);
      await sftpPut(conn, STOCK_UPLOAD, `${remoteRoot}/uploads/avatars/stock/${STOCK_FILE}`);
      console.log("Pushed stock avatar file to production");
    } finally {
      conn.end();
    }
  }

  await mongoose.disconnect();
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
