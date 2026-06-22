import fs from "fs";
import path from "path";
import crypto from "crypto";
import axios from "axios";
import mongoose from "mongoose";
import User from "../data/models/User";
import TVPost from "../data/models/TVPost";
import FacebookIngestState from "../data/models/FacebookIngestState";
import {
  FacebookGraphPost,
  fetchFacebookPagePosts,
  formatFacebookGraphError,
  isFacebookGraphConfigured,
  resolveFacebookPageId,
} from "./facebookGraphApi";
import {
  moderateRemoteImageUrl,
  moderateRemoteVideoUrl,
  moderationResultShouldRemove,
} from "./contentModeration";
import { logger } from "./monitoring";
import type { FacebookTvIngestSlot } from "../config/facebookTvIngest";

const UPLOADS_TV = path.join(process.cwd(), "uploads", "tv");

async function resolveFacebookTvCreatorId(slot?: FacebookTvIngestSlot): Promise<mongoose.Types.ObjectId> {
  const username =
    slot?.botId === "sports"
      ? String(
          process.env.FACEBOOK_TV_SPORTS_CREATOR_USERNAME ||
            process.env.AI_SPORTS_CREATOR_USERNAME ||
            "worldnews"
        )
          .trim()
          .toLowerCase()
      : String(process.env.FACEBOOK_TV_CREATOR_USERNAME || "qwerty_news").trim().toLowerCase();
  if (username) {
    const u = await User.findOne({ username }).select("_id").lean();
    if (u?._id) return u._id as mongoose.Types.ObjectId;
  }
  const admin = await User.findOne({ role: { $in: ["superadmin", "admin"] } }).select("_id").lean();
  if (admin?._id) return admin._id as mongoose.Types.ObjectId;
  throw new Error(
    `No Facebook TV creator user (set FACEBOOK_TV_CREATOR_USERNAME or ensure an admin exists)`
  );
}

function pickNewestUnimportedPost(
  posts: FacebookGraphPost[],
  lastImportedPostId?: string | null
): FacebookGraphPost | null {
  const sorted = [...posts].sort((a, b) => {
    const ta = a.createdTime ? Date.parse(a.createdTime) : 0;
    const tb = b.createdTime ? Date.parse(b.createdTime) : 0;
    return tb - ta;
  });
  if (!lastImportedPostId) {
    return sorted.find((p) => p.media.kind !== "none") || sorted[0] || null;
  }
  const idx = sorted.findIndex((p) => p.id === lastImportedPostId);
  if (idx <= 0) {
    return sorted.find((p) => p.id !== lastImportedPostId && p.media.kind !== "none") || null;
  }
  for (let i = idx - 1; i >= 0; i--) {
    const p = sorted[i];
    if (p.media.kind !== "none") return p;
  }
  return null;
}

async function downloadToTvUploads(
  remoteUrl: string,
  ext: string
): Promise<{ publicPath: string; mime: string }> {
  fs.mkdirSync(UPLOADS_TV, { recursive: true });
  const safeExt = ext.startsWith(".") ? ext : `.${ext}`;
  const filename = `tv-fb-${Date.now()}-${crypto.randomBytes(5).toString("hex")}${safeExt}`;
  const dest = path.join(UPLOADS_TV, filename);
  const res = await axios.get(remoteUrl, {
    responseType: "arraybuffer",
    timeout: 300000,
    maxContentLength: 150 * 1024 * 1024,
    headers: { "User-Agent": "Qwertymates-FacebookIngest/1.0" },
  });
  fs.writeFileSync(dest, Buffer.from(res.data));
  const mime = String(res.headers["content-type"] || "").split(";")[0].trim() || "application/octet-stream";
  return { publicPath: `/uploads/tv/${filename}`, mime };
}

function buildCaption(post: FacebookGraphPost, slot: FacebookTvIngestSlot): string {
  const parts: string[] = [];
  const msg = String(post.message || "").trim();
  if (msg) parts.push(msg.slice(0, 2000));
  parts.push(`Source: ${slot.pageLabel} (Facebook)`);
  if (post.permalinkUrl) parts.push(post.permalinkUrl);
  return parts.join("\n\n").slice(0, 4000);
}

export type FacebookIngestRunResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  tvPostId?: string;
  facebookPostId?: string;
};

