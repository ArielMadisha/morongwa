#!/usr/bin/env node
/**
 * Fix Block 6 Primary (Morula): replace duplicate gallery with provided photos,
 * set phone +267 71 366 951 (visible on school profiles).
 *
 *   node scripts/fixBlock6PrimaryProfile.mjs --apply --push-remote
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import { mergeDeployConfig, sshConnect, execSsh } from "./lib/deploySsh.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dirname, "..");
const repoRoot = path.join(backendRoot, "..");

const apply = process.argv.includes("--apply");
const pushRemote = process.argv.includes("--push-remote");
const NEW_PHONE = "26771366951"; // digits only (PUT style); +267 71 366 951

const assetsDir = path.join(
  "C:",
  "Users",
  "Dell",
  ".cursor",
  "projects",
  "c-Users-Dell-cursor-projects-morongwa",
  "assets"
);

const SOURCE_IMAGES = [
  path.join(
    assetsDir,
    "c__Users_Dell_AppData_Roaming_Cursor_User_workspaceStorage_8cbbb33495ce43c096bb0498540fe740_images_download-5347fa1f-1b3c-4a45-9852-d6c8a3e16414.png"
  ),
  path.join(
    assetsDir,
    "c__Users_Dell_AppData_Roaming_Cursor_User_workspaceStorage_8cbbb33495ce43c096bb0498540fe740_images_unnamed-49d2d2d2-42c5-4300-a55a-39c68b3e0ef0.png"
  ),
  path.join(
    assetsDir,
    "c__Users_Dell_AppData_Roaming_Cursor_User_workspaceStorage_8cbbb33495ce43c096bb0498540fe740_images_unnamed__1_-85a52fa7-d6f0-40a2-8a62-f085b2d13489.png"
  ),
  path.join(
    assetsDir,
    "c__Users_Dell_AppData_Roaming_Cursor_User_workspaceStorage_8cbbb33495ce43c096bb0498540fe740_images_unnamed-88dac894-6e99-41e4-a77d-c09360d2aa0a.png"
  ),
];

function sftpPut(conn, localPath, remotePath) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err);
      sftp.fastPut(localPath, remotePath, (e) => (e ? reject(e) : resolve()));
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

function galleryDupStats(urls) {
  const list = (urls || []).map(String);
  const counts = new Map();
  for (const u of list) counts.set(u, (counts.get(u) || 0) + 1);
  const dupes = [...counts.entries()].filter(([, n]) => n > 1);
  return { total: list.length, unique: counts.size, dupes };
}

async function main() {
  for (const p of SOURCE_IMAGES) {
    if (!fs.existsSync(p)) {
      console.error("Missing image:", p);
      process.exit(1);
    }
  }
  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI not set");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  const users = mongoose.connection.db.collection("users");

  const candidates = await users
    .find({
      $or: [
        { name: /block\s*6\s*primary/i },
        { username: /block.?6/i },
        { name: /morula\s*primary/i },
        { name: /^block\s*6$/i },
      ],
    })
    .project({
      name: 1,
      username: 1,
      phone: 1,
      isSchoolAccount: 1,
      avatar: 1,
      profileGalleryUrls: 1,
      countryCode: 1,
      showPhonePublicly: 1,
    })
    .limit(20)
    .toArray();

  if (!candidates.length) {
    console.error("No Block 6 / Morula Primary user found");
    process.exit(1);
  }

  // Prefer exact Block 6 Primary name, else Morula Primary school account
  let user =
    candidates.find((u) => /block\s*6\s*primary/i.test(String(u.name || ""))) ||
    candidates.find((u) => /morula\s*primary/i.test(String(u.name || "")) && u.isSchoolAccount) ||
    candidates[0];

  const userId = String(user._id);
  const beforeDup = galleryDupStats(user.profileGalleryUrls);
  console.log(
    JSON.stringify(
      {
        dryRun: !apply,
        matchedCandidates: candidates.map((u) => ({
          id: String(u._id),
          name: u.name,
          username: u.username,
          gallery: (u.profileGalleryUrls || []).length,
        })),
        selected: {
          id: userId,
          name: user.name,
          username: user.username,
          phoneBefore: user.phone || null,
          isSchoolAccount: !!user.isSchoolAccount,
          galleryBefore: beforeDup,
        },
      },
      null,
      2
    )
  );

  if (!apply) {
    console.log("Re-run with --apply --push-remote");
    await mongoose.disconnect();
    return;
  }

  // Phone uniqueness check
  const phoneTaken = await users.findOne({
    phone: { $in: [NEW_PHONE, `+${NEW_PHONE}`, "+26771366951"] },
    _id: { $ne: user._id },
  });
  if (phoneTaken) {
    console.error(`Phone already used by ${phoneTaken._id} (${phoneTaken.name || phoneTaken.username})`);
    process.exit(1);
  }

  const galleryDirRel = path.join("uploads", "school-gallery", userId);
  const galleryDirAbs = path.join(backendRoot, galleryDirRel);
  fs.mkdirSync(galleryDirAbs, { recursive: true });

  const stamp = Date.now();
  const galleryUrls = [];
  const localFiles = [];
  for (let i = 0; i < SOURCE_IMAGES.length; i++) {
    const destName = `block6-primary-${stamp}-${i + 1}.png`;
    const destAbs = path.join(galleryDirAbs, destName);
    fs.copyFileSync(SOURCE_IMAGES[i], destAbs);
    const url = `/uploads/school-gallery/${userId}/${destName}`;
    galleryUrls.push(url);
    localFiles.push({ abs: destAbs, remoteRel: `${galleryDirRel.replace(/\\/g, "/")}/${destName}` });
  }

  const avatarUrl = galleryUrls[0];
  const now = new Date();

  await users.updateOne(
    { _id: user._id },
    {
      $set: {
        phone: NEW_PHONE,
        isSchoolAccount: true,
        countryCode: "BW",
        showPhonePublicly: true, // belt-and-braces if kind detection fails
        avatar: avatarUrl,
        profileGalleryUrls: galleryUrls,
        updatedAt: now,
      },
    }
  );

  const after = await users.findOne(
    { _id: user._id },
    { projection: { name: 1, username: 1, phone: 1, avatar: 1, profileGalleryUrls: 1, isSchoolAccount: 1, showPhonePublicly: 1, countryCode: 1 } }
  );

  console.log(
    JSON.stringify(
      {
        updated: {
          id: userId,
          name: after.name,
          username: after.username,
          phone: after.phone,
          showPhonePublicly: after.showPhonePublicly,
          isSchoolAccount: after.isSchoolAccount,
          countryCode: after.countryCode,
          avatar: after.avatar,
          gallery: after.profileGalleryUrls,
          galleryAfter: galleryDupStats(after.profileGalleryUrls),
        },
      },
      null,
      2
    )
  );

  if (pushRemote) {
    const cfg = mergeDeployConfig(repoRoot);
    const remoteRoot = resolveRemoteBackendRoot(cfg);
    const conn = await sshConnect(cfg, repoRoot);
    try {
      await execSsh(conn, `mkdir -p "${remoteRoot}/uploads/school-gallery/${userId}"`);
      for (const f of localFiles) {
        await sftpPut(conn, f.abs, `${remoteRoot}/${f.remoteRel}`);
      }
      console.log("Pushed gallery images to production uploads");
    } finally {
      conn.end();
    }
  } else {
    console.log("Local files ready. Re-run with --push-remote to sync production.");
  }

  await mongoose.disconnect();
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
