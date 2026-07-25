/**
 * Repair profile backfill media URLs in MongoDB using live HTTP checks (not container fs).
 * Run from backend/: node scripts/repairProfileBackfillMediaUrls.mjs [username]
 */
import dotenv from "dotenv";
import mongoose from "mongoose";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const API_BASE = String(process.env.BACKEND_URL || "https://api.qwertymates.com").replace(/\/$/, "");
const PROFILE_RE =
  /^\/uploads\/profiles\/(.+)-([a-f0-9]{24})-([a-z0-9-]+)-(\d+)\.(jpe?g|png|gif|webp)$/i;

const headCache = new Map();

async function urlOk(publicPath) {
  const p = String(publicPath || "").trim();
  if (!p.startsWith("/uploads/")) return false;
  if (headCache.has(p)) return headCache.get(p);
  try {
    const res = await fetch(`${API_BASE}${p}`, { method: "HEAD", redirect: "follow" });
    const ok = res.ok;
    headCache.set(p, ok);
    return ok;
  } catch {
    headCache.set(p, false);
    return false;
  }
}

async function resolveWorkingProfileUrl(publicPath, knownTimestamps = []) {
  const p = String(publicPath || "").trim();
  if (!p.startsWith("/uploads/profiles/")) return p;
  if (await urlOk(p)) return p;
  const m = PROFILE_RE.exec(p);
  if (!m) return p;
  const [, slug, uid, label] = m;
  const prefix = `${slug}-${uid}-${label}-`;
  const ext = p.slice(p.lastIndexOf("."));
  const candidates = new Set([p]);
  for (const ts of knownTimestamps) {
    candidates.add(`/uploads/profiles/${prefix}${ts}${ext}`);
    candidates.add(`/uploads/profiles/${prefix}${ts}.png`);
    candidates.add(`/uploads/profiles/${prefix}${ts}.jpg`);
  }
  for (const c of candidates) {
    if (c !== p && (await urlOk(c))) return c;
  }
  return p;
}

async function main() {
  const username = process.argv[2] || "aturetutu";
  await mongoose.connect(process.env.MONGO_URI);
  const User = mongoose.model(
    "User",
    new mongoose.Schema({}, { strict: false }),
    "users"
  );
  const TVPost = mongoose.model(
    "TVPost",
    new mongoose.Schema({}, { strict: false }),
    "tvposts"
  );

  const user = await User.findOne({ username: new RegExp(`^${username}$`, "i") });
  if (!user) throw new Error(`User @${username} not found`);
  const uid = user._id;

  const KNOWN_TS = [
    1782254121965, 1782254121968, 1782254121970, 1782254121972, 1782254121974,
    1782157192498, 1782157192502, 1782157192503, 1782157192505, 1782157192507,
    1782037989916, 1782037989922, 1782037989926, 1782037989938, 1782037989941,
    1782037786742, 1782037786747, 1782037718067, 1782037718071, 1782037056162,
    1782037056165, 1782037056167, 1782037056176,
  ];

  let userChanged = false;
  if (user.avatar) {
    const fixed = await resolveWorkingProfileUrl(String(user.avatar), KNOWN_TS);
    if (fixed !== user.avatar) {
      console.log("avatar", user.avatar, "->", fixed);
      user.avatar = fixed;
      userChanged = true;
    }
  }
  if (Array.isArray(user.profileGalleryUrls)) {
    const next = [];
    for (const u of user.profileGalleryUrls) {
      const fixed = await resolveWorkingProfileUrl(String(u), KNOWN_TS);
      if (!next.includes(fixed)) next.push(fixed);
      if (fixed !== u) console.log("gallery", u, "->", fixed);
    }
    if (JSON.stringify(next) !== JSON.stringify(user.profileGalleryUrls)) {
      user.profileGalleryUrls = next;
      userChanged = true;
    }
  }
  if (userChanged) {
    await User.updateOne(
      { _id: uid },
      {
        $set: {
          avatar: user.avatar,
          profileGalleryUrls: user.profileGalleryUrls,
        },
      }
    );
  }

  const posts = await TVPost.find({ creatorId: uid, "mediaUrls.0": { $exists: true } });
  let postFixes = 0;
  for (const post of posts) {
    const urls = Array.isArray(post.mediaUrls) ? [...post.mediaUrls] : [];
    let changed = false;
    for (let i = 0; i < urls.length; i++) {
      const fixed = await resolveWorkingProfileUrl(String(urls[i]), KNOWN_TS);
      if (fixed !== urls[i]) {
        console.log("post", post._id, urls[i], "->", fixed);
        urls[i] = fixed;
        changed = true;
      }
    }
    if (changed) {
      await TVPost.updateOne({ _id: post._id }, { $set: { mediaUrls: urls } });
      postFixes += 1;
    }
  }

  console.log(`\nDone @${username}: user ${userChanged ? "updated" : "ok"}, posts fixed ${postFixes}`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
