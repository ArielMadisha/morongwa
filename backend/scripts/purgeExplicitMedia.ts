/**
 * Scan local uploads + TV/profile media; remove explicit/suggestive images and related posts.
 *
 * Requires SIGHTENGINE_API_USER + SIGHTENGINE_API_SECRET in backend/.env
 *
 *   npm run purge:explicit-media:dry
 *   npm run purge:explicit-media
 *   npm run purge:explicit-media -- --tv-only
 *   npm run purge:explicit-media -- --limit=200
 */
import dotenv from "dotenv";
import path from "path";
import os from "os";
import crypto from "crypto";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

import fs from "fs";
import mongoose from "mongoose";
import axios from "axios";
import TVPost from "../src/data/models/TVPost";
import TVComment from "../src/data/models/TVComment";
import TVInteraction from "../src/data/models/TVInteraction";
import TVReport from "../src/data/models/TVReport";
import MusicSoundUsage from "../src/data/models/MusicSoundUsage";
import User from "../src/data/models/User";
import {
  isContentModerationConfigured,
  moderateMedia,
  moderationResultShouldRemove,
} from "../src/services/contentModeration";
import { mimeFromPath, resolveLocalUploadFilePath } from "../src/utils/uploadFilePath";

const DRY = process.argv.includes("--dry-run");
const FULL_SCAN = process.argv.includes("--full-scan");

function argValue(prefix: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(prefix));
  if (!hit) return undefined;
  const rest = hit.slice(prefix.length).trim();
  if (rest) return rest;
  const i = process.argv.indexOf(hit);
  const next = process.argv[i + 1];
  return next && !next.startsWith("--") ? next : undefined;
}

const LIMIT_RAW = argValue("--limit=");
const LIMIT = LIMIT_RAW ? Math.max(1, parseInt(LIMIT_RAW, 10) || 0) : undefined;
const SLEEP_MS = Math.max(0, parseInt(process.env.PURGE_MODERATION_SLEEP_MS || "600", 10) || 600);
function resolvePurgeMediaOrigin(): string {
  const raw = (process.env.PURGE_MEDIA_ORIGIN || process.env.FRONTEND_URL || "").trim();
  if (!raw || /localhost|127\.0\.0\.1/i.test(raw)) {
    return "https://www.qwertymates.com";
  }
  return raw.replace(/\/$/, "");
}

const IMAGE_EXT = /\.(jpe?g|png|gif|webp)$/i;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function walkImages(root: string, out: string[]) {
  if (!fs.existsSync(root)) return;
  const stack = [root];
  while (stack.length) {
    const cur = stack.pop()!;
    const st = fs.statSync(cur);
    if (st.isDirectory()) {
      for (const n of fs.readdirSync(cur)) stack.push(path.join(cur, n));
    } else if (IMAGE_EXT.test(cur)) {
      out.push(cur);
    }
  }
}

function publicPathFromFile(abs: string): string {
  const uploadsRoot = path.join(process.cwd(), "uploads");
  const rel = path.relative(uploadsRoot, abs).split(path.sep).join("/");
  return `/uploads/${rel}`;
}

async function scanFile(abs: string, publicUrlHint?: string): Promise<{ remove: boolean; reason?: string }> {
  let mod = await moderateMedia(abs, mimeFromPath(abs));
  if (!mod.safe && !(mod.categories && mod.categories.length > 0)) {
    console.warn(`SKIP inconclusive (API): ${publicUrlHint || abs}`);
    return { remove: false };
  }
  if (moderationResultShouldRemove(mod)) {
    return { remove: true, reason: mod.reason || mod.categories?.join(",") };
  }
  return { remove: false };
}

