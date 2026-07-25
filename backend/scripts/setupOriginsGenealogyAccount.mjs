#!/usr/bin/env node
/**
 * Rebrand @cgedyaf4631 → Origins Genealogy & History (@originsgenealogy).
 *
 *   node scripts/setupOriginsGenealogyAccount.mjs --dry-run
 *   node scripts/setupOriginsGenealogyAccount.mjs --apply --push-remote
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

const SOURCE_USER_ID = "69cd1cc2703cf9d7f5bbb547";
const SOURCE_USERNAME = "cgedyaf4631";
const NEW_NAME = "Origins Genealogy & History";
const NEW_USERNAME = "originsgenealogy";
const NEW_PASSWORD = "11111111";
const NEW_EMAIL = "cgedyaf4631@user.com";
const NEW_PHONE = "+998995411333";

const POST_TEXT = `Jan Smuts Airport🦉
Jan Smuts Airport, located near Kempton Park, was South Africa’s primary international airport from 1953 until the early 2000s. It was named after General Jan Christiaan Smuts, a prominent South African statesman, former Prime Minister, and key figure in the founding of both the League of Nations and the United Nations.
The airport officially opened in October 1953, replacing Palmietfontein Airport, which had served as Johannesburg’s temporary international airport from 1945 to 1952. Palmietfontein had become increasingly inadequate due to the growing demands of post war air traffic and the introduction of jet aircraft.
Jan Smuts Airport was designed to accommodate larger, long haul aircraft and featured one of the longest runways in the Southern Hemisphere at the time. It quickly became South Africa’s main aviation centre and handled the majority of international and domestic flights.
During the apartheid era, the airport was subject to reduced international traffic due to sanctions and boycotts, but it remained a crucial transport and logistics centre. Despite political isolation, it was one of Africa’s most advanced airports in terms of infrastructure.
In 1994, following the democratic transition in South Africa, the airport was renamed Johannesburg International Airport as part of a national move to depoliticise place names that honoured apartheid era or colonial figures.
In October 2006, it was renamed again to O.R. Tambo International Airport, in honour of Oliver Reginald Tambo, the long serving president of the African National Congress and a leading anti-apartheid activist.
At present, O.R. Tambo International Airport is the busiest airport in Africa, serving as a centre for regional and international travel. The original Jan Smuts Airport laid the groundwork for this role, and its history demonstrates South Africa’s broader political and social changes over the 20th century.`;

const HASHTAGS = ["JanSmutsAirport", "ORTambo", "SouthAfrica", "History", "OriginsGenealogy"];

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

/** Chronological: construction → early aerial → opening → prop/jet → colour apron → lounge → SAA jets → later aerial */
const SOURCE_IMAGES = [
  "c__Users_Dell_AppData_Roaming_Cursor_User_workspaceStorage_8cbbb33495ce43c096bb0498540fe740_images_747099262_1499102711505991_2757030429046073970_n-b3124d8c-c88a-4f0c-bb42-bb1229d0fde1.png",
  "c__Users_Dell_AppData_Roaming_Cursor_User_workspaceStorage_8cbbb33495ce43c096bb0498540fe740_images_749207828_4599669803683776_3568355586832932413_n-14cb9b09-70ea-4be3-951d-84fdc18301c4.png",
  "c__Users_Dell_AppData_Roaming_Cursor_User_workspaceStorage_8cbbb33495ce43c096bb0498540fe740_images_748360231_1024503250357583_6571782417489244705_n-9f0c4025-0c99-4210-a7b0-89786cd3dc01.png",
  "c__Users_Dell_AppData_Roaming_Cursor_User_workspaceStorage_8cbbb33495ce43c096bb0498540fe740_images_747827253_1046728524378921_1773436426927909189_n-72835215-39d7-4a7d-a061-e68fe9dec600.png",
  "c__Users_Dell_AppData_Roaming_Cursor_User_workspaceStorage_8cbbb33495ce43c096bb0498540fe740_images_748016302_1239031625956673_2854104961323576043_n-d7d7e7bb-2ba4-47b3-af82-d0dc3ee2d50c.png",
  "c__Users_Dell_AppData_Roaming_Cursor_User_workspaceStorage_8cbbb33495ce43c096bb0498540fe740_images_748527857_887738024404457_7725098346448092288_n-e9e3a02f-f692-45f7-94c9-38c960a7fa93.png",
  "c__Users_Dell_AppData_Roaming_Cursor_User_workspaceStorage_8cbbb33495ce43c096bb0498540fe740_images_745305185_1032609969226840_3996191485936344595_n-7163249b-37d1-46d0-99a4-391999f729a1.png",
  "c__Users_Dell_AppData_Roaming_Cursor_User_workspaceStorage_8cbbb33495ce43c096bb0498540fe740_images_746268799_122309904386026336_7806604012434681246_n-069e3407-5937-40f7-8e82-f6133d0b6432.png",
].map((name) => path.join(ASSETS_DIR, name));

const AVATAR_SOURCE = SOURCE_IMAGES[4];

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
  const avatarFile = `profile-${SOURCE_USER_ID}-originsgenealogy-avatar.png`;
  const tvFiles = SOURCE_IMAGES.map(
    (_src, i) => `tv-${SOURCE_USER_ID}-jan-smuts-airport-${i + 1}.png`
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
    console.log(`Created wall carousel post (${tvMediaPaths.length} images)`);
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
