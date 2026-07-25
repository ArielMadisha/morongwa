#!/usr/bin/env node
/**
 * Fix Block 6 Primary media:
 * - Re-encode mislabeled .png files (actually JPEG/WebP) to real JPEGs
 * - Update avatar + gallery URLs
 * - Replace old duplicate TV image posts with the new gallery
 * - Optional: set username to block6primary
 *
 *   node scripts/fixBlock6PrimaryMedia.mjs --apply --push-remote
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";
import mongoose from "mongoose";
import { mergeDeployConfig, sshConnect, execSsh } from "./lib/deploySsh.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dirname, "..");
const repoRoot = path.join(backendRoot, "..");

const apply = process.argv.includes("--apply");
const pushRemote = process.argv.includes("--push-remote");
const TARGET_USERNAME = "block6primary";
const USER_ID = "69f49c6cb27a4f0c938798e9";

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

function sniffKind(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (
    buf.length >= 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "webp";
  }
  if (buf.length >= 8 && buf[0] === 0x89 && buf.toString("ascii", 1, 4) === "PNG") return "png";
  return "unknown";
}

async function main() {
  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI not set");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  const users = db.collection("users");
  const tvposts = db.collection("tvposts");
  const oid = new mongoose.Types.ObjectId(USER_ID);

  const user = await users.findOne({ _id: oid });
  if (!user) {
    console.error("User not found:", USER_ID);
    process.exit(1);
  }

  const galleryDir = path.join(backendRoot, "uploads", "school-gallery", USER_ID);
  const currentGallery = (user.profileGalleryUrls || []).filter(
    (u) => typeof u === "string" && u.includes("school-gallery")
  );

  const sourcePaths = currentGallery.length
    ? currentGallery.map((url) => path.join(backendRoot, String(url).replace(/^\//, "").replace(/\//g, path.sep)))
    : fs
        .readdirSync(galleryDir)
        .filter((n) => /^block6-primary-.*\.(png|jpe?g|webp)$/i.test(n))
        .sort()
        .map((n) => path.join(galleryDir, n));

  if (!sourcePaths.length) {
    console.error("No Block 6 gallery source files found");
    process.exit(1);
  }

  for (const p of sourcePaths) {
    if (!fs.existsSync(p)) {
      console.error("Missing source:", p);
      process.exit(1);
    }
  }

  const stamp = Date.now();
  const converted = [];
  for (let i = 0; i < sourcePaths.length; i++) {
    const src = sourcePaths[i];
    const buf = fs.readFileSync(src);
    const kind = sniffKind(buf);
    const destName = `block6-primary-fixed-${stamp}-${i + 1}.jpg`;
    const destAbs = path.join(galleryDir, destName);
    const meta = await sharp(buf).metadata();
    await sharp(buf)
      .rotate()
      .jpeg({ quality: 88, mozjpeg: true })
      .toFile(destAbs);
    const outStat = fs.statSync(destAbs);
    const url = `/uploads/school-gallery/${USER_ID}/${destName}`;
    converted.push({
      src,
      kind,
      inW: meta.width,
      inH: meta.height,
      destAbs,
      url,
      size: outStat.size,
    });
  }

  const galleryUrls = converted.map((c) => c.url);
  const avatarUrl = galleryUrls[0];

  const posts = await tvposts
    .find({ creatorId: oid })
    .project({ _id: 1, type: 1, status: 1, mediaUrls: 1 })
    .toArray();

  const usernameTaken = await users.findOne({
    username: TARGET_USERNAME,
    _id: { $ne: oid },
  });

  console.log(
    JSON.stringify(
      {
        dryRun: !apply,
        user: { id: USER_ID, name: user.name, username: user.username, avatar: user.avatar },
        converted,
        galleryUrls,
        oldApprovedImagePosts: posts.filter(
          (p) => ["image", "carousel"].includes(String(p.type)) && p.status === "approved"
        ).length,
        usernameTaken: usernameTaken ? String(usernameTaken._id) : null,
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

  const now = new Date();
  const setFields = {
    avatar: avatarUrl,
    profileGalleryUrls: galleryUrls,
    isSchoolAccount: true,
    showPhonePublicly: true,
    countryCode: user.countryCode || "BW",
    updatedAt: now,
  };
  if (!usernameTaken && String(user.username || "").toLowerCase() !== TARGET_USERNAME) {
    setFields.username = TARGET_USERNAME;
  }

  await users.updateOne({ _id: oid }, { $set: setFields });

  const oldImageIds = posts
    .filter((p) => ["image", "carousel"].includes(String(p.type || "")) && String(p.status) !== "deleted")
    .map((p) => p._id);

  if (oldImageIds.length) {
    await tvposts.updateMany(
      { _id: { $in: oldImageIds } },
      { $set: { status: "rejected", updatedAt: now } }
    );
  }

  const name = String(user.name || "Block 6 Primary");
  const caption = `${name} — school gallery on Qwertymates`;
  const hashtags = ["School", "Botswana", "Block6Primary", "Qwertymates"];
  const created = [];

  for (const mediaUrl of galleryUrls) {
    const ins = await tvposts.insertOne({
      creatorId: oid,
      type: "image",
      mediaUrls: [mediaUrl],
      caption,
      hashtags,
      genre: "history",
      hasWatermark: true,
      status: "approved",
      likeCount: 0,
      commentCount: 0,
      shareCount: 0,
      viewCount: 0,
      createdAt: now,
      updatedAt: now,
    });
    created.push({ id: String(ins.insertedId), mediaUrl });
  }

  const after = await users.findOne(
    { _id: oid },
    { projection: { name: 1, username: 1, avatar: 1, profileGalleryUrls: 1, phone: 1 } }
  );
  const approved = await tvposts.countDocuments({
    creatorId: oid,
    status: "approved",
    type: "image",
  });

  console.log(
    JSON.stringify(
      {
        updatedUser: after,
        rejectedOldPosts: oldImageIds.length,
        createdPosts: created,
        approvedImagePosts: approved,
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
      await execSsh(conn, `mkdir -p "${remoteRoot}/uploads/school-gallery/${USER_ID}"`);
      for (const c of converted) {
        const remoteRel = c.url.replace(/^\//, "");
        await sftpPut(conn, c.destAbs, `${remoteRoot}/${remoteRel}`);
        console.log("Uploaded", c.url, `(${c.size} bytes)`);
      }
      const ls = await execSsh(
        conn,
        `ls -la "${remoteRoot}/uploads/school-gallery/${USER_ID}"/block6-primary-fixed-${stamp}-*.jpg`
      );
      console.log("Remote files:\n", ls.stdout || ls);
    } finally {
      conn.end();
    }
  }

  await mongoose.disconnect();
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
