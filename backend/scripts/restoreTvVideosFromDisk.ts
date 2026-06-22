/**
 * Restore TV video posts from uploads/tv + API log mapping (creatorId per file).
 *
 * Dry-run (default):
 *   npx ts-node-dev --transpile-only --exit-child scripts/restoreTvVideosFromDisk.ts
 *
 * Apply:
 *   npx ts-node-dev --transpile-only --exit-child scripts/restoreTvVideosFromDisk.ts --apply
 *
 * Optional:
 *   TV_UPLOAD_LOG_FILE=path/to/docker-logs.txt
 */
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import mongoose from "mongoose";
import TVPost from "../src/data/models/TVPost";
import User from "../src/data/models/User";
import { TV_UPLOAD_STORAGE_DIR } from "../src/middleware/tvUpload";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const APPLY = process.argv.includes("--apply");
const VIDEO_EXT = new Set([".mp4", ".webm", ".mov", ".m4v", ".mkv", ".3gp", ".3g2"]);
const ORPHAN_USER_ID = String(process.env.RESTORE_TV_ORPHAN_USER_ID || "").trim();

function mediaUrl(filename: string): string {
  return `/uploads/tv/${filename}`;
}

/** Parse winston-style lines: TV media uploaded {"url":"...","userId":"..."} */
function parseUploadLogMappings(text: string): Map<string, { userId: string; timestamp?: string }> {
  const map = new Map<string, { userId: string; timestamp?: string }>();
  for (const line of text.split(/\r?\n/)) {
    if (!line.includes("TV media uploaded")) continue;
    const jsonStart = line.indexOf("{");
    if (jsonStart < 0) continue;
    try {
      const payload = JSON.parse(line.slice(jsonStart));
      const url = String(payload.url || "").trim();
      const userId = String(payload.userId || "").trim();
      if (url && userId && mongoose.Types.ObjectId.isValid(userId)) {
        map.set(url, { userId, timestamp: payload.timestamp });
      }
    } catch {
      /* ignore malformed */
    }
  }
  return map;
}

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error("MONGO_URI not set");
    process.exit(1);
  }

  const logFile = process.env.TV_UPLOAD_LOG_FILE;
  let logText = "";
  if (logFile && fs.existsSync(logFile)) {
    logText = fs.readFileSync(logFile, "utf8");
  }

  const tvDir = TV_UPLOAD_STORAGE_DIR;
  if (!fs.existsSync(tvDir)) {
    console.error("TV upload dir missing:", tvDir);
    process.exit(1);
  }

  await mongoose.connect(uri);

  const files = fs
    .readdirSync(tvDir)
    .filter((f) => VIDEO_EXT.has(path.extname(f).toLowerCase()))
    .sort();

  const logMap = parseUploadLogMappings(logText);
  console.log(`video_files=${files.length} log_mappings=${logMap.size} tv_dir=${tvDir}`);

  const existingVideos = await TVPost.find({ type: "video" }).select("mediaUrls").lean();
  const coveredUrls = new Set<string>();
  for (const p of existingVideos) {
    for (const u of p.mediaUrls || []) coveredUrls.add(String(u));
  }
  console.log(`existing_video_posts=${existingVideos.length}`);

  let wouldRestore = 0;
  let unmapped = 0;
  const byUser = new Map<string, number>();

  for (const f of files) {
    const url = mediaUrl(f);
    if (coveredUrls.has(url)) continue;

    const mapped = logMap.get(url);
    let creatorId = mapped?.userId;
    if (!creatorId && ORPHAN_USER_ID && mongoose.Types.ObjectId.isValid(ORPHAN_USER_ID)) {
      creatorId = ORPHAN_USER_ID;
    }
    if (!creatorId) {
      unmapped++;
      if (unmapped <= 15) console.log("unmapped_file", f);
      continue;
    }

    wouldRestore++;
    byUser.set(creatorId, (byUser.get(creatorId) || 0) + 1);

    if (!APPLY) {
      if (wouldRestore <= 20) {
        console.log("would_restore", { url, userId: creatorId, ts: mapped?.timestamp, orphan: !mapped });
      }
      continue;
    }

    const stat = fs.statSync(path.join(tvDir, f));
    const createdAt = mapped?.timestamp ? new Date(mapped.timestamp) : stat.mtime;
    await TVPost.create({
      creatorId: new mongoose.Types.ObjectId(creatorId),
      type: "video",
      mediaUrls: [url],
      caption: "",
      status: "approved",
      hasWatermark: true,
      createdAt,
      updatedAt: createdAt,
    });
  }

  const userIds = [...byUser.keys()];
  if (userIds.length) {
    const users = await User.find({ _id: { $in: userIds } }).select("username name").lean();
    console.log(
      "restore_by_user",
      users.map((u) => ({ username: u.username, name: u.name, count: byUser.get(String(u._id)) }))
    );
  }

  console.log({
    mode: APPLY ? "APPLY" : "DRY_RUN",
    wouldRestore,
    unmapped,
    note: logMap.size ? undefined : "Set TV_UPLOAD_LOG_FILE to docker logs export for creator mapping",
  });

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
