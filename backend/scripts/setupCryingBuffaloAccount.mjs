#!/usr/bin/env node
/**
 * Create or update Crying Buffalo (@cryingbuffalo): name, username, password, avatar.
 *
 *   node scripts/setupCryingBuffaloAccount.mjs --dry-run
 *   node scripts/setupCryingBuffaloAccount.mjs --apply
 *   node scripts/setupCryingBuffaloAccount.mjs --apply --push-remote
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { mergeDeployConfig, sshConnect, execSsh } from "./lib/deploySsh.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dirname, "..");
const repoRoot = path.join(backendRoot, "..");

const NEW_NAME = "Crying Buffalo";
const NEW_USERNAME = "cryingbuffalo";
const NEW_PASSWORD = "11111111";
const NEW_EMAIL = "cryingbuffalo@qwertymates.local";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const pushRemote = args.includes("--push-remote");
const dryRun = !apply;

const SOURCE_IMAGE_CANDIDATES = [
  path.join(
    repoRoot,
    "..",
    "c-Users-Dell-cursor-projects-morongwa",
    "assets",
    "c__Users_Dell_AppData_Roaming_Cursor_User_workspaceStorage_8cbbb33495ce43c096bb0498540fe740_images_663165064_1404607458357744_5065714358091678621_n-d06559da-15cb-4086-b51e-23fea3e55fac.png"
  ),
  path.join(
    "C:",
    "Users",
    "Dell",
    ".cursor",
    "projects",
    "c-Users-Dell-cursor-projects-morongwa",
    "assets",
    "c__Users_Dell_AppData_Roaming_Cursor_User_workspaceStorage_8cbbb33495ce43c096bb0498540fe740_images_663165064_1404607458357744_5065714358091678621_n-d06559da-15cb-4086-b51e-23fea3e55fac.png"
  ),
];

function resolveSourceImage() {
  for (const p of SOURCE_IMAGE_CANDIDATES) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

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
  const src = resolveSourceImage();
  if (!src) {
    console.error("Crying Buffalo banner image not found in assets/");
    process.exit(1);
  }

  const mongo = process.env.MONGO_URI;
  if (!mongo) {
    console.error("MONGO_URI not set");
    process.exit(1);
  }

  await mongoose.connect(mongo);
  const users = mongoose.connection.db.collection("users");

  let existing = await users.findOne({ username: NEW_USERNAME });
  if (!existing) {
    existing = await users.findOne({ email: NEW_EMAIL });
  }

  const userId = existing ? String(existing._id) : new mongoose.Types.ObjectId().toString();
  const avatarFile = `profile-${userId}-cryingbuffalo-avatar.png`;
  const profilesDir = path.join(backendRoot, "uploads", "profiles");
  const dest = path.join(profilesDir, avatarFile);
  const avatarPath = `/uploads/profiles/${avatarFile}`;

  const plan = {
    dryRun,
    action: existing ? "update" : "create",
    userId,
    from: existing
      ? { name: existing.name, username: existing.username, email: existing.email }
      : null,
    to: {
      name: NEW_NAME,
      username: NEW_USERNAME,
      email: NEW_EMAIL,
      avatar: avatarPath,
      password: "(set)",
    },
    sourceImage: src,
  };
  console.log(JSON.stringify(plan, null, 2));

  if (dryRun) {
    console.log("Re-run with --apply to execute.");
    await mongoose.disconnect();
    return;
  }

  fs.mkdirSync(profilesDir, { recursive: true });
  fs.copyFileSync(src, dest);

  const passwordHash = await bcrypt.hash(NEW_PASSWORD, 10);
  const now = new Date();

  if (existing) {
    const usernameTaken = await users.findOne({
      username: NEW_USERNAME,
      _id: { $ne: existing._id },
    });
    if (usernameTaken) {
      console.error(`Username @${NEW_USERNAME} already taken by ${usernameTaken._id}`);
      process.exit(1);
    }
    await users.updateOne(
      { _id: existing._id },
      {
        $set: {
          name: NEW_NAME,
          username: NEW_USERNAME,
          email: NEW_EMAIL,
          passwordHash,
          avatar: avatarPath,
          active: true,
          suspended: false,
          locked: false,
          updatedAt: now,
        },
        $unset: { resetPasswordToken: "", resetPasswordExpires: "" },
      }
    );
    console.log(`Updated user ${userId} → @${NEW_USERNAME}`);
  } else {
    const emailTaken = await users.findOne({ email: NEW_EMAIL });
    if (emailTaken) {
      console.error(`Email ${NEW_EMAIL} already taken by ${emailTaken._id}`);
      process.exit(1);
    }
    await users.insertOne({
      _id: new mongoose.Types.ObjectId(userId),
      name: NEW_NAME,
      username: NEW_USERNAME,
      email: NEW_EMAIL,
      passwordHash,
      avatar: avatarPath,
      role: ["client"],
      countryCode: "ZA",
      preferredCurrency: "ZAR",
      active: true,
      suspended: false,
      locked: false,
      createdAt: now,
      updatedAt: now,
    });
    console.log(`Created user ${userId} → @${NEW_USERNAME}`);
  }

  if (pushRemote) {
    const cfg = mergeDeployConfig(repoRoot);
    const remoteDir = `${resolveRemoteBackendRoot(cfg)}/uploads/profiles`;
    const conn = await sshConnect(cfg, repoRoot);
    try {
      await execSsh(conn, `mkdir -p "${remoteDir}"`);
      await sftpPut(conn, dest, `${remoteDir}/${avatarFile}`);
      console.log(`Pushed avatar → ${remoteDir}/${avatarFile}`);
    } finally {
      conn.end();
    }
  } else {
    console.log("Avatar saved locally. Re-run with --push-remote to sync production uploads.");
  }

  await mongoose.disconnect();
  console.log("Done.", { username: NEW_USERNAME, password: NEW_PASSWORD, profile: `/user/${userId}` });
}

main().catch(async (e) => {
  console.error(e?.message || e);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
