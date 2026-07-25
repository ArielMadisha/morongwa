#!/usr/bin/env node
/**
 * Rebrand @xbrreqx1073 → Chronicles Of The Cradle (@chroniclesofthecradle).
 * First image = profile; post gallery = Achebe, Soyinka, Tinubu.
 *
 *   node scripts/setupChroniclesOfTheCradleAccount.mjs --dry-run
 *   node scripts/setupChroniclesOfTheCradleAccount.mjs --apply --push-remote
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

const SOURCE_USER_ID = "69cd1cc2703cf9d7f5bbb54f";
const SOURCE_USERNAME = "xbrreqx1073";
const NEW_NAME = "Chronicles Of The Cradle";
const NEW_USERNAME = "chroniclesofthecradle";
const NEW_PASSWORD = "11111111";
const NEW_EMAIL = "xbrreqx1073@user.com";
const NEW_PHONE = "+998995416982";

const POST_TEXT = `Chinua Achebe wrote the most important African novel ever published. He never won a Nobel Prize. Wole Soyinka did and some say he wasn't even the better writer.
In 1986, Soyinka became the first African, and first Black writer, to win the Nobel Prize in Literature. His plays and poetry confronted power and Yoruba cosmology with a density Western critics called "difficult" and many Africans call unapologetic.
Achebe never needed a Nobel to become required reading almost everywhere. "Things Fall Apart" (1958) has sold more than 20 million copies and been translated into over 50 languages, the most widely read novel by an African author. Barack Obama and Toni Morrison have both credited it with reshaping how the world understands African literature.
So was the Swedish Academy right to crown Soyinka or did they miss the writer who actually built modern African literature from the ground up, or would we say President Bola Ahmed Tinubu is a better writer than Wole Soyinka and Chinua Achebe?
Say the name. And if it's neither of them, tell us who should have won instead.`;

const HASHTAGS = [
  "ChroniclesOfTheCradle",
  "ChinuaAchebe",
  "WoleSoyinka",
  "AfricanLiterature",
  "NobelPrize",
  "Nigeria",
];

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

/** Image 1 = profile picture (Tinubu) */
const AVATAR_SOURCE = path.join(
  assetsDir,
  "c__Users_Dell_AppData_Roaming_Cursor_User_workspaceStorage_8cbbb33495ce43c096bb0498540fe740_images_749302118_122117644419359256_1169127221914029049_n-9a9e192c-4655-4412-930e-09824f258aab.png"
);

/** Post gallery: Achebe → Soyinka → Tinubu (story order) */
const POST_SOURCES = [
  path.join(
    assetsDir,
    "c__Users_Dell_AppData_Roaming_Cursor_User_workspaceStorage_8cbbb33495ce43c096bb0498540fe740_images_748568057_122117644347359256_2004899914021515290_n-a125e75c-dcd5-4615-8d5f-dca0f4ae3237.png"
  ),
  path.join(
    assetsDir,
    "c__Users_Dell_AppData_Roaming_Cursor_User_workspaceStorage_8cbbb33495ce43c096bb0498540fe740_images_747723512_122117644185359256_2292164964417518861_n-5da9bbe0-16cc-4f43-a68a-6ef03e23aa0a.png"
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
  const avatarFile = `profile-${SOURCE_USER_ID}-chroniclesofthecradle-avatar.png`;
  const tvFiles = [
    `tv-${SOURCE_USER_ID}-chinua-achebe.png`,
    `tv-${SOURCE_USER_ID}-wole-soyinka.png`,
    `tv-${SOURCE_USER_ID}-bola-tinubu.png`,
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
