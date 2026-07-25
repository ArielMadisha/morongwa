#!/usr/bin/env node
/**
 * Rebrand @kvssbhf6636 → Robert Mugabe Legacy (@robertmugabelegacy).
 * First image = profile picture; post uses Charles/Mugabe + portraits.
 *
 *   node scripts/setupRobertMugabeLegacyAccount.mjs --dry-run
 *   node scripts/setupRobertMugabeLegacyAccount.mjs --apply --push-remote
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

const SOURCE_USER_ID = "69cd1cc2703cf9d7f5bbb54d";
const SOURCE_USERNAME = "kvssbhf6636";
const NEW_NAME = "Robert Mugabe Legacy";
const NEW_USERNAME = "robertmugabelegacy";
const NEW_PASSWORD = "11111111";
const NEW_EMAIL = "kvssbhf6636@user.com";
const NEW_PHONE = "+998995415341";

const POST_TEXT = `Robert Mugabe and King Charles III: A Historic Relationship That Began at Zimbabwe's Independence
On 18 April 1980, Zimbabwe entered a new chapter in its history as it gained independence after decades of colonial rule. Representing Queen Elizabeth II at the historic midnight ceremony at Rufaro Stadium was His Royal Highness Prince Charles, now King Charles III. Prince Charles officiated the formal handover of power by presenting the constitutional instruments of independence and witnessing the lowering of the Union Jack and the raising of the Zimbabwean flag.
During his address, Prince Charles used the Shona word "Rusununguko" (Freedom/Independence), echoing Prime Minister Robert Gabriel Mugabe's message of reconciliation and national unity. In his own Independence speech, Mugabe thanked Queen Elizabeth II for sending Prince Charles to represent her at this historic occasion, marking the beginning of diplomatic relations between independent Zimbabwe and the United Kingdom.
The relationship between Robert Mugabe and Prince Charles extended beyond Independence. Over the years, they met at Commonwealth gatherings, international events and state occasions, reflecting the diplomatic ties that continued despite periods of political disagreement between Zimbabwe and Britain.
When Queen Elizabeth II passed away in September 2022, Prince Charles became King Charles III, making him the very same royal representative who witnessed Zimbabwe's birth as an independent nation more than four decades earlier.
History reminds us that leaders may differ politically, but moments of nationhood and statecraft remain part of a country's enduring legacy.`;

const HASHTAGS = ["RobertMugabeLegacy", "Mugabe", "Zimbabwe", "KingCharles", "Independence", "History"];

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const pushRemote = args.includes("--push-remote");
const dryRun = !apply;

const assetsDir = path.join(
  "C:",
  "Users",
  "Dell",
  ".cursor",
  "projects",
  "c-Users-Dell-cursor-projects-morongwa",
  "assets"
);

/** Image 1 = profile picture */
const AVATAR_SOURCE = path.join(
  assetsDir,
  "c__Users_Dell_AppData_Roaming_Cursor_User_workspaceStorage_8cbbb33495ce43c096bb0498540fe740_images_476000242_122102120156758757_5084132436141217352_n-3e9e9448-76e0-4bab-8568-c9b95c99c1fa.png"
);

/** Post gallery: Charles+Mugabe first, then portraits */
const POST_SOURCES = [
  path.join(
    assetsDir,
    "c__Users_Dell_AppData_Roaming_Cursor_User_workspaceStorage_8cbbb33495ce43c096bb0498540fe740_images_748026179_122189043182758757_1327091410791793494_n-69f34b70-9658-4c1d-b2a4-86eb9625968b.png"
  ),
  path.join(
    assetsDir,
    "c__Users_Dell_AppData_Roaming_Cursor_User_workspaceStorage_8cbbb33495ce43c096bb0498540fe740_images_476019310_122102118230758757_2878654955601949031_n-3bf52de2-1ed9-4fbe-a398-07d9da858429.png"
  ),
  AVATAR_SOURCE,
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
  if (!fs.existsSync(AVATAR_SOURCE)) {
    console.error("Avatar image not found:", AVATAR_SOURCE);
    process.exit(1);
  }
  for (const p of POST_SOURCES) {
    if (!fs.existsSync(p)) {
      console.error("Post image not found:", p);
      process.exit(1);
    }
  }
  const mongo = process.env.MONGO_URI;
  if (!mongo) {
    console.error("MONGO_URI not set");
    process.exit(1);
  }

  const oid = new mongoose.Types.ObjectId(SOURCE_USER_ID);
  const avatarFile = `profile-${SOURCE_USER_ID}-robertmugabelegacy-avatar.png`;
  const tvFiles = [
    `tv-${SOURCE_USER_ID}-mugabe-charles-independence.png`,
    `tv-${SOURCE_USER_ID}-mugabe-portrait-closeup.png`,
    `tv-${SOURCE_USER_ID}-mugabe-portrait-statesman.png`,
  ];
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
          media: tvMediaPaths,
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
  fs.copyFileSync(AVATAR_SOURCE, path.join(profilesDir, avatarFile));
  for (let i = 0; i < POST_SOURCES.length; i++) {
    fs.copyFileSync(POST_SOURCES[i], path.join(tvDir, tvFiles[i]));
  }

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
      for (const f of tvFiles) {
        await sftpPut(conn, path.join(tvDir, f), `${remoteRoot}/uploads/tv/${f}`);
      }
      console.log("Pushed avatar + post images to production uploads");
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
