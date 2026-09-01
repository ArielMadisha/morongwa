#!/usr/bin/env node
/**
 * Set Bunnie Bakers login + profile picture.
 *
 *   node scripts/setBunnieBakersProfile.mjs --apply
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import https from "https";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import sharp from "sharp";
import { mergeDeployConfig, sshConnect, execSsh } from "./lib/deploySsh.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..", "..");
const ROOT = path.join(__dirname, "..");
const apply = process.argv.includes("--apply");
const skipPush = process.argv.includes("--skip-push");

const USERNAME = "bunniebakers";
const PHONE = "27677957679";
const PASSWORD = "11111111";
const SRC = path.join(
  "C:",
  "Users",
  "Dell",
  ".cursor",
  "projects",
  "c-Users-Dell-cursor-projects-morongwa",
  "assets",
  "c__Users_Dell_AppData_Roaming_Cursor_User_workspaceStorage_8cbbb33495ce43c096bb0498540fe740_images_image-59802059-3859-47ff-978b-22281f6a38b0.png"
);
const LOCAL_PROFILES = path.join(ROOT, "uploads", "profiles");

function sftpPut(conn, localPath, remotePath) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err);
      sftp.fastPut(localPath, remotePath, (e) => (e ? reject(e) : resolve()));
    });
  });
}

function headUrl(url) {
  return new Promise((resolve, reject) => {
    https
      .request(url, { method: "HEAD" }, (res) =>
        resolve({ status: res.statusCode, type: res.headers["content-type"] })
      )
      .on("error", reject)
      .end();
  });
}

async function main() {
  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI not set");
    process.exit(1);
  }
  if (!fs.existsSync(SRC)) {
    console.error("Missing profile image:", SRC);
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  const users = mongoose.connection.db.collection("users");
  const user = await users.findOne({
    $or: [{ username: USERNAME }, { phone: PHONE }, { phone: `+${PHONE}` }],
  });
  if (!user) {
    console.error("Bunnie Bakers user not found");
    process.exit(1);
  }

  const fileName = `bunniebakers-${String(user._id)}-avatar.jpg`;
  const outPath = path.join(LOCAL_PROFILES, fileName);
  const avatarUrl = `/uploads/profiles/${fileName}`;
  fs.mkdirSync(LOCAL_PROFILES, { recursive: true });

  await sharp(SRC)
    .rotate()
    .resize(800, 800, { fit: "cover", position: "centre" })
    .jpeg({ quality: 88 })
    .toFile(outPath);
  console.log("prepared", outPath);

  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  console.log(
    JSON.stringify(
      {
        dryRun: !apply,
        userId: String(user._id),
        username: USERNAME,
        phone: `+${PHONE}`,
        password: PASSWORD,
        avatar: avatarUrl,
      },
      null,
      2
    )
  );

  if (!apply) {
    console.log("Re-run with --apply");
    await mongoose.disconnect();
    return;
  }

  if (!skipPush) {
    const cfg = mergeDeployConfig(repoRoot);
    const remoteProfiles =
      (cfg.MORONGWA_BACKEND_HOST_PATH || "/home/zweppe/morongwa-live/backend").replace(
        /\/$/,
        ""
      ) + "/uploads/profiles";
    const conn = await sshConnect(cfg, repoRoot);
    try {
      await execSsh(conn, `mkdir -p "${remoteProfiles}"`);
      await sftpPut(conn, outPath, `${remoteProfiles}/${fileName}`);
      console.log("pushed", fileName);
    } finally {
      conn.end();
    }
    const u = `https://www.qwertymates.com${avatarUrl}`;
    console.log("HEAD", u, await headUrl(u));
  }

  const now = new Date();
  await users.updateOne(
    { _id: user._id },
    {
      $set: {
        name: "Bunnie Bakers",
        username: USERNAME,
        phone: PHONE,
        passwordHash,
        avatar: avatarUrl,
        isVerified: true,
        updatedAt: now,
      },
    }
  );

  const updated = await users.findOne({ _id: user._id });
  console.log(
    JSON.stringify(
      {
        ok: true,
        userId: String(updated._id),
        username: updated.username,
        phone: `+${updated.phone}`,
        password: PASSWORD,
        avatar: updated.avatar,
        loginHint: "Username @bunniebakers or cellphone +27 67 795 7679 — password 11111111",
      },
      null,
      2
    )
  );

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
