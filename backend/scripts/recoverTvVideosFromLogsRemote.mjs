/**
 * Recover TV video post creator mapping from API container logs, then restore missing TVPost rows.
 * Dry-run by default. Pass --apply to insert posts.
 *
 *   node scripts/recoverTvVideosFromLogsRemote.mjs
 *   node scripts/recoverTvVideosFromLogsRemote.mjs --apply
 */
import path from "path";
import { fileURLToPath } from "url";
import { mergeDeployConfig, sshConnect } from "./lib/deploySsh.mjs";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const apply = process.argv.includes("--apply");

function execSsh(conn, cmd) {
  return new Promise((resolve, reject) => {
    let out = "";
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      stream.on("data", (d) => {
        out += String(d);
      });
      stream.stderr.on("data", (d) => process.stderr.write(String(d)));
      stream.on("close", (code) => resolve({ code, stdout: out }));
    });
  });
}

const restoreJs = `
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const TVPost = require("./dist/data/models/TVPost").default;

const APPLY = process.env.APPLY === "1";
const LOG_TEXT = process.env.TV_LOG_TEXT || "";

function mediaUrl(filename) {
  return "/uploads/tv/" + filename;
}

function parseUploadsFromLogs(text) {
  const map = new Map();
  const re = /TV media uploaded[\\s\\S]*?userId[\\s\\S]*?([a-f0-9]{24})[\\s\\S]*?url[\\s\\S]*?(\\/uploads\\/tv\\/[^\\s\"']+)/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    map.set(m[2], m[1]);
  }
  // JSON log lines
  for (const line of text.split(/\\n/)) {
    if (!line.includes("TV media uploaded")) continue;
    try {
      const j = JSON.parse(line);
      const uid = j.userId || j.meta?.userId;
      const url = j.url || j.meta?.url;
      if (uid && url) map.set(String(url), String(uid));
    } catch {}
    const uidMatch = line.match(/\"userId\"\\s*:\\s*\"([a-f0-9]{24})\"/);
    const urlMatch = line.match(/\"url\"\\s*:\\s*\"(\\/uploads\\/tv\\/[^\"]+)\"/);
    if (uidMatch && urlMatch) map.set(urlMatch[1], uidMatch[1]);
  }
  return map;
}

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const tvDir = path.join(process.cwd(), "uploads", "tv");
  const videoExt = new Set([".mp4", ".webm", ".mov", ".m4v", ".mkv", ".3gp"]);
  const files = fs.readdirSync(tvDir).filter((f) => videoExt.has(path.extname(f).toLowerCase()));
  const logMap = parseUploadsFromLogs(LOG_TEXT);
  console.log("video_files", files.length, "log_url_mappings", logMap.size);

  const existing = await TVPost.find({ type: "video" }).select("mediaUrls creatorId").lean();
  const covered = new Set();
  for (const p of existing) {
    for (const u of p.mediaUrls || []) covered.add(String(u));
  }
  console.log("existing_video_posts", existing.length);

  let restore = 0;
  let unmapped = 0;
  for (const f of files) {
    const url = mediaUrl(f);
    if (covered.has(url)) continue;
    const creatorId = logMap.get(url);
    if (!creatorId || !mongoose.Types.ObjectId.isValid(creatorId)) {
      unmapped++;
      if (unmapped <= 10) console.log("unmapped", f);
      continue;
    }
    restore++;
    if (!APPLY) {
      if (restore <= 15) console.log("would_restore", url, "creator", creatorId);
      continue;
    }
    const stat = fs.statSync(path.join(tvDir, f));
    await TVPost.create({
      creatorId: new mongoose.Types.ObjectId(creatorId),
      type: "video",
      mediaUrls: [url],
      caption: "Restored video",
      status: "approved",
      hasWatermark: true,
      createdAt: stat.mtime,
      updatedAt: stat.mtime,
    });
  }
  console.log("restore_candidates", restore, "unmapped_files", unmapped, "apply", APPLY);
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
`.trim();

async function main() {
  const cfg = mergeDeployConfig(repoRoot);
  const api = (cfg.MORONGWA_API_DOCKER_NAME || "morongwa-api-test").trim();
  const conn = await sshConnect(cfg, repoRoot);

  console.log("==> Fetching API logs for TV uploads...");
  const logs = await execSsh(conn, `docker logs ${api} 2>&1 | grep -F "TV media uploaded" | tail -5000`);
  const logText = logs.stdout || "";
  console.log(`==> Log lines with TV uploads: ${logText.split("\\n").filter(Boolean).length}`);

  const flag = apply ? "APPLY=1" : "APPLY=0";
  const cmd = `docker exec -e ${flag} -e TV_LOG_TEXT=${JSON.stringify(logText)} ${api} bash -lc 'cd /app && node -e ${JSON.stringify(restoreJs)}'`;
  const r = await execSsh(conn, cmd);
  console.log(r.stdout);
  conn.end();
  process.exit(r.code || 0);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