export async function runFacebookTvIngestForSlot(slot: FacebookTvIngestSlot): Promise<FacebookIngestRunResult> {
  const slugKey = slot.pageSlug.trim().toLowerCase();
  const state =
    (await FacebookIngestState.findOne({ pageSlug: slugKey })) ||
    (await FacebookIngestState.create({ pageSlug: slugKey }));

  state.lastRunAt = new Date();
  await state.save();

  if (!isFacebookGraphConfigured()) {
    const msg = "FACEBOOK_PAGE_ACCESS_TOKEN not configured";
    state.lastErrorAt = new Date();
    state.lastErrorMessage = msg;
    await state.save();
    return { ok: false, reason: msg };
  }

  try {
    const { id: pageId } = await resolveFacebookPageId(slot.pageSlug);
    const posts = await fetchFacebookPagePosts(pageId, 20, slot.pageSlug);
    const post = pickNewestUnimportedPost(posts, state.lastImportedPostId);
    if (!post) {
      await FacebookIngestState.updateOne(
        { pageSlug: slugKey },
        { $set: { lastSuccessAt: new Date(), lastErrorAt: undefined, lastErrorMessage: undefined } }
      );
      return { ok: true, skipped: true, reason: "No new post with media" };
    }

    const existing = await TVPost.findOne({
      caption: { $regex: post.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") },
    })
      .select("_id")
      .lean();
    if (existing) {
      state.lastImportedPostId = post.id;
      state.lastSuccessAt = new Date();
      await state.save();
      return { ok: true, skipped: true, reason: "Already imported", facebookPostId: post.id };
    }

    let type: "image" | "video" = "image";
    let mediaUrls: string[] = [];
    let sensitive = false;

    if (post.media.kind === "video" && post.media.videoUrl) {
      const mod = await moderateRemoteVideoUrl(post.media.videoUrl, { failClosed: true });
      if (moderationResultShouldRemove(mod) || !mod.safe) {
        logger.warn("Facebook ingest blocked video (moderation)", {
          page: slot.pageSlug,
          postId: post.id,
          reason: mod.reason,
        });
        state.lastErrorAt = new Date();
        state.lastErrorMessage = mod.reason || "Video blocked by moderation";
        await state.save();
        return { ok: false, skipped: true, reason: mod.reason || "Video blocked", facebookPostId: post.id };
      }
      sensitive = !!mod.sensitive;
      const saved = await downloadToTvUploads(post.media.videoUrl, ".mp4");
      type = "video";
      mediaUrls = [saved.publicPath];
    } else if (post.media.kind === "image" && post.media.imageUrl) {
      const mod = await moderateRemoteImageUrl(post.media.imageUrl, { failClosed: true });
      if (moderationResultShouldRemove(mod) || !mod.safe) {
        logger.warn("Facebook ingest blocked image (moderation)", {
          page: slot.pageSlug,
          postId: post.id,
          reason: mod.reason,
        });
        state.lastErrorAt = new Date();
        state.lastErrorMessage = mod.reason || "Image blocked by moderation";
        await state.save();
        return { ok: false, skipped: true, reason: mod.reason || "Image blocked", facebookPostId: post.id };
      }
      sensitive = !!mod.sensitive;
      const saved = await downloadToTvUploads(post.media.imageUrl, ".jpg");
      type = "image";
      mediaUrls = [saved.publicPath];
    } else {
      return { ok: true, skipped: true, reason: "Post has no image/video", facebookPostId: post.id };
    }

    const creatorId = await resolveFacebookTvCreatorId(slot);
    const caption = `${buildCaption(post, slot)}\n\nfb:${post.id}`;
    const tvPost = await TVPost.create({
      creatorId,
      type,
      mediaUrls,
      caption,
      hashtags: slot.hashtags,
      genre: slot.genre,
      hasWatermark: true,
      status: "approved",
      aiModerated: true,
      sensitive,
      likeCount: 0,
      commentCount: 0,
      shareCount: 0,
      viewCount: 0,
    });

    state.lastImportedPostId = post.id;
    state.lastSuccessAt = new Date();
    state.lastErrorAt = undefined;
    state.lastErrorMessage = undefined;
    state.lastTvPostId = tvPost._id as mongoose.Types.ObjectId;
    await state.save();

    logger.info("Facebook TV ingest published", {
      page: slot.pageSlug,
      bot: slot.botId,
      tvPostId: String(tvPost._id),
      facebookPostId: post.id,
      type,
    });

    return {
      ok: true,
      tvPostId: String(tvPost._id),
      facebookPostId: post.id,
    };
  } catch (err) {
    const msg = formatFacebookGraphError(err);
    state.lastErrorAt = new Date();
    state.lastErrorMessage = msg.slice(0, 2000);
    await state.save();
    logger.error("Facebook TV ingest failed", { page: slot.pageSlug, error: msg });
    return { ok: false, reason: msg };
  }
}

export async function getFacebookIngestStatus() {
  const rows = await FacebookIngestState.find().sort({ pageSlug: 1 }).lean();
  return rows.map((r) => ({
    pageSlug: r.pageSlug,
    lastImportedPostId: r.lastImportedPostId,
    lastRunAt: r.lastRunAt,
    lastSuccessAt: r.lastSuccessAt,
    lastErrorAt: r.lastErrorAt,
    lastErrorMessage: r.lastErrorMessage,
    lastTvPostId: r.lastTvPostId ? String(r.lastTvPostId) : undefined,
  }));
}
