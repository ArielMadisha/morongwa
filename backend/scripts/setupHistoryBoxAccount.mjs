#!/usr/bin/env node
/**
 * Rebrand @wccjkjc2663 → History Box (@historybox), set password + story post.
 *
 *   node scripts/setupHistoryBoxAccount.mjs --dry-run
 *   node scripts/setupHistoryBoxAccount.mjs --apply --push-remote
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

const SOURCE_USER_ID = "69cd1cc2703cf9d7f5bbb542";
const SOURCE_USERNAME = "wccjkjc2663";
const NEW_NAME = "History Box";
const NEW_USERNAME = "historybox";
const NEW_PASSWORD = "11111111";
const NEW_EMAIL = "wccjkjc2663@user.com";
const NEW_PHONE = "+998995413849";

const POST_TEXT = `NEW YORK DIDN'T BEGIN WITH THE DUTCH—IT BEGAN WITH THE BLACK LENAPE.
Long before European ships appeared on the Atlantic coast, the Black Lenape people had lived on the land now known as New York City for thousands of years. They hunted, traded, farmed, built communities, and maintained a deep relationship with the rivers, forests, and coastline that sustained them.
European history begins later.
1624 – The Dutch established a settlement on Governors Island in New Netherland.
1625 – The Dutch founded New Amsterdam on the southern tip of Manhattan.
1626 – According to tradition, Peter Minuit negotiated the purchase of Manhattan from local Indigenous people, though historians continue to debate the details.
1664 – The English captured New Amsterdam and renamed it New York after the Duke of York (later King James II of England).
The history of New York did not start with European colonization. It began with the Black Lenape, whose presence on this land stretches back thousands of years before the city was renamed, rebuilt, or reimagined.
History is richer when every chapter is remembered.`;

const HASHTAGS = ["History", "NewYork", "Lenape", "HistoryBox", "BlackHistory"];

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
  "c__Users_Dell_AppData_Roaming_Cursor_User_workspaceStorage_8cbbb33495ce43c096bb0498540fe740_images_747832846_835736942804081_4248177296089622758_n-7b2ff183-1dba-4be2-82de-a8d3badb8c7c.png"
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
  const avatarFile = `profile-${SOURCE_USER_ID}-historybox-avatar.png`;
  const tvFile = `tv-${SOURCE_USER_ID}-black-lenape-nyc.png`;
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

  const plan = {
    dryRun,
    userId: SOURCE_USER_ID,
    from: { name: source.name, username: source.username },
    to: { name: NEW_NAME, username: NEW_USERNAME, avatar: avatarPath, password: "(set)" },
    post: {
      media: tvMediaPath,
      captionPreview: POST_TEXT.slice(0, 140) + "…",
      skip: !!existingPost,
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
      genre: "history",
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
