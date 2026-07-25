#!/usr/bin/env node
/**
 * Rebrand @nfqsxlc8718 → Iran International (@iraninternational), set password + story post.
 *
 *   node scripts/setupIranInternationalAccount.mjs --dry-run
 *   node scripts/setupIranInternationalAccount.mjs --apply --push-remote
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

const SOURCE_USER_ID = "69cd1cc2703cf9d7f5bbb53a";
const SOURCE_USERNAME = "nfqsxlc8718";
const NEW_NAME = "Iran International";
const NEW_USERNAME = "iraninternational";
const NEW_PASSWORD = "11111111";
const NEW_EMAIL = "nfqsxlc8718@user.com";
const NEW_PHONE = "+998995412873";

const POST_TEXT = `Qatar Mourns a Painful Day in History: Former Emir Sheikh Hamad bin Khalifa Al Thani Passes Away Amid Iranian Missile Strikes on Doha
Today will be recorded as an extremely painful day in Qatar's history.
The first shock came shortly after dawn prayers, when missiles suddenly fired from Iran struck and shook the entire city of Doha multiple times. The second shock came about an hour after that attack, when news outlets around the world suddenly reported the death of Qatar's former Emir, Sheikh Hamad bin Khalifa Al Thani.
The Qatar News Agency (QNA) confirmed his death on Sunday. He was 74 years old. While the official cause of death was not announced, the news was met with expressions of mourning, "Inna lillahi wa inna ilayhi raji'un."
Sheikh Hamad was not merely a former head of state of Qatar; he was a leader who spoke out loudly on the world stage for Palestine for years. However, he did not limit himself to statements alone. In 2012, when Gaza stood isolated and devastated under severe blockade, he became the only Arab head of state to personally visit Gaza and stand alongside its besieged people. That visit remains a historic gesture, significant not only politically but also from a humanitarian standpoint.
Shortly after news of his death spread, Al Jazeera's Gaza correspondent, the veteran journalist Wael al-Dahdouh, expressed deep grief in a Facebook post, writing that they had lost a great man today, a true humanitarian, a respected Arab leader. He wrote that they had lost the man who, when Gaza was isolated and under severe blockade, stood by its people and sent a message of humanity to the world through his very presence. He added that they had lost the man who was the first to call and offer condolences after his entire family was martyred during the horrific war of genocide, and who shared in their grief. He prayed that Allah would envelop the late Emir's father in His boundless mercy, forgive him, and grant him the highest station in Jannatul Firdaus.
Images show the current Emir and his brothers personally carrying their late father's body on their shoulders, a moment that made this farewell even more emotional.
Sheikh Hamad bin Khalifa Al Thani ruled Qatar from 1995 to 2013. Under his leadership, the country underwent a fundamental transformation in its economy, diplomacy, media landscape and global investment strategy. This small, natural gas-rich Gulf nation rose to a significant position in international politics, energy markets, media and business under his rule.
It was during his reign that Qatar founded the international media network Al Jazeera, which created a new wave in Arab world media. At the same time, the country expanded its global investments, including stakes in international assets such as London's luxury department store Harrods.
In 2013, Sheikh Hamad voluntarily relinquished power, handing over leadership to his son, Sheikh Tamim bin Hamad Al Thani. Such a peaceful and voluntary transfer of power is considered extremely rare in Middle Eastern history. Notably, he himself had come to power in 1995 through a bloodless coup that removed his own father, Sheikh Khalifa bin Hamad Al Thani, from power.
Soon after taking power, he recognized an important reality: Qatar's local population was only around three hundred thousand people. Building a powerful military with such a limited population was nearly impossible. This raised the question of whether Qatar, due to its limited manpower, would always remain within Saudi Arabia's sphere of influence, or become a dependent state like Bahrain.
It was from this reality that he chose a different path. Instead of military strength, he prioritized soft power, where knowledge, education, diplomacy and influence, rather than weapons, became the primary sources of strength.
In the same year he took power, he established the Qatar Foundation. While it became one of the largest humanitarian organizations in the world, one of its central goals was revolutionary investment in education, particularly encouraging leading Western universities, including Ivy League institutions, to establish campuses in Qatar.
In 2001, the Ivy League's Weill Cornell Medical College opened its campus in Qatar, its first campus outside the United States. Under the agreement, the Qatari government covered all operational costs for the first ten years. In essence, the foreign universities would provide education and issue their own accredited degrees, while Qatar would bear the costs of infrastructure and operations.
The first ten years of operating costs for Weill Cornell Medical College alone amounted to 750 million US dollars, equivalent to roughly 920 billion taka at current value, and this enormous sum was spent on just a single campus.
An entire area of Doha was named "Education City," built to house campuses of the world's top universities. Qatar continues to reap the benefits of this long-term investment today. In particular, Qataris are considered among the most skilled in the world in social sciences and international negotiation.
Today, whether it concerns the Taliban, Iran, Syria or Pakistan, Qatar's mediation and expertise are sought in complex international agreements, intricate legal clauses, diplomatic settlements and high-level negotiations. In regional diplomacy as well, Qatar emerged during Sheikh Hamad's era as a mediator in various crises stretching from Afghanistan to North Africa.
At the same time, however, the country faced criticism from several Western and regional allied nations over its relationships with Iran, Hamas and the Muslim Brotherhood, as well as over Al Jazeera's editorial positions.
Continuing the sports diplomacy that began under his leadership, Qatar secured the rights to host the 2022 FIFA World Cup, further strengthening the country's global recognition.
Trained at Britain's Royal Military Academy Sandhurst, Sheikh Hamad later served as Commander of Qatar's Armed Forces, Minister of Defence, and Crown Prince. He subsequently laid the foundation for long-term economic transformation centered on the country's vast oil and natural gas resources.
According to analysts, Sheikh Hamad bin Khalifa Al Thani's leadership laid the groundwork for transforming Qatar from a small Gulf state into one of the most influential forces in global diplomacy, energy markets, media, education and international investment.
May Allah forgive Hamad bin Khalifa Al Thani, fill his grave with light, and grant him the highest station in Jannatul Firdaus. Ameen.`;

const HASHTAGS = ["Qatar", "SheikhHamad", "Doha", "IranInternational", "MiddleEast"];

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const pushRemote = args.includes("--push-remote");
const dryRun = !apply;

const SOURCE_IMAGE = path.join(
  "C:",
  "Users",
  "Dell",
  ".cursor",
  "projects",
  "c-Users-Dell-cursor-projects-morongwa",
  "assets",
  "c__Users_Dell_AppData_Roaming_Cursor_User_workspaceStorage_8cbbb33495ce43c096bb0498540fe740_images_744600601_2474757773045300_2169288578592059854_n-185c10bc-a833-46db-ac26-c5f52ae9920c.png"
);

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
  if (!fs.existsSync(SOURCE_IMAGE)) {
    console.error("Story image not found:", SOURCE_IMAGE);
    process.exit(1);
  }
  const mongo = process.env.MONGO_URI;
  if (!mongo) {
    console.error("MONGO_URI not set");
    process.exit(1);
  }

  const oid = new mongoose.Types.ObjectId(SOURCE_USER_ID);
  const avatarFile = `profile-${SOURCE_USER_ID}-iraninternational-avatar.png`;
  const tvFile = `tv-${SOURCE_USER_ID}-qatar-sheikh-hamad.png`;
  const avatarPath = `/uploads/profiles/${avatarFile}`;
  const tvMediaPath = `/uploads/tv/${tvFile}`;
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
    mediaUrls: tvMediaPath,
  });

  const plan = {
    dryRun,
    userId: SOURCE_USER_ID,
    from: { name: source.name, username: source.username },
    to: { name: NEW_NAME, username: NEW_USERNAME, avatar: avatarPath, password: "(set)" },
    post: {
      media: tvMediaPath,
      captionPreview: POST_TEXT.slice(0, 140) + "…",
      skip: !!existingPost,
    },
  };
  console.log(JSON.stringify(plan, null, 2));

  if (dryRun) {
    console.log("Re-run with --apply --push-remote to execute.");
    await mongoose.disconnect();
    return;
  }

  fs.mkdirSync(profilesDir, { recursive: true });
  fs.mkdirSync(tvDir, { recursive: true });
  fs.copyFileSync(SOURCE_IMAGE, path.join(profilesDir, avatarFile));
  fs.copyFileSync(SOURCE_IMAGE, path.join(tvDir, tvFile));

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
      type: "image",
      mediaUrls: [tvMediaPath],
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
    console.log("Created wall post");
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
      await sftpPut(conn, path.join(tvDir, tvFile), `${remoteRoot}/uploads/tv/${tvFile}`);
      console.log("Pushed avatar + post image to production uploads");
    } finally {
      conn.end();
    }
  } else {
    console.log("Local files ready. Re-run with --push-remote to sync production.");
  }

  await mongoose.disconnect();
  console.log("Done.", {
    username: NEW_USERNAME,
    password: NEW_PASSWORD,
    profile: `/user/${SOURCE_USER_ID}`,
  });
}

main().catch(async (e) => {
  console.error(e?.message || e);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
