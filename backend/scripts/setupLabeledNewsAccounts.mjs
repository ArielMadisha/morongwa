#!/usr/bin/env node
/**
 * Update labeled news/social accounts: name-based username, password, avatar, feed post.
 *
 *   node scripts/setupLabeledNewsAccounts.mjs --dry-run
 *   node scripts/setupLabeledNewsAccounts.mjs --apply
 *   node scripts/setupLabeledNewsAccounts.mjs --apply --push-remote
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

const PASSWORD = "22222222";

const ASSETS_DIRS = [
  path.join(repoRoot, "assets"),
  path.join(repoRoot, "..", "c-Users-Dell-cursor-projects-morongwa", "assets"),
];

function nameToUsername(name) {
  const slug = String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 30);
  return slug || "user";
}

const ACCOUNTS = [
  { userId: "69cd1cc2703cf9d7f5bbb529", email: "jcxshqt8836@user.com", phone: "+351917201481", name: "Marie-Mado Zambo", imageKey: "Marie-Mado_Zambo" },
  { userId: "69cd1cc2703cf9d7f5bbb52a", email: "nniyfdm9066@user.com", phone: "+35134689727723", name: "Guurdoon", imageKey: "Guurdoon" },
  { userId: "69cd1cc2703cf9d7f5bbb52b", email: "qtcycgn4706@user.com", phone: "+34689727723", name: "iran news", imageKey: "iran_news" },
  { userId: "69cd1cc2703cf9d7f5bbb52c", email: "wwhcnmo0175@user.com", phone: "+528184760979", name: "No One Cares", imageKey: "no_one_cares" },
  { userId: "69cd1cc2703cf9d7f5bbb52d", email: "ayletkg1975@user.com", phone: "+998995416006", name: "happy africans", imageKey: "happy_africans" },
  { userId: "69cd1cc2703cf9d7f5bbb52f", email: "ajaukai2258@user.com", phone: "+998995415102", name: "Mr Scientific", imageKey: "mr_scientific" },
  { userId: "69cd1cc2703cf9d7f5bbb52e", email: "lsfedin9619@user.com", phone: "+998995411424", name: "Tzaneen voice", imageKey: "tzaneen_voice" },
  { userId: "69cd1cc2703cf9d7f5bbb530", email: "rpybeao3681@user.com", phone: "+998995416798", name: "Yeni Safak", imageKey: "Yeni_Safak" },
  { userId: "69cd1cc2703cf9d7f5bbb532", email: "bdfetrd4402@user.com", phone: "+998995415766", name: "Mukuzim", imageKey: "mukuzim" },
  { userId: "69cd1cc2703cf9d7f5bbb531", email: "koftspd9616@user.com", phone: "+998995413636", name: "Open Learning Group", imageKey: "open_learning_group" },
  { userId: "69cd1cc2703cf9d7f5bbb535", email: "qkkusvu6895@user.com", phone: "+998995417774", name: "The News Vine South Africa", imageKey: "the_news_vine_south_africa" },
  { userId: "69cd1cc2703cf9d7f5bbb537", email: "dlgkekb8389@user.com", phone: "+998995416086", name: "Madibogo Crew", imageKey: "madibogo_crew" },
  { userId: "69cd1cc2703cf9d7f5bbb533", email: "cdhbcsf6910@user.com", phone: "+998995411030", name: "chichi chika", imageKey: "chichi_chika" },
  { userId: "69cd1cc2703cf9d7f5bbb534", email: "wdjahrw9676@user.com", phone: "+998995417079", name: "Ma Motshwaedi", imageKey: "mamotshwaedi" },
  { userId: "69cd1cc2703cf9d7f5bbb536", email: "nmfmxjp7322@user.com", phone: "+998995417713", name: "Eye Gambia", imageKey: "eyegambia" },
  { userId: "69cd1cc2703cf9d7f5bbb538", email: "lmrreea0967@user.com", phone: "+998995414310", name: "AfriVoices", imageKey: "afrivoices" },
  { userId: "69cd1cc2703cf9d7f5bbb53b", email: "ctdigig3427@user.com", phone: "+998995414597", name: "Madiporo Hlekiso", imageKey: "madiporo" },
  {
    userId: "69fca511d8a4551af5473221",
    email: "wa_26775006466@morongwa.local",
    phone: "26775006466",
    name: "Mechanics Mix",
    username: "mechanicsmix",
    imageKey: "mechanics_mix",
    postCaption: `The Wärtsilä RT-flex96C is a true engineering marvel, reigning as the world's largest and most powerful marine diesel engine with a jaw-dropping output of 107,390 horsepower and 7.6 million Newton-meters of torque. Standing as tall as a four-story building and weighing over 2,300 tons, this mechanical titan is so massive that workers can literally walk inside its crankcase during maintenance. Operating at a remarkably slow, rhythmic pace of just 102 revolutions per minute—compared to thousands in a standard car—it possesses an astonishing thermal efficiency exceeding 50%, meaning it converts over half of its fuel into actual propulsive power, making it one of the most efficient combustion engines ever created.

Driving the world's largest container ships across oceans, this 27-meter-long beast consumes up to 250 tons of heavy fuel per day, yet its advanced common-rail fuel injection system ensures it burns every drop with incredible precision to minimize emissions. Each of its massive pistons weighs about 5.5 tons and has a stroke of nearly 8 feet, meaning a single cylinder produces more power than dozens of high-performance sports cars combined. By single-handedly propelling ships carrying up to 11,000 shipping containers at speeds of 25 knots, this single engine serves as the unsung, colossal heartbeat of global trade, keeping modern civilization connected.`,
  },
].map((row) => ({ ...row, username: row.username || nameToUsername(row.name) }));

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const pushRemote = args.includes("--push-remote");
const dryRun = !apply;
const onlyUserId = (args.find((a) => a.startsWith("--user-id=")) || "").split("=")[1]?.trim() || "";
const ACCOUNTS_TO_RUN = onlyUserId ? ACCOUNTS.filter((a) => a.userId === onlyUserId) : ACCOUNTS;

function resolveAssetsDir() {
  for (const dir of ASSETS_DIRS) {
    if (fs.existsSync(dir)) return dir;
  }
  return null;
}

function findSourceImage(assetsDir, imageKey) {
  const files = fs.readdirSync(assetsDir);
  const hit = files.find((f) => f.includes(`images_${imageKey}-`) && /\.png$/i.test(f));
  if (!hit) throw new Error(`No asset for imageKey=${imageKey} in ${assetsDir}`);
  return path.join(assetsDir, hit);
}

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
  const mongo = process.env.MONGO_URI;
  if (!mongo) {
    console.error("MONGO_URI not set");
    process.exit(1);
  }
  if (onlyUserId && ACCOUNTS_TO_RUN.length === 0) {
    console.error(`No account configured for user-id=${onlyUserId}`);
    process.exit(1);
  }

  const assetsDir = resolveAssetsDir();
  if (!assetsDir) {
    console.error("Assets folder not found");
    process.exit(1);
  }

  const profilesDir = path.join(backendRoot, "uploads", "profiles");
  fs.mkdirSync(profilesDir, { recursive: true });

  const plan = [];
  const uploadedFiles = [];

  for (const acct of ACCOUNTS_TO_RUN) {
    const src = findSourceImage(assetsDir, acct.imageKey);
    const avatarFile = `profile-${acct.userId}-avatar.png`;
    const dest = path.join(profilesDir, avatarFile);
    const avatarPath = `/uploads/profiles/${avatarFile}`;
    plan.push({
      ...acct,
      avatarFile,
      avatarPath,
      sourceImage: path.basename(src),
    });
    if (!dryRun) {
      fs.copyFileSync(src, dest);
      uploadedFiles.push({ local: dest, name: avatarFile });
    }
  }

  await mongoose.connect(mongo);
  const users = mongoose.connection.db.collection("users");
  const tvposts = mongoose.connection.db.collection("tvposts");
  const passwordHash = dryRun ? null : await bcrypt.hash(PASSWORD, 10);

  const results = [];

  for (const acct of plan) {
    const oid = new mongoose.Types.ObjectId(acct.userId);
    const existing = await users.findOne({ _id: oid });
    if (!existing) {
      results.push({ userId: acct.userId, status: "missing" });
      continue;
    }

    const usernameTaken = await users.findOne({
      username: acct.username,
      _id: { $ne: oid },
    });
    if (usernameTaken) {
      results.push({
        userId: acct.userId,
        status: "username_taken",
        username: acct.username,
        by: String(usernameTaken._id),
      });
      continue;
    }

    const caption =
      acct.postCaption ||
      `${acct.name} is now on Qwertymates. Follow @${acct.username} for updates.`;
    const postMedia = acct.postImageKey
      ? `/uploads/tv/${acct.postImageFile || `tv-${acct.userId}-post.png`}`
      : acct.avatarPath;
    const postDoc = {
      creatorId: oid,
      type: "image",
      mediaUrls: [postMedia],
      caption,
      genre: "news",
      hasWatermark: false,
      status: "approved",
      likeCount: 0,
      commentCount: 0,
      shareCount: 0,
      viewCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (dryRun) {
      results.push({
        userId: acct.userId,
        from: { name: existing.name, username: existing.username },
        to: { name: acct.name, username: acct.username, avatar: acct.avatarPath },
        post: { caption, mediaUrls: postDoc.mediaUrls },
        status: "planned",
      });
      continue;
    }

    await users.updateOne(
      { _id: oid },
      {
        $set: {
          name: acct.name,
          username: acct.username,
          email: acct.email,
          phone: acct.phone,
          avatar: acct.avatarPath,
          passwordHash,
          active: true,
          suspended: false,
          locked: false,
          isVerified: true,
          updatedAt: new Date(),
        },
      }
    );

    await tvposts.insertOne(postDoc);

    results.push({
      userId: acct.userId,
      username: acct.username,
      name: acct.name,
      profileUrl: `https://www.qwertymates.com/user/${acct.userId}`,
      status: "updated",
    });
  }

  console.log(JSON.stringify({ dryRun, pushRemote, results }, null, 2));

  await mongoose.disconnect();

  if (dryRun) {
    console.log("Re-run with --apply to execute. Add --push-remote to SFTP avatars.");
    return;
  }

  if (pushRemote && uploadedFiles.length) {
    const cfg = mergeDeployConfig(repoRoot);
    const remoteDir = `${resolveRemoteBackendRoot(cfg)}/uploads/profiles`;
    console.log(`==> SFTP ${uploadedFiles.length} avatar(s) -> ${remoteDir}/`);
    const conn = await sshConnect(cfg, repoRoot);
    try {
      await execSsh(conn, `mkdir -p "${remoteDir}"`);
      for (const f of uploadedFiles) {
        await sftpPut(conn, f.local, `${remoteDir}/${f.name}`);
        console.log(`    ${f.name}`);
      }
    } finally {
      conn.end();
    }
  }

  console.log(JSON.stringify({ ok: true, password: PASSWORD, updated: results.filter((r) => r.status === "updated").length }));
}

main().catch(async (e) => {
  console.error("ERR", e?.message || e);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
