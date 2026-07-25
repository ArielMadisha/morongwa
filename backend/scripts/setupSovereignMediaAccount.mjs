#!/usr/bin/env node
/**
 * Rebrand @ppcyctt9534 → Sovereign Media (@sovereignmedia).
 *
 *   node scripts/setupSovereignMediaAccount.mjs --dry-run
 *   node scripts/setupSovereignMediaAccount.mjs --apply --push-remote
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

const SOURCE_USER_ID = "69cd1cc2703cf9d7f5bbb545";
const SOURCE_USERNAME = "ppcyctt9534";
const NEW_NAME = "Sovereign Media";
const NEW_USERNAME = "sovereignmedia";
const NEW_PASSWORD = "11111111";
const NEW_EMAIL = "ppcyctt9534@user.com";
const NEW_PHONE = "+998995419880";

const POST_TEXT = `We now recount yet another murder of an African leader who was moving away from France’s orbit. On 13 January 1963, French-trained soldiers shot and killed Togo’s first president, Sylvanus Olympio, on the eve of the creation of a new currency, which would have ended the country’s dependence on the French-controlled CFA franc.

Gnassingbé Eyadéma immediately took credit for the assassination, but later walked it back and said he was not involved. Nicolas Grunitzky then became president and quickly put an end to the new currency plans and signed several cooperation deals with France.

During Olympio’s presidency, French intelligence kept close tabs on all of the various developments unfolding in Togo. Jacques Foccart—infamous for orchestrating covert regime change plots in Africa through coups, assassinations, election rigging and other tactics—was watching the situation closely. After the assassination, he declared that Olympio was not a friend of France.

Most likely, France today is holding on to unreleased classified information that would reveal important information regarding Olympio’s assassination`;

const HASHTAGS = ["Togo", "Olympio", "Africa", "SovereignMedia", "History"];

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

/** Narrative order: cover → 1956 → CFA → assassination → Grunitzky → Eyadéma → Foccart → Faure */
const SOURCE_IMAGES = [
  "c__Users_Dell_AppData_Roaming_Cursor_User_workspaceStorage_8cbbb33495ce43c096bb0498540fe740_images_744782118_17890642212592306_5884782733075538899_n-7028a661-6f11-4d63-9f38-0b28677fde2e.png",
  "c__Users_Dell_AppData_Roaming_Cursor_User_workspaceStorage_8cbbb33495ce43c096bb0498540fe740_images_746209660_17890642221592306_7051865521149687989_n-dff54ff1-3094-4361-9f23-9f1a48b96841.png",
  "c__Users_Dell_AppData_Roaming_Cursor_User_workspaceStorage_8cbbb33495ce43c096bb0498540fe740_images_745373720_17890642239592306_5757655205830806620_n-77052b91-8cd4-4333-89e1-4a71139d3304.png",
  "c__Users_Dell_AppData_Roaming_Cursor_User_workspaceStorage_8cbbb33495ce43c096bb0498540fe740_images_745594542_17890642236592306_3545465039759200866_n-aef74753-1b32-4d5c-810f-86ca2145a70f.png",
  "c__Users_Dell_AppData_Roaming_Cursor_User_workspaceStorage_8cbbb33495ce43c096bb0498540fe740_images_743467359_17890642257592306_4216197683228323934_n-cf49d2ed-d57f-4ea5-b0f1-db83572f3bcd.png",
  "c__Users_Dell_AppData_Roaming_Cursor_User_workspaceStorage_8cbbb33495ce43c096bb0498540fe740_images_743278566_17890642269592306_9062520940477465447_n-4f7970c7-d877-4340-b781-9f1fb17724d8.png",
  "c__Users_Dell_AppData_Roaming_Cursor_User_workspaceStorage_8cbbb33495ce43c096bb0498540fe740_images_741592184_17890642260592306_6940023122915438690_n-19a337eb-d94f-428c-8f82-239e9b8f745c.png",
  "c__Users_Dell_AppData_Roaming_Cursor_User_workspaceStorage_8cbbb33495ce43c096bb0498540fe740_images_744858582_17890642278592306_6036696617737155828_n-f49ad206-b9d2-4f6b-9741-9978056588af.png",
].map((name) => path.join(ASSETS_DIR, name));

const AVATAR_SOURCE = SOURCE_IMAGES[0];

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
  const avatarFile = `profile-${SOURCE_USER_ID}-sovereignmedia-avatar.png`;
  const tvFiles = SOURCE_IMAGES.map(
    (_src, i) => `tv-${SOURCE_USER_ID}-olympio-france-${i + 1}.png`
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
