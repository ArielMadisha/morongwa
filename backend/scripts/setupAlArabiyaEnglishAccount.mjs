#!/usr/bin/env node
/**
 * Rebrand @nzwaxhy4464 → Al Arabiya English (keep username nzwaxhy4464).
 *
 *   node scripts/setupAlArabiyaEnglishAccount.mjs --dry-run
 *   node scripts/setupAlArabiyaEnglishAccount.mjs --apply --push-remote
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

const SOURCE_USER_ID = "69cd1cc2703cf9d7f5bbb556";
const SOURCE_USERNAME = "nzwaxhy4464";
const NEW_NAME = "Al Arabiya English";
const NEW_USERNAME = "nzwaxhy4464";
const NEW_PASSWORD = "11111111";
const NEW_EMAIL = "nzwaxhy4464@user.com";
const NEW_PHONE = "+998995413698";

const POST_TEXT = `🔴 Iranian President Masoud Pezeshkian says he recently met with Supreme Leader Mojtaba Khamenei, adding that the meeting lasted for seven hours
🔴 The meeting with Khamenei focused on the war’s repercussions and sanctions, Pezeshkian says`;

const POST_HEADING =
  "Iranian President Pezeshkian met with Supreme Leader Mojtaba Khamenei";

const HASHTAGS = ["AlArabiya", "AlArabiyaEnglish", "Iran", "Pezeshkian", "Khamenei", "News"];

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
  "c__Users_Dell_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_771968536_2198958494005822_2110147566074807566_n-c5d8eb9a-104d-461b-a1f3-9559d7fd94ca.png"
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
  const avatarFile = `profile-${SOURCE_USER_ID}-alarabiya-english-avatar.png`;
  const tvFile = `tv-${SOURCE_USER_ID}-pezeshkian-khamenei-meeting.png`;
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

  // Safety: never touch sibling rebrand accounts
  const forbidden = ["uqwuztv7671", "rzkaksf0422", "newsurdu24"];
  if (forbidden.includes(String(source.username || "").toLowerCase())) {
    console.error("Refusing to modify sibling news account:", source.username);
    process.exit(1);
  }

  const oldestPost = await tvposts.findOne({ creatorId: oid }, { sort: { createdAt: 1 } });
  const existingByMedia = await tvposts.findOne({
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
          action: existingByMedia ? "skip" : oldestPost ? "update-oldest" : "create",
          oldestPostId: oldestPost?._id || null,
          media: tvMediaPath,
          captionPreview: POST_TEXT.slice(0, 140),
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
  console.log(`Updated ${SOURCE_USER_ID} → @${NEW_USERNAME} (${NEW_NAME})`);

  let postId = existingByMedia?._id || null;
  if (existingByMedia) {
    console.log("Post already exists — skipped create");
  } else if (oldestPost) {
    await tvposts.updateOne(
      { _id: oldestPost._id },
      {
        $set: {
          type: "image",
          mediaUrls: [tvMediaPath],
          caption: POST_TEXT,
          heading: POST_HEADING,
          subject: POST_TEXT,
          hashtags: HASHTAGS,
          genre: "news",
          hasWatermark: false,
          status: "approved",
          updatedAt: now,
        },
      }
    );
    postId = oldestPost._id;
    console.log(`Updated oldest wall post ${postId}`);
  } else {
    const inserted = await tvposts.insertOne({
      creatorId: oid,
      type: "image",
      mediaUrls: [tvMediaPath],
      caption: POST_TEXT,
      heading: POST_HEADING,
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
    postId = inserted.insertedId;
    console.log(`Created wall post ${postId}`);
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

  console.log(JSON.stringify({ postId: String(postId), avatarPath, tvMediaPath }, null, 2));
  await mongoose.disconnect();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
