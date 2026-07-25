#!/usr/bin/env node
/**
 * Third DNA India wall post — Wangchuk / Pradhan.
 *   node scripts/addDnaIndiaWangchukPradhanPost.mjs --apply --push-remote
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

const USER_ID = "69cd1cc2703cf9d7f5bbb54a";
const EXPECTED_USERNAME = "dnaindia";
const apply = process.argv.includes("--apply");
const pushRemote = process.argv.includes("--push-remote");

const POST_TEXT = `As Sonam Wangchuk's hunger strike continues, attention has turned to his past association with Union Education Minister Dharmendra Pradhan, highlighting how their relationship has changed over the years.
In 2023, Pradhan had described his meeting with Wangchuk as "inspiring" while discussing the National Education Policy (NEP). Three years later, Wangchuk is leading protests demanding the minister's resignation over the NEET-UG paper leak controversy`;

const SOURCE_IMAGE = path.join(
  "C:",
  "Users",
  "Dell",
  ".cursor",
  "projects",
  "c-Users-Dell-cursor-projects-morongwa",
  "assets",
  "c__Users_Dell_AppData_Roaming_Cursor_User_workspaceStorage_8cbbb33495ce43c096bb0498540fe740_images_748278488_2228736704612310_446382269787194983_n-6c0dca5a-be3f-4658-b7c5-a7e2b6c33ebf.png"
);

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

async function main() {
  if (!fs.existsSync(SOURCE_IMAGE)) {
    console.error("Image not found:", SOURCE_IMAGE);
    process.exit(1);
  }
  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI not set");
    process.exit(1);
  }

  const oid = new mongoose.Types.ObjectId(USER_ID);
  const tvFile = `tv-${USER_ID}-wangchuk-pradhan-then-now.png`;
  const tvMediaPath = `/uploads/tv/${tvFile}`;
  const tvDir = path.join(backendRoot, "uploads", "tv");

  await mongoose.connect(process.env.MONGO_URI);
  const users = mongoose.connection.db.collection("users");
  const tvposts = mongoose.connection.db.collection("tvposts");

  const user = await users.findOne({ _id: oid }, { projection: { name: 1, username: 1 } });
  if (!user) {
    console.error("User not found");
    process.exit(1);
  }
  if (String(user.username || "").toLowerCase() !== EXPECTED_USERNAME) {
    console.warn(`Expected @${EXPECTED_USERNAME}, found @${user.username}`);
  }

  const existing = await tvposts.findOne({ creatorId: oid, mediaUrls: tvMediaPath });
  console.log(
    JSON.stringify(
      {
        dryRun: !apply,
        user: { name: user.name, username: user.username },
        media: tvMediaPath,
        skip: !!existing,
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

  fs.mkdirSync(tvDir, { recursive: true });
  fs.copyFileSync(SOURCE_IMAGE, path.join(tvDir, tvFile));

  if (!existing) {
    const now = new Date();
    await tvposts.insertOne({
      creatorId: oid,
      type: "image",
      mediaUrls: [tvMediaPath],
      caption: POST_TEXT,
      hashtags: ["DNAIndia", "SonamWangchuk", "DharmendraPradhan", "NEET", "News"],
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
    console.log("Created third DNA India post");
  } else {
    console.log("Post already exists — skipped");
  }

  if (pushRemote) {
    const cfg = mergeDeployConfig(repoRoot);
    const remoteRoot = resolveRemoteBackendRoot(cfg);
    const conn = await sshConnect(cfg, repoRoot);
    try {
      await execSsh(conn, `mkdir -p "${remoteRoot}/uploads/tv"`);
      await sftpPut(conn, path.join(tvDir, tvFile), `${remoteRoot}/uploads/tv/${tvFile}`);
      console.log("Pushed post image to production");
    } finally {
      conn.end();
    }
  }

  await mongoose.disconnect();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
