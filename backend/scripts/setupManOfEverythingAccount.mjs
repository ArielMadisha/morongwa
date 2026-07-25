#!/usr/bin/env node
/**
 * Rebrand @xcjyehi0620 → Man of Everything (@manofeverything).
 *
 *   node scripts/setupManOfEverythingAccount.mjs --dry-run
 *   node scripts/setupManOfEverythingAccount.mjs --apply --push-remote
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

const SOURCE_USER_ID = "69cd1cc2703cf9d7f5bbb546";
const SOURCE_USERNAME = "xcjyehi0620";
const NEW_NAME = "Man of Everything";
const NEW_USERNAME = "manofeverything";
const NEW_PASSWORD = "11111111";
const NEW_EMAIL = "xcjyehi0620@user.com";
const NEW_PHONE = "+998995414237";

const POST_TEXT =
  "A masked man seated in the front row at the funeral of Iran’s late Supreme Leader Ayatollah Ali Khamenei sparked widespread speculation, with many believing he was Mojtaba Khamenei. But the mystery has now been solved";

const HASHTAGS = ["Iran", "Khamenei", "ManOfEverything", "News"];

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const pushRemote = args.includes("--push-remote");
const dryRun = !apply;

const ASSETS_DIR = path.join(
  "C:",
  "Users",
  "Dell",
  ".cursor",
  "projects",
  "c-Users-Dell-cursor-projects-morongwa",
  "assets"
);

/** Story order: hook → mystery → rumours → reveal */
const SOURCE_IMAGES = [
  "c__Users_Dell_AppData_Roaming_Cursor_User_workspaceStorage_8cbbb33495ce43c096bb0498540fe740_images_747099218_1039266995359156_4135663503773689287_n-aebd26f6-0806-46df-8fa4-17de228c00c6.png",
  "c__Users_Dell_AppData_Roaming_Cursor_User_workspaceStorage_8cbbb33495ce43c096bb0498540fe740_images_746909653_880148045145661_4318762305101900033_n-0c26c6e4-9ff6-466d-a2d2-43966fdff7c8.png",
  "c__Users_Dell_AppData_Roaming_Cursor_User_workspaceStorage_8cbbb33495ce43c096bb0498540fe740_images_745686441_1670700601725923_8415471014535465784_n-a8205cea-4bc9-469c-ab5c-84fee2e677e4.png",
  "c__Users_Dell_AppData_Roaming_Cursor_User_workspaceStorage_8cbbb33495ce43c096bb0498540fe740_images_745046192_2379003795969788_3714043664950510333_n-fd015bee-feca-478f-8440-5bbc104c4789.png",
].map((name) => path.join(ASSETS_DIR, name));

const AVATAR_SOURCE = SOURCE_IMAGES[1];

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
  for (const img of SOURCE_IMAGES) {
    if (!fs.existsSync(img)) {
      console.error("Story image not found:", img);
      process.exit(1);
    }
  }
  const mongo = process.env.MONGO_URI;
  if (!mongo) {
    console.error("MONGO_URI not set");
    process.exit(1);
  }

  const oid = new mongoose.Types.ObjectId(SOURCE_USER_ID);
  const avatarFile = `profile-${SOURCE_USER_ID}-manofeverything-avatar.png`;
  const tvFiles = SOURCE_IMAGES.map(
    (_src, i) => `tv-${SOURCE_USER_ID}-masked-man-funeral-${i + 1}.png`
  );
  const avatarPath = `/uploads/profiles/${avatarFile}`;
  const tvMediaPaths = tvFiles.map((f) => `/uploads/tv/${f}`);
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
    mediaUrls: tvMediaPaths[0],
  });

  console.log(
    JSON.stringify(
      {
        dryRun,
        userId: SOURCE_USER_ID,
        from: { name: source.name, username: source.username },
        to: { name: NEW_NAME, username: NEW_USERNAME, avatar: avatarPath, password: "(set)" },
        post: {
          type: "carousel",
          media: tvMediaPaths,
          captionPreview: POST_TEXT.slice(0, 140) + "…",
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
  fs.copyFileSync(AVATAR_SOURCE, path.join(profilesDir, avatarFile));
  SOURCE_IMAGES.forEach((src, i) => {
    fs.copyFileSync(src, path.join(tvDir, tvFiles[i]));
  });

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
      type: "carousel",
      mediaUrls: tvMediaPaths,
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
    console.log("Created wall carousel post (4 images)");
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
      for (const f of tvFiles) {
        await sftpPut(conn, path.join(tvDir, f), `${remoteRoot}/uploads/tv/${f}`);
      }
      console.log("Pushed avatar + carousel images to production uploads");
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
