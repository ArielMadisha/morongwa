/**
 * Inspect TV posts on production: counts, samples, media availability.
 * Run: cd backend && node scripts/probeTvPostsRemote.mjs
 */
import path from "path";
import { fileURLToPath } from "url";
import { mergeDeployConfig, sshConnect } from "./lib/deploySsh.mjs";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function execSsh(conn, cmd) {
  return new Promise((resolve, reject) => {
    let out = "";
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      stream.on("data", (d) => {
        out += String(d);
      });
      stream.stderr.on("data", (d) => {
        process.stderr.write(String(d));
      });
      stream.on("close", (code) => resolve({ code, stdout: out }));
    });
  });
}

async function main() {
  const cfg = mergeDeployConfig(repoRoot);
  const api = (cfg.MORONGWA_API_DOCKER_NAME || "morongwa-api-test").trim();
  const conn = await sshConnect(cfg, repoRoot);

  const probeJs = `
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const TVPost = require("./dist/data/models/TVPost").default;

function pathnameFrom(url) {
  const n = String(url || "").trim();
  if (!n) return null;
  if (n.startsWith("http")) {
    try { return new URL(n).pathname; } catch { return null; }
  }
  return n.startsWith("/") ? n : "/" + n;
}

function fileExists(url) {
  const mediaPath = pathnameFrom(url);
  if (!mediaPath || !mediaPath.includes("/uploads/tv/")) return "remote";
  const fileName = path.basename(mediaPath);
  const cwdPath = path.join(process.cwd(), "uploads", "tv", fileName);
  const legacyPath = path.join(__dirname, "uploads", "tv", fileName);
  if (fs.existsSync(cwdPath)) return "ok:" + fileName;
  if (fs.existsSync(legacyPath)) return "legacy:" + fileName;
  return "missing:" + fileName;
}

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const byType = await TVPost.aggregate([
    { $match: { status: "approved" } },
    { $group: { _id: "$type", n: { $sum: 1 } } },
  ]);
  console.log("approved_by_type", JSON.stringify(byType));

  const samples = await TVPost.find({
    status: "approved",
    type: { $in: ["video", "image", "carousel"] },
  })
    .select("type mediaUrls creatorId createdAt")
    .sort({ createdAt: -1 })
    .limit(8)
    .lean();
  for (const p of samples) {
    const url = (p.mediaUrls || [])[0] || "";
    console.log("sample", p._id, p.type, fileExists(url), url.slice(0, 120));
  }

  const user = await mongoose.connection.db
    .collection("users")
    .findOne({ username: /ariel/i }, { projection: { username: 1, name: 1 } });
  console.log("ariel_user", JSON.stringify(user));
  if (user) {
    const posts = await TVPost.find({ creatorId: user._id })
      .select("type mediaUrls status createdAt caption")
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();
    console.log("ariel_post_count", posts.length);
    for (const p of posts) {
      const url = (p.mediaUrls || [])[0] || "";
      console.log(
        "ariel",
        p._id,
        p.status,
        p.type,
        fileExists(url),
        String(p.caption || "").slice(0, 40),
        url.slice(0, 100)
      );
    }
  }

  const videoCount = await TVPost.countDocuments({ status: "approved", type: "video" });
  console.log("approved_video_count", videoCount);

  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
`.trim();

  const cmd = `docker exec ${api} bash -lc 'cd /app && node -e ${JSON.stringify(probeJs)}'`;
  const r = await execSsh(conn, cmd);
  console.log(r.stdout);
  conn.end();
  process.exit(r.code || 0);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
