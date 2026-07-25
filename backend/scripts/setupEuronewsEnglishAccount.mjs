#!/usr/bin/env node
/**
 * Rebrand @xwfajyh8850 → Euronews English (@euronewsenglish).
 *
 *   node scripts/setupEuronewsEnglishAccount.mjs --dry-run
 *   node scripts/setupEuronewsEnglishAccount.mjs --apply --push-remote
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

const SOURCE_USER_ID = "69cd1cc2703cf9d7f5bbb552";
const SOURCE_USERNAME = "xwfajyh8850";
const NEW_NAME = "Euronews English";
const NEW_USERNAME = "euronewsenglish";
const NEW_PASSWORD = "11111111";
const NEW_EMAIL = "xwfajyh8850@user.com";
const NEW_PHONE = "998995413503"; // stored digits-only like other accounts

const POST_TEXT =
  "Here's how Italian sculptor Silvio Gazzaniga created the FIFA World Cup trophy's iconic design - and why champions never get to keep it.";

const HASHTAGS = ["Euronews", "FIFA", "WorldCup", "SilvioGazzaniga", "News"];

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const pushRemote = args.includes("--push-remote");
const dryRun = !apply;

const AVATAR_CANDIDATES = [
  path.join(backendRoot, "uploads", "profiles", `profile-${SOURCE_USER_ID}-euronews-avatar.png`),
  path.join(backendRoot, "uploads", "profiles", `profile-${SOURCE_USER_ID}-euronews-avatar.svg`),
  path.join(__dirname, "tmp", "euronews-logo-2025.svg"),
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
  const deployPath = (cfg.DEPLOY_REMOTE_PATH || "").trim().replace(/\/$/, "");
  if (deployPath) return `${deployPath}/backend`;
  return "/home/zweppe/morongwa-live/backend";
}

function pickAvatar() {
  for (const p of AVATAR_CANDIDATES) {
    if (fs.existsSync(p) && fs.statSync(p).size > 50) return p;
  }
  return null;
}

async function main() {
  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI not set");
    process.exit(1);
  }

  const avatarLocal = pickAvatar();
  const avatarExt = avatarLocal ? path.extname(avatarLocal).toLowerCase() || ".png" : ".png";
  const avatarFile = `profile-${SOURCE_USER_ID}-euronews-avatar${avatarExt === ".svg" ? ".svg" : ".png"}`;
  const avatarPath = `/uploads/profiles/${avatarFile}`;
  const profilesDir = path.join(backendRoot, "uploads", "profiles");

  const oid = new mongoose.Types.ObjectId(SOURCE_USER_ID);
  await mongoose.connect(process.env.MONGO_URI);
  const users = mongoose.connection.db.collection("users");
  const tvposts = mongoose.connection.db.collection("tvposts");

  const source = await users.findOne({ _id: oid });
  if (!source) {
    console.error(`User ${SOURCE_USER_ID} not found`);
    process.exit(1);
  }
  if (String(source.username || "").toLowerCase() !== SOURCE_USERNAME) {
    console.warn(`Expected @${SOURCE_USERNAME}, found @${source.username}`);
  }

  const taken = await users.findOne({ username: NEW_USERNAME, _id: { $ne: oid } });
  if (taken) {
    console.error(`@${NEW_USERNAME} already taken by ${taken._id}`);
    process.exit(1);
  }

  const existingPost = await tvposts.findOne({
    creatorId: oid,
    caption: POST_TEXT,
  });

  console.log(
    JSON.stringify(
      {
        dryRun,
        userId: SOURCE_USER_ID,
        from: { name: source.name, username: source.username },
        to: {
          name: NEW_NAME,
          username: NEW_USERNAME,
          password: NEW_PASSWORD,
          phone: NEW_PHONE,
          email: NEW_EMAIL,
          avatar: avatarLocal ? avatarPath : "(keep existing / none)",
        },
        post: { type: "text", skip: !!existingPost, captionPreview: POST_TEXT.slice(0, 100) },
      },
      null,
      2
    )
  );

  if (dryRun) {
    console.log("Re-run with --apply --push-remote");
    await mongoose.disconnect();
    return;
  }

  fs.mkdirSync(profilesDir, { recursive: true });
  const passwordHash = await bcrypt.hash(NEW_PASSWORD, 10);
  const now = new Date();

  const $set = {
    name: NEW_NAME,
    username: NEW_USERNAME,
    email: NEW_EMAIL,
    phone: NEW_PHONE,
    passwordHash,
    active: true,
    suspended: false,
    locked: false,
    updatedAt: now,
  };

  if (avatarLocal) {
    const dest = path.join(profilesDir, avatarFile);
    fs.copyFileSync(avatarLocal, dest);
    $set.avatar = avatarPath;
  }

  await users.updateOne(
    { _id: oid },
    {
      $set,
      $unset: { resetPasswordToken: "", resetPasswordExpires: "" },
    }
  );
  console.log(`Updated ${SOURCE_USER_ID} → @${NEW_USERNAME}`);

  if (!existingPost) {
    await tvposts.insertOne({
      creatorId: oid,
      type: "text",
      mediaUrls: [],
      caption: POST_TEXT,
      heading: "FIFA World Cup trophy",
      subject: POST_TEXT,
      hashtags: HASHTAGS,
      genre: "news",
      hasWatermark: false,
      status: "approved",
      likeCount: 0,
      commentCount: 0,
      shareCount: 0,
      viewCount: 0,
      createdAt: now,
      updatedAt: now,
    });
    console.log("Created wall text post");
  } else {
    console.log("Post already exists — skipped create");
  }

  if (pushRemote && avatarLocal) {
    const cfg = mergeDeployConfig(repoRoot);
    const remoteRoot = resolveRemoteBackendRoot(cfg);
    const conn = await sshConnect(cfg, repoRoot);
    try {
      await execSsh(conn, `mkdir -p "${remoteRoot}/uploads/profiles"`);
      await sftpPut(conn, path.join(profilesDir, avatarFile), `${remoteRoot}/uploads/profiles/${avatarFile}`);
      console.log("Pushed avatar to production uploads");
    } finally {
      conn.end();
    }
  } else if (!avatarLocal) {
    console.log("No avatar file found locally — account updated without new avatar");
  }

  await mongoose.disconnect();
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
