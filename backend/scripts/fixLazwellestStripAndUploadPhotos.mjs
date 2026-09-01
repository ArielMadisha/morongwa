#!/usr/bin/env node
/**
 * Laz Wellest: remove status-strip background; upload GRANLUX photos as normal wall image posts.
 *
 *   node scripts/fixLazwellestStripAndUploadPhotos.mjs --apply
 *   node scripts/fixLazwellestStripAndUploadPhotos.mjs --apply --skip-push
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import sharp from "sharp";
import { mergeDeployConfig, sshConnect, execSsh } from "./lib/deploySsh.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const repoRoot = path.join(ROOT, "..");
const apply = process.argv.includes("--apply");
const skipPush = process.argv.includes("--skip-push");

const USERNAME = "lazwellest";
const ASSETS = path.join(
  "C:",
  "Users",
  "Dell",
  ".cursor",
  "projects",
  "c-Users-Dell-cursor-projects-morongwa",
  "assets"
);

const SOURCE_IMAGES = [
  {
    src: path.join(
      ASSETS,
      "c__Users_Dell_AppData_Roaming_Cursor_User_workspaceStorage_8cbbb33495ce43c096bb0498540fe740_images_WhatsApp_Image_2026-07-30_at_06.28.12__1_-7e8bbc17-7c59-4276-80c5-072e1d92c328.png"
    ),
    caption: "Modern ceramic vessel basins",
  },
  {
    src: path.join(
      ASSETS,
      "c__Users_Dell_AppData_Roaming_Cursor_User_workspaceStorage_8cbbb33495ce43c096bb0498540fe740_images_WhatsApp_Image_2026-07-30_at_06.28.12__2_-9922e88a-e2c8-44d3-a044-e351edf0f7b1.png"
    ),
    caption: "Freestanding bathtub & floor mixer",
  },
  {
    src: path.join(
      ASSETS,
      "c__Users_Dell_AppData_Roaming_Cursor_User_workspaceStorage_8cbbb33495ce43c096bb0498540fe740_images_WhatsApp_Image_2026-07-30_at_06.28.12-0168a990-198b-4662-a517-c5e0015b76b2.png"
    ),
    caption: "Ships worldwide from China",
  },
  {
    src: path.join(
      ASSETS,
      "c__Users_Dell_AppData_Roaming_Cursor_User_workspaceStorage_8cbbb33495ce43c096bb0498540fe740_images_WhatsApp_Image_2026-07-30_at_06.28.13-312d8f08-a0e3-4f04-9ca5-08d3341fc6f3.png"
    ),
    caption: "GRANLUX GLOBAL — luxury stone & bath ware",
  },
];

function sftpPut(conn, localPath, remotePath) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err);
      sftp.fastPut(localPath, remotePath, (e) => (e ? reject(e) : resolve()));
    });
  });
}

async function main() {
  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI not set");
    process.exit(1);
  }

  const localTv = path.join(ROOT, "uploads", "tv");
  fs.mkdirSync(localTv, { recursive: true });

  const prepared = [];
  for (const item of SOURCE_IMAGES) {
    if (!fs.existsSync(item.src)) {
      console.error("Missing source image:", item.src);
      process.exit(1);
    }
    const stamp = Date.now();
    const hash = crypto.randomBytes(3).toString("hex");
    const outName = `tv-${stamp}-${hash}.jpg`;
    const outPath = path.join(localTv, outName);
    await sharp(item.src)
      .rotate()
      .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 88 })
      .toFile(outPath);
    // stagger names if prepared in same ms
    await new Promise((r) => setTimeout(r, 5));
    prepared.push({
      outName,
      outPath,
      url: `/uploads/tv/${outName}`,
      caption: item.caption,
    });
  }

  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  const users = db.collection("users");
  const stores = db.collection("stores");
  const tvposts = db.collection("tvposts");

  const user = await users.findOne({ username: USERNAME });
  if (!user) {
    console.error("User not found");
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        dryRun: !apply,
        userId: String(user._id),
        clearStripBackground: true,
        clearProfileGallery: true,
        uploadAsWallPosts: prepared.map((p) => ({ url: p.url, caption: p.caption })),
        beforeStrip: user.stripBackgroundPic || null,
      },
      null,
      2
    )
  );

  if (!apply) {
    console.log("Re-run with --apply");
    await mongoose.disconnect();
    return;
  }

  if (!skipPush) {
    const cfg = mergeDeployConfig(repoRoot);
    const remoteTv =
      (cfg.MORONGWA_BACKEND_HOST_PATH || "/home/zweppe/morongwa-live/backend").replace(/\/$/, "") +
      "/uploads/tv";
    const conn = await sshConnect(cfg, repoRoot);
    try {
      await execSsh(conn, `mkdir -p "${remoteTv}"`);
      for (const img of prepared) {
        await sftpPut(conn, img.outPath, `${remoteTv}/${img.outName}`);
        console.log("pushed", img.outName);
      }
    } finally {
      conn.end();
    }
  }

  const now = new Date();

  // Clean status bar like africanhistory — no strip background collage.
  await users.updateOne(
    { _id: user._id },
    {
      $set: {
        avatar: prepared[0].url,
        updatedAt: now,
      },
      $unset: {
        stripBackgroundPic: "",
        profileGalleryUrls: "",
      },
    }
  );

  await stores.updateOne(
    { name: /granlux/i },
    { $unset: { stripBackgroundPic: "" }, $set: { updatedAt: now } }
  );

  // Remove earlier placeholder gallery-style granlux wall posts if any (none expected).
  // Create normal approved image posts (same shape as wall upload).
  const created = [];
  for (const img of prepared) {
    const doc = {
      creatorId: user._id,
      type: "image",
      mediaUrls: [img.url],
      caption: img.caption,
      hashtags: ["GRANLUX", "GRANLUXGLOBAL"],
      hasWatermark: true,
      status: "approved",
      likeCount: 0,
      commentCount: 0,
      shareCount: 0,
      viewCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    const ins = await tvposts.insertOne(doc);
    created.push({ id: String(ins.insertedId), url: img.url, caption: img.caption });
  }

  const updated = await users.findOne({ _id: user._id });
  console.log(
    JSON.stringify(
      {
        ok: true,
        username: updated.username,
        stripBackgroundPic: updated.stripBackgroundPic ?? null,
        profileGalleryUrls: updated.profileGalleryUrls ?? null,
        avatar: updated.avatar,
        wallPosts: created,
        profile: `https://www.qwertymates.com/user/${user._id}`,
      },
      null,
      2
    )
  );

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
