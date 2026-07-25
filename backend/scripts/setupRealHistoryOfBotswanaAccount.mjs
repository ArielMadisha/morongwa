#!/usr/bin/env node
/**
 * Rebrand @lfekgep6007 → Real History of Botswana (@realhistoryofbotswana).
 *
 *   node scripts/setupRealHistoryOfBotswanaAccount.mjs --dry-run
 *   node scripts/setupRealHistoryOfBotswanaAccount.mjs --apply --push-remote
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

const SOURCE_USER_ID = "69cd1cc2703cf9d7f5bbb54b";
const SOURCE_USERNAME = "lfekgep6007";
const NEW_NAME = "Real History of Botswana";
const NEW_USERNAME = "realhistoryofbotswana";
const NEW_PASSWORD = "11111111";
const NEW_EMAIL = "lfekgep6007@user.com";
const NEW_PHONE = "+998995413163";

const POST_TEXT = `𝐖𝐇𝐘 𝐁𝐀𝐍𝐆𝐖𝐀𝐊𝐄𝐓𝐒𝐄 𝐂𝐇𝐈𝐄𝐅𝐒 𝐌𝐈𝐆𝐇𝐓 𝐀𝐂𝐓𝐔𝐀𝐋𝐋𝐘 𝐁𝐄 𝐁𝐀𝐊𝐆𝐀𝐓𝐋𝐀 🇧🇼
▪️𝐌𝐨𝐡𝐮𝐦𝐚𝐠𝐚𝐝𝐢 𝐆𝐚𝐠𝐨𝐚𝐧𝐠𝐰𝐞 𝐭𝐡𝐞 𝐝𝐚𝐮𝐠𝐡𝐭𝐞𝐫 𝐨𝐟 𝐊𝐢𝐧𝐠 𝐒𝐞𝐜𝐡𝐞𝐥𝐞 𝐈, 𝐰𝐚𝐬 𝐦𝐚𝐫𝐫𝐢𝐞𝐝 𝐭𝐨 𝐊𝐠𝐨𝐬𝐢 𝐏𝐢𝐥𝐚𝐧𝐞 𝐨𝐟 𝐁𝐚𝐤𝐠𝐚𝐭𝐥𝐚 𝐛𝐚𝐠𝐚 𝐌𝐦𝐚𝐧𝐚𝐚𝐧𝐚 𝐚𝐧𝐝 𝐭𝐡𝐞𝐲 𝐡𝐚𝐝 𝟐 𝐜𝐡𝐢𝐥𝐝𝐫𝐞𝐧. 𝐎𝐧𝐞 𝐨𝐟 𝐭𝐡𝐞𝐦 𝐢𝐬 𝐊𝐠𝐨𝐬𝐢 𝐁𝐚𝐢𝐭𝐢𝐫𝐢𝐥𝐞 𝐰𝐡𝐨 𝐫𝐮𝐥𝐞𝐝 𝐁𝐚𝐤𝐠𝐚𝐭𝐥𝐚 𝐛𝐚𝐠𝐚 𝐌𝐦𝐚𝐧𝐚𝐚𝐧𝐚 
▪️𝐈𝐧 𝟏𝟖𝟕𝟓, 𝐆𝐚𝐠𝐨𝐚𝐧𝐠𝐰𝐞 𝐞𝐥𝐨𝐩𝐞𝐝 𝐰𝐢𝐭𝐡 𝐊𝐢𝐧𝐠 𝐁𝐚𝐭𝐡𝐨𝐞𝐧 𝐈 𝐰𝐡𝐢𝐥𝐞 𝐬𝐡𝐞 𝐰𝐚𝐬 𝐦𝐚𝐫𝐫𝐢𝐞𝐝 𝐭𝐨 𝐡𝐞𝐫 𝐟𝐢𝐫𝐬𝐭 𝐡𝐮𝐬𝐛𝐚𝐧𝐝 𝐊𝐢𝐧𝐠 𝐏𝐢𝐥𝐚𝐧𝐞
▪️𝐁𝐚𝐭𝐡𝐨𝐞𝐧 𝐰𝐚𝐬 𝐤𝐧𝐨𝐰𝐧 𝐭𝐨 𝐧𝐨𝐭 𝐡𝐚𝐯𝐢𝐧𝐠 𝐜𝐡𝐢𝐥𝐝𝐫𝐞𝐧 𝐛𝐮𝐭 𝐚𝐟𝐭𝐞𝐫 𝐡𝐢𝐬 𝐝𝐞𝐚𝐭𝐡, 𝐆𝐚𝐠𝐨𝐚𝐧𝐠𝐰𝐞 𝐰𝐚𝐬 𝐫𝐮𝐦𝐨𝐫𝐞𝐝 𝐭𝐨 𝐛𝐞 𝐡𝐚𝐯𝐢𝐧𝐠 𝐁𝐚𝐭𝐡𝐨𝐞𝐧'𝐬 𝐜𝐡𝐢𝐥𝐝 𝐊𝐠𝐨𝐬𝐢 𝐒𝐞𝐞𝐩𝐚𝐩𝐢𝐭𝐬𝐨 𝐈𝐈𝐈
▪️𝐇𝐞𝐫 𝟐 𝐜𝐡𝐢𝐥𝐝𝐫𝐞𝐧 𝐫𝐮𝐥𝐞𝐝 𝐊𝐚𝐧𝐲𝐞 𝐚𝐧𝐝 𝐌𝐨𝐬𝐡𝐮𝐩𝐚 𝐚𝐭 𝐭𝐡𝐞 𝐬𝐚𝐦𝐞 𝐭𝐢𝐦𝐞. 𝐁𝐚𝐧𝐠𝐰𝐚𝐤𝐞𝐭𝐬𝐞 𝐚𝐬𝐬𝐚𝐬𝐬𝐢𝐧𝐚𝐭𝐞𝐝 𝐒𝐞𝐞𝐩𝐚𝐩𝐢𝐭𝐬𝐨 𝐈𝐈𝐈 𝐛𝐞𝐜𝐚𝐮𝐬𝐞 𝐭𝐡𝐞𝐲 𝐛𝐞𝐥𝐢𝐞𝐯𝐞𝐝 𝐡𝐞 𝐰𝐚𝐬 𝐧𝐨𝐭 𝐁𝐚𝐭𝐡𝐨𝐞𝐧'𝐬 𝐜𝐡𝐢𝐥𝐝
▪️𝐀𝐟𝐭𝐞𝐫 𝐭𝐡𝐞 𝐝𝐞𝐚𝐭𝐡 𝐨𝐟 𝐊𝐠𝐨𝐬𝐢 𝐒𝐞𝐞𝐩𝐚𝐩𝐢𝐭𝐬𝐨 𝐈𝐈𝐈, 𝐡𝐢𝐬 𝐬𝐨𝐧 𝐁𝐚𝐭𝐡𝐨𝐞𝐧 𝐈𝐈 𝐰𝐚𝐬 𝐥𝐚𝐭𝐞𝐫 𝐢𝐧𝐬𝐭𝐚𝐥𝐥𝐞𝐝 𝐛𝐲 𝐭𝐡𝐞 𝐁𝐫𝐢𝐭𝐢𝐬𝐡 𝐚𝐠𝐚𝐢𝐧𝐬𝐭 𝐭𝐡𝐞 𝐢𝐧𝐭𝐞𝐫𝐞𝐬𝐭 𝐨𝐟 𝐭𝐡𝐞 𝐭𝐫𝐢𝐛𝐞`;

const HASHTAGS = ["RealHistoryOfBotswana", "Botswana", "Bangwaketse", "Bakgatla", "History"];

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
  "c__Users_Dell_AppData_Roaming_Cursor_User_workspaceStorage_8cbbb33495ce43c096bb0498540fe740_images_748088727_1348502673384909_6506352087681759879_n-55609ca8-a61b-4e44-8d81-4e72ba2e031e.png"
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
  const avatarFile = `profile-${SOURCE_USER_ID}-realhistoryofbotswana-avatar.png`;
  const tvFile = `tv-${SOURCE_USER_ID}-bangwaketse-bakgatla.png`;
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
