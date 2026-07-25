#!/usr/bin/env node
/**
 * Rebrand @bcetyqj8582 → Malual Joky (@malualjoky), set password, avatar, gallery + photo posts.
 *
 *   node scripts/setupMalualJokyAccount.mjs --dry-run
 *   node scripts/setupMalualJokyAccount.mjs --apply --push-remote
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

const SOURCE_USER_ID = "69cd1cc2703cf9d7f5bbb543";
const SOURCE_USERNAME = "bcetyqj8582";
const NEW_NAME = "Malual Joky";
const NEW_USERNAME = "malualjoky";
const NEW_PASSWORD = "11111111";
const NEW_EMAIL = "bcetyqj8582@user.com";
const NEW_PHONE = "+998995419499";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const pushRemote = args.includes("--push-remote");
const dryRun = !apply;

const ASSETS = path.join(
  "C:",
  "Users",
  "Dell",
  ".cursor",
  "projects",
  "c-Users-Dell-cursor-projects-morongwa",
  "assets"
);

const PHOTOS = [
  {
    key: "avatar",
    file: "c__Users_Dell_AppData_Roaming_Cursor_User_workspaceStorage_8cbbb33495ce43c096bb0498540fe740_images_c2a08866-592c-4de8-b911-182129156420-2042d870-d0d1-42f1-8d5b-6d435fdc58ef.png",
    caption: null,
  },
  {
    key: "water",
    file: "c__Users_Dell_AppData_Roaming_Cursor_User_workspaceStorage_8cbbb33495ce43c096bb0498540fe740_images_92273f6b-a608-4e40-add9-c9001ba20ce9-788198dd-ab18-4b85-a4f4-caa3872f1156.png",
    caption: "💧",
  },
  {
    key: "celebrate",
    file: "c__Users_Dell_AppData_Roaming_Cursor_User_workspaceStorage_8cbbb33495ce43c096bb0498540fe740_images_8342ecfc-acfd-48ac-be2a-87f753791a78-b672040d-f2f8-486d-80ca-418f4406926c.png",
    caption: "✨",
  },
  {
    key: "flag",
    file: "c__Users_Dell_AppData_Roaming_Cursor_User_workspaceStorage_8cbbb33495ce43c096bb0498540fe740_images_9e9d332f-0cc7-4c94-ad2d-d21cbe827790-a2cf855d-1611-43e9-a288-c60014ec76f1.png",
    caption: "South Sudan 🇸🇸",
  },
  {
    key: "wedding",
    file: "c__Users_Dell_AppData_Roaming_Cursor_User_workspaceStorage_8cbbb33495ce43c096bb0498540fe740_images_51648893-1457-49d2-8084-5f8bf2d7f0e8-6c10f365-6a69-43af-b895-3bd92571e49e.png",
    caption: "💍",
  },
  {
    key: "portrait",
    file: "c__Users_Dell_AppData_Roaming_Cursor_User_workspaceStorage_8cbbb33495ce43c096bb0498540fe740_images_574ffb04-dad4-4676-9e08-746aff590077-4a12e74d-00a6-46af-999b-d97f44b79817.png",
    caption: "📷",
  },
];

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
  for (const p of PHOTOS) {
    const full = path.join(ASSETS, p.file);
    if (!fs.existsSync(full)) {
      console.error("Missing photo:", full);
      process.exit(1);
    }
  }

  const mongo = process.env.MONGO_URI;
  if (!mongo) {
    console.error("MONGO_URI not set");
    process.exit(1);
  }

  const oid = new mongoose.Types.ObjectId(SOURCE_USER_ID);
  const profilesDir = path.join(backendRoot, "uploads", "profiles");
  const tvDir = path.join(backendRoot, "uploads", "tv");

  const avatarFile = `profile-${SOURCE_USER_ID}-malualjoky-avatar.png`;
  const avatarPath = `/uploads/profiles/${avatarFile}`;

  const galleryFiles = PHOTOS.map((p) => ({
    ...p,
    destName: `profile-${SOURCE_USER_ID}-malualjoky-${p.key}.png`,
    destPath: `/uploads/profiles/profile-${SOURCE_USER_ID}-malualjoky-${p.key}.png`,
    tvName: p.caption ? `tv-${SOURCE_USER_ID}-malualjoky-${p.key}.png` : null,
    tvPath: p.caption ? `/uploads/tv/tv-${SOURCE_USER_ID}-malualjoky-${p.key}.png` : null,
    src: path.join(ASSETS, p.file),
  }));

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

  const plan = {
    dryRun,
    userId: SOURCE_USER_ID,
    from: { name: source.name, username: source.username },
    to: {
      name: NEW_NAME,
      username: NEW_USERNAME,
      avatar: avatarPath,
      galleryCount: galleryFiles.length,
      posts: galleryFiles.filter((g) => g.caption).map((g) => g.key),
      password: "(set)",
    },
  };
  console.log(JSON.stringify(plan, null, 2));

  if (dryRun) {
    console.log("Re-run with --apply --push-remote to execute.");
    await mongoose.disconnect();
    return;
  }

  fs.mkdirSync(profilesDir, { recursive: true });
  fs.mkdirSync(tvDir, { recursive: true });

  const avatarSrc = galleryFiles.find((g) => g.key === "avatar");
  fs.copyFileSync(avatarSrc.src, path.join(profilesDir, avatarFile));

  for (const g of galleryFiles) {
    fs.copyFileSync(g.src, path.join(profilesDir, g.destName));
    if (g.tvName) fs.copyFileSync(g.src, path.join(tvDir, g.tvName));
  }

  const passwordHash = await bcrypt.hash(NEW_PASSWORD, 10);
  const now = new Date();
  const galleryUrls = galleryFiles.map((g) => g.destPath);

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
        profileGalleryUrls: galleryUrls,
        active: true,
        suspended: false,
        locked: false,
        updatedAt: now,
      },
      $unset: { resetPasswordToken: "", resetPasswordExpires: "" },
    }
  );
  console.log(`Updated ${SOURCE_USER_ID} → @${NEW_USERNAME}`);

  for (const g of galleryFiles.filter((x) => x.caption && x.tvPath)) {
    const existing = await tvposts.findOne({ creatorId: oid, mediaUrls: g.tvPath });
    if (existing) {
      console.log(`Post ${g.key} already exists — skip`);
      continue;
    }
    await tvposts.insertOne({
      creatorId: oid,
      type: "image",
      mediaUrls: [g.tvPath],
      caption: g.caption,
      hashtags: ["MalualJoky"],
      genre: "lifestyle",
      hasWatermark: false,
      status: "approved",
      likeCount: 0,
      commentCount: 0,
      shareCount: 0,
      viewCount: 0,
      createdAt: now,
      updatedAt: now,
    });
    console.log(`Created post: ${g.key}`);
  }

  if (pushRemote) {
    const cfg = mergeDeployConfig(repoRoot);
    const remoteRoot = resolveRemoteBackendRoot(cfg);
    const conn = await sshConnect(cfg, repoRoot);
    try {
      await execSsh(conn, `mkdir -p "${remoteRoot}/uploads/profiles" "${remoteRoot}/uploads/tv"`);
      await sftpPut(conn, path.join(profilesDir, avatarFile), `${remoteRoot}/uploads/profiles/${avatarFile}`);
      for (const g of galleryFiles) {
        await sftpPut(conn, path.join(profilesDir, g.destName), `${remoteRoot}/uploads/profiles/${g.destName}`);
        if (g.tvName) {
          await sftpPut(conn, path.join(tvDir, g.tvName), `${remoteRoot}/uploads/tv/${g.tvName}`);
        }
      }
      console.log("Pushed avatar, gallery, and post images to production");
    } finally {
      conn.end();
    }
  } else {
    console.log("Local files ready. Re-run with --push-remote to sync production.");
  }

  await mongoose.disconnect();
  console.log("Done.", {
    username: NEW_USERNAME,
    password: NEW_PASSWORD,
    profile: `/user/${SOURCE_USER_ID}`,
  });
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