async function scanPublicUrl(publicUrl: string): Promise<{ remove: boolean; reason?: string }> {
  const local = resolveLocalUploadFilePath(publicUrl);
  if (local && fs.existsSync(local)) {
    return scanFile(local, publicUrl);
  }
  const origin = resolvePurgeMediaOrigin();
  const url = publicUrl.startsWith("http") ? publicUrl : `${origin}${publicUrl}`;
  const tmp = path.join(os.tmpdir(), `qm-mod-${crypto.randomBytes(8).toString("hex")}${path.extname(publicUrl) || ".jpg"}`);
  try {
    const res = await axios.get(url, { responseType: "arraybuffer", timeout: 45000, maxContentLength: 25 * 1024 * 1024 });
    fs.writeFileSync(tmp, res.data);
    const mime = String(res.headers["content-type"] || mimeFromPath(publicUrl));
    return scanFile(tmp, publicUrl);
  } catch (e) {
    console.warn(`SKIP fetch failed: ${publicUrl}`, e instanceof Error ? e.message : e);
    return { remove: false };
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
}

async function removeTvPostsByIds(ids: mongoose.Types.ObjectId[]) {
  if (!ids.length) return { posts: 0 };
  const [comments, interactions, reports, soundUsage, reposts, deleted] = await Promise.all([
    TVComment.deleteMany({ postId: { $in: ids } }),
    TVInteraction.deleteMany({ $or: [{ postId: { $in: ids } }, { repostId: { $in: ids } }] }),
    TVReport.deleteMany({ targetType: "post", targetId: { $in: ids } }),
    MusicSoundUsage.deleteMany({ tvPostId: { $in: ids } }),
    TVPost.deleteMany({ originalPostId: { $in: ids } }),
    TVPost.deleteMany({ _id: { $in: ids } }),
  ]);
  return {
    posts: deleted.deletedCount || 0,
    comments: comments.deletedCount || 0,
    interactions: interactions.deletedCount || 0,
    reports: reports.deletedCount || 0,
    reposts: reposts.deletedCount || 0,
    soundUsage: soundUsage.deletedCount || 0,
  };
}

async function stripUrlFromUsers(publicUrl: string) {
  const esc = publicUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(esc.replace(/\//g, "\\/"), "i");
  const users = await User.find({
    $or: [{ avatar: re }, { stripBackgroundPic: re }, { profileGalleryUrls: publicUrl }],
  })
    .select("_id avatar stripBackgroundPic profileGalleryUrls")
    .lean();

  for (const u of users) {
    const set: Record<string, unknown> = {};
    if (u.avatar && re.test(String(u.avatar))) set.avatar = "";
    if (u.stripBackgroundPic && re.test(String(u.stripBackgroundPic))) set.stripBackgroundPic = "";
    const gal = Array.isArray(u.profileGalleryUrls) ? u.profileGalleryUrls : [];
    const nextGal = gal.filter((g) => String(g) !== publicUrl);
    if (nextGal.length !== gal.length) set.profileGalleryUrls = nextGal;
    if (Object.keys(set).length) {
      if (!DRY) await User.updateOne({ _id: u._id }, { $set: set });
    }
  }
  return users.length;
}

async function main() {
  if (!isContentModerationConfigured()) {
    console.error("Sightengine is not configured (SIGHTENGINE_API_USER / SIGHTENGINE_API_SECRET).");
    process.exit(1);
  }

  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error("MONGO_URI not set");
    process.exit(1);
  }

  console.log(`Mode: ${DRY ? "DRY RUN" : "DELETE"}`);
  console.log(`Full uploads scan: ${FULL_SCAN}`);
  if (LIMIT) console.log(`Limit: ${LIMIT} files`);

  await mongoose.connect(uri);

  const removedPaths = new Set<string>();
  const postIdsToRemove = new Set<string>();
  let scanned = 0;
  let filesFlagged = 0;

  const tvPosts = await TVPost.find({
    type: { $in: ["image", "carousel", "video"] },
    status: { $in: ["approved", "pending", "rejected"] },
  })
    .select("_id type mediaUrls artworkUrl caption")
    .lean();

  const urlsFromPosts = new Set<string>();
  for (const p of tvPosts) {
    for (const u of p.mediaUrls || []) urlsFromPosts.add(String(u));
    if (p.artworkUrl) urlsFromPosts.add(String(p.artworkUrl));
  }

  const urlList = [...urlsFromPosts];

  const users = await User.find({
    $or: [
      { avatar: /\/uploads\// },
      { stripBackgroundPic: /\/uploads\// },
      { profileGalleryUrls: /\/uploads\// },
    ],
  })
    .select("avatar stripBackgroundPic profileGalleryUrls")
    .lean();
  for (const u of users) {
    if (u.avatar) urlsFromPosts.add(String(u.avatar));
    if (u.stripBackgroundPic) urlsFromPosts.add(String(u.stripBackgroundPic));
    for (const g of u.profileGalleryUrls || []) urlsFromPosts.add(String(g));
  }

  if (FULL_SCAN) {
    const extra: string[] = [];
    walkImages(path.join(process.cwd(), "uploads"), extra);
    for (const abs of extra) {
      urlList.push(publicPathFromFile(abs));
    }
  }

  const uniqueUrls = [...new Set(urlList.filter((u) => u.includes("/uploads/")))].sort();
  const slice = LIMIT ? uniqueUrls.slice(0, LIMIT) : uniqueUrls;
  console.log(`URLs to scan: ${slice.length} (unique ${uniqueUrls.length}), origin ${resolvePurgeMediaOrigin()}`);

  for (const pub of slice) {
    scanned++;
    const { remove, reason } = await scanPublicUrl(pub);
    if (remove) {
      filesFlagged++;
      removedPaths.add(pub);
      console.log(`FLAG ${pub} — ${reason || "explicit/suggestive"}`);
      if (!DRY) {
        const local = resolveLocalUploadFilePath(pub);
        if (local) {
          try {
            fs.unlinkSync(local);
          } catch {
            /* ignore */
          }
        }
      }
    }
    if (SLEEP_MS) await sleep(SLEEP_MS);
  }

  for (const p of tvPosts) {
    const urls = [...(p.mediaUrls || []), ...(p.artworkUrl ? [p.artworkUrl] : [])];
    const hit = urls.some((u) => removedPaths.has(String(u)));
    if (hit) postIdsToRemove.add(String(p._id));
  }

  const ids = [...postIdsToRemove].map((id) => new mongoose.Types.ObjectId(id));
  console.log(`\nTV posts to remove: ${ids.length}`);
  console.log(`Files flagged: ${filesFlagged} (scanned ${scanned})`);

  let usersTouched = 0;
  for (const pub of removedPaths) {
    usersTouched += await stripUrlFromUsers(pub);
  }

  if (ids.length && !DRY) {
    const del = await removeTvPostsByIds(ids);
    console.log("Deleted TV posts:", del);
  } else if (DRY && ids.length) {
    console.log("Dry run — posts not deleted");
  }

  console.log(`User records touched (avatar/gallery): ${usersTouched}`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
