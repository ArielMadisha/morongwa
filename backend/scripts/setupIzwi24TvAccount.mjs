#!/usr/bin/env node
/**
 * Rebrand @ghyaduf0072 → Izwi24TV (@izwi24tv).
 *
 *   node scripts/setupIzwi24TvAccount.mjs --dry-run
 *   node scripts/setupIzwi24TvAccount.mjs --apply --push-remote
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

const SOURCE_USER_ID = "69cd1cc2703cf9d7f5bbb54c";
const SOURCE_USERNAME = "ghyaduf0072";
const NEW_NAME = "Izwi24TV";
const NEW_USERNAME = "izwi24tv";
const NEW_PASSWORD = "11111111";
const NEW_EMAIL = "ghyaduf0072@user.com";
const NEW_PHONE = "+998995417807";

const POST_TEXT =
  "CHINESE WOMAN TELLS HER ZIMBABWEAN WORKERS: ACCEPT THE R1,500 ($90) MONTHLY SALARY OR ‘VOETSEK’!";

const HASHTAGS = ["Izwi24TV", "Zimbabwe", "BreakingNews", "News"];

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const pushRemote = args.includes("--push-remote");
const dryRun = !apply;

const SOURCE_IMAGE = path.join(
  "C:",
  "Users",
  "Dell",
  ".cursor",
  "projects",
  "c-Users-Dell-cursor-projects-morongwa",
  "assets",
  "c__Users_Dell_AppData_Roaming_Cursor_User_workspaceStorage_8cbbb33495ce43c096bb0498540fe740_images_image-cfd32a09-a2cd-4300-be09-49ec7fb0f1b3.png"
);

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
  if (!fs.existsSync(SOURCE_IMAGE)) {
    console.error("Story image not found:", SOURCE_IMAGE);
    process.exit(1);
  }
  const mongo = process.env.MONGO_URI;
  if (!mongo) {
    console.error("MONGO_URI not set");
    process.exit(1);
  }

  const oid = new mongoose.Types.ObjectId(SOURCE_USER_ID);
  const avatarFile = `profile-${SOURCE_USER_ID}-izwi24tv-avatar.png`;
  const tvFile = `tv-${SOURCE_USER_ID}-zimbabwe-workers-salary.png`;
  const avatarPath = `/uploads/profiles/${avatarFile}`;
  const tvMediaPath = `/uploads/tv/${tvFile}`;
  const profilesDir = path.join(backendRoot, "uploads", "profiles");
  const tvDir = path.join(backendRoot, "uploads", "tv");

  await mongoose.connect(mongo);
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
    mediaUrls: tvMediaPath,
  });

  console.log(
    JSON.stringify(
      {
        dryRun,
        userId: SOURCE_USER_ID,
        from: { name: source.name, username: source.username },
        to: { name: NEW_NAME, username: NEW_USERNAME, avatar: avatarPath, password: "(set)" },
        post: {
          media: tvMediaPath,
          captionPreview: POST_TEXT.slice(0, 140),
          skip: !!existingPost,
        },
      },
      null,
      2
    )
  );

  if (dryRun) {
    console.log("Re-run with --apply --push-remote to execute.");
    await mongoose.disconnect();
    return;
  }

  fs.mkdirSync(profilesDir, { recursive: true });
  fs.mkdirSync(tvDir, { recursive: true });
  fs.copyFileSync(SOURCE_IMAGE, path.join(profilesDir, avatarFile));
  fs.copyFileSync(SOURCE_IMAGE, path.join(tvDir, tvFile));

  const passwordHash = await bcrypt.hash(NEW_PASSWORD, 10);
  const now = new Date();

  await users.updateOne(
    { _id: oid },
    {
      $set: {
        name: NEW_NAME,
        username: NEW_USERNAME,
        email: NEW_EMAIL,
        phone: NEW_PHONE,
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
  console.log(`Updated ${SOURCE_USER_ID} → @${NEW_USERNAME}`);

  if (!existingPost) {
    await tvposts.insertOne({
      creatorId: oid,
      type: "image",
      mediaUrls: [tvMediaPath],
      caption: POST_TEXT,
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
    console.log("Created wall post");
  } else {
    console.log("Post already exists — skipped create");
  }

  if (pushRemote) {
    const cfg = mergeDeployConfig(repoRoot);
    const remoteRoot = resolveRemoteBackendRoot(cfg);
    const conn = await sshConnect(cfg, repoRoot);
    try {
      await execSsh(conn, `mkdir -p "${remoteRoot}/uploads/profiles" "${remoteRoot}/uploads/tv"`);
      await sftpPut(conn, path.join(profilesDir, avatarFile), `${remoteRoot}/uploads/profiles/${avatarFile}`);
      await sftpPut(conn, path.join(tvDir, tvFile), `${remoteRoot}/uploads/tv/${tvFile}`);
      console.log("Pushed avatar + post image to production uploads");
    } finally {
      conn.end();
    }
  } else {
    console.log("Local files ready. Re-run with --push-remote to sync production.");
  }

  await mongoose.disconnect();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
