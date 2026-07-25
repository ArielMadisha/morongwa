#!/usr/bin/env node
/**
 * Second Robert Mugabe Legacy wall post — Mandela International Day.
 *   node scripts/addRobertMugabeLegacyMandelaDayPost.mjs --apply --push-remote
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

const USER_ID = "69cd1cc2703cf9d7f5bbb54d";
const EXPECTED_USERNAME = "robertmugabelegacy";
const apply = process.argv.includes("--apply");
const pushRemote = process.argv.includes("--push-remote");

const POST_TEXT = `Mandela International Day: The Question Africa Must Not Be Afraid To Ask
Today the world remembers Nelson Mandela.
The world celebrates him as a symbol of freedom, peace and reconciliation. But as Africans, we must also have the courage to ask difficult questions about the meaning of freedom.
President Robert Mugabe always argued that political freedom alone was not enough. He believed that true liberation must also put economic power into the hands of the majority.
The question is this:
If economic freedom had been achieved together with political freedom, would millions of Black South Africans today still feel like outsiders in the economy of their own country?
If the majority had gained greater ownership of land, mines, industries, banks and major companies, many young South Africans would not be fighting over limited job opportunities. They would be creating jobs. They would be building companies. They would be employing others, including fellow Africans from across the continent who come searching for opportunities.
The problem is not the African brother or sister who crosses a border looking for survival. The deeper problem is an economic system where many ordinary people still feel excluded from the wealth of their own nation.
A person who owns a mine does not fear another person looking for a job in that mine. A person who owns a company does not fear another person seeking employment in that company. Ownership creates confidence. Ownership creates dignity.
This is the lesson Africa's future leaders must understand:
A flag alone does not create freedom. A vote alone does not create freedom. True liberation must give people the power to own, to build and to control their economic destiny.
The struggle for Africa's freedom did not end when colonial flags came down. The struggle continues until African people become owners of the future they fought for.`;

const SOURCE_IMAGE = path.join(
  "C:",
  "Users",
  "Dell",
  ".cursor",
  "projects",
  "c-Users-Dell-cursor-projects-morongwa",
  "assets",
  "c__Users_Dell_AppData_Roaming_Cursor_User_workspaceStorage_8cbbb33495ce43c096bb0498540fe740_images_750686477_122189517122758757_5513175526005530123_n-e9fc10e0-1662-4357-bcdf-259ad79bf454.png"
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
  const tvFile = `tv-${USER_ID}-mandela-international-day.png`;
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
        captionPreview: POST_TEXT.slice(0, 120),
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
      hashtags: [
        "RobertMugabeLegacy",
        "MandelaDay",
        "NelsonMandela",
        "Mugabe",
        "Africa",
        "EconomicFreedom",
      ],
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
    console.log("Created Mandela International Day post");
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
