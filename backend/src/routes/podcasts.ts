/**
 * QwertyPodcasts API — see DOCS/QwertyPodcasts/ARCHITECTURE.md and API.md.
 *
 * Phase 1: shows, episode upload with server-side processing, browse by category,
 * streaming playback, likes/comments, subscribe + new-episode notifications,
 * QwertyTV feed cross-post, and premium unlock via the ACBPay Wallet.
 */

import { Router, Response, NextFunction } from "express";
import path from "path";
import mongoose from "mongoose";
import { authenticate, authenticateOptional, AuthRequest } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import Podcast from "../data/models/Podcast";
import PodcastEpisode from "../data/models/PodcastEpisode";
import PodcastSubscription from "../data/models/PodcastSubscription";
import PodcastComment from "../data/models/PodcastComment";
import PodcastInteraction from "../data/models/PodcastInteraction";
import PodcastPurchase from "../data/models/PodcastPurchase";
import TVPost from "../data/models/TVPost";
import Wallet from "../data/models/Wallet";
import { onWalletSaved } from "../services/walletBalanceSideEffects";
import { sendNotification } from "../services/notification";
import { logger } from "../services/monitoring";
import { podcastEpisodeUpload, podcastCoverUpload, podcastPublicUrl } from "../middleware/podcastUpload";
import {
  processEpisodeInBackground,
  moderateEpisodeText,
  requestTranscript,
} from "../services/podcastProcessing";

const router = Router();

/** Categories shown in QwertyMedia → QwertyPodcasts. */
export const PODCAST_CATEGORIES = [
  { id: "business", label: "Business" },
  { id: "lifestyle", label: "Lifestyle" },
  { id: "music", label: "Music" },
  { id: "news", label: "News & Politics" },
  { id: "sport", label: "Sport" },
  { id: "technology", label: "Technology" },
  { id: "education", label: "Education" },
  { id: "health", label: "Health & Wellness" },
  { id: "comedy", label: "Comedy" },
  { id: "faith", label: "Faith & Spirituality" },
  { id: "truecrime", label: "True Crime" },
  { id: "society", label: "Society & Culture" },
] as const;

const CATEGORY_IDS = new Set(PODCAST_CATEGORIES.map((c) => c.id));

function parsePaging(req: AuthRequest) {
  const page = Math.max(parseInt(String(req.query.page || "1"), 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(String(req.query.limit || "20"), 10) || 20, 1), 50);
  return { page, limit, skip: (page - 1) * limit };
}

function parseTags(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((t) => String(t).trim()).filter(Boolean).slice(0, 20);
  return String(raw || "")
    .split(",")
    .map((t) => t.trim().replace(/^#/, ""))
    .filter(Boolean)
    .slice(0, 20);
}

/** Apple Guideline 3.1.1 — no wallet-funded digital unlocks on the iOS binary. */
function isIosClient(req: AuthRequest): boolean {
  const declared = String(
    req.body?.platform || req.query?.platform || req.headers["x-qwerty-platform"] || ""
  ).toLowerCase();
  return declared === "ios";
}

/** Episode fields safe to return when the caller has not unlocked a premium episode. */
function lockEpisode(ep: Record<string, any>, unlocked: boolean) {
  if (!ep.isPremium || unlocked) return { ...ep, locked: false };
  const { audioUrl, hlsUrl, renditions, transcriptText, ...rest } = ep;
  return { ...rest, renditions: [], locked: true };
}

async function unlockedEpisodeIds(userId: string | undefined, episodeIds: mongoose.Types.ObjectId[]) {
  if (!userId || !episodeIds.length) return new Set<string>();
  const rows = await PodcastPurchase.find({ userId, episodeId: { $in: episodeIds } })
    .select("episodeId")
    .lean();
  return new Set(rows.map((r) => String(r.episodeId)));
}

/* ------------------------------------------------------------------ catalog */

/** GET /api/podcasts/categories */
router.get("/categories", (_req, res: Response) => {
  res.json({ data: PODCAST_CATEGORIES });
});

/** GET /api/podcasts/shows — browse shows, optional ?category= &q= */
router.get("/shows", async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { page, limit, skip } = parsePaging(req);
    const filter: Record<string, unknown> = { status: "active" };
    const category = String(req.query.category || "").trim();
    if (category && category !== "all") filter.category = category;
    const q = String(req.query.q || "").trim();
    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      (filter as any).$or = [{ title: rx }, { description: rx }, { tags: rx }];
    }
    const [total, shows] = await Promise.all([
      Podcast.countDocuments(filter),
      Podcast.find(filter)
        .sort({ subscriberCount: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("ownerId", "name username profilePicture")
        .lean(),
    ]);
    res.json({ data: shows, page, limit, total, hasMore: skip + shows.length < total });
  } catch (err) {
    next(err);
  }
});

/** GET /api/podcasts/shows/:id */
router.get("/shows/:id", async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const show = await Podcast.findById(req.params.id)
      .populate("ownerId", "name username profilePicture")
      .lean();
    if (!show || show.status === "removed") throw new AppError("Podcast not found", 404);
    res.json({ data: show });
  } catch (err) {
    next(err);
  }
});

/** GET /api/podcasts/episodes — browse episodes, ?category= &podcastId= &q= &sort=newest|popular */
router.get("/episodes", authenticateOptional, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { page, limit, skip } = parsePaging(req);
    const filter: Record<string, unknown> = { status: "published", moderationState: { $ne: "rejected" } };
    const category = String(req.query.category || "").trim();
    if (category && category !== "all") filter.category = category;
    const podcastId = String(req.query.podcastId || "").trim();
    if (podcastId && mongoose.isValidObjectId(podcastId)) filter.podcastId = podcastId;
    const q = String(req.query.q || "").trim();
    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      (filter as any).$or = [{ title: rx }, { description: rx }, { tags: rx }];
    }
    const sort: Record<string, 1 | -1> =
      String(req.query.sort || "newest") === "popular"
        ? { playCount: -1, publishedAt: -1 }
        : { publishedAt: -1, createdAt: -1 };

    const [total, episodes] = await Promise.all([
      PodcastEpisode.countDocuments(filter),
      PodcastEpisode.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .populate("creatorId", "name username profilePicture")
        .populate("podcastId", "title coverUrl category")
        .lean(),
    ]);

    const unlocked = await unlockedEpisodeIds(
      req.user ? String(req.user._id) : undefined,
      episodes.map((e) => e._id as mongoose.Types.ObjectId)
    );
    res.json({
      data: episodes.map((e) => lockEpisode(e as any, unlocked.has(String(e._id)))),
      page,
      limit,
      total,
      hasMore: skip + episodes.length < total,
    });
  } catch (err) {
    next(err);
  }
});

/** GET /api/podcasts/episodes/:id */
router.get("/episodes/:id", authenticateOptional, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const episode = await PodcastEpisode.findById(req.params.id)
      .populate("creatorId", "name username profilePicture")
      .populate("podcastId", "title coverUrl category ownerId")
      .lean();
    if (!episode || episode.status === "removed") throw new AppError("Episode not found", 404);

    const userId = req.user ? String(req.user._id) : undefined;
    const unlocked = await unlockedEpisodeIds(userId, [episode._id as mongoose.Types.ObjectId]);
    const liked = userId
      ? !!(await PodcastInteraction.exists({ episodeId: episode._id, userId, type: "like" }))
      : false;
    const subscribed = userId
      ? !!(await PodcastSubscription.exists({ podcastId: (episode as any).podcastId?._id, userId }))
      : false;

    res.json({
      data: { ...lockEpisode(episode as any, unlocked.has(String(episode._id))), liked, subscribed },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/podcasts/recommended — Phase 1 heuristic (categories from listening history,
 * then most-played). AskMacGyver-ranked recommendations are a deferred upgrade.
 */
router.get("/recommended", authenticateOptional, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const limit = Math.min(Math.max(parseInt(String(req.query.limit || "12"), 10) || 12, 1), 30);
    let categories: string[] = [];
    if (req.user) {
      const plays = await PodcastInteraction.find({ userId: req.user._id, type: "play" })
        .sort({ updatedAt: -1 })
        .limit(40)
        .select("episodeId")
        .lean();
      if (plays.length) {
        const played = await PodcastEpisode.find({ _id: { $in: plays.map((p) => p.episodeId) } })
          .select("category")
          .lean();
        categories = Array.from(new Set(played.map((e) => e.category).filter(Boolean)));
      }
    }
    const base: Record<string, unknown> = { status: "published", moderationState: { $ne: "rejected" } };
    if (categories.length) base.category = { $in: categories };
    let episodes = await PodcastEpisode.find(base)
      .sort({ playCount: -1, publishedAt: -1 })
      .limit(limit)
      .populate("creatorId", "name username profilePicture")
      .populate("podcastId", "title coverUrl category")
      .lean();
    if (!episodes.length && categories.length) {
      episodes = await PodcastEpisode.find({ status: "published", moderationState: { $ne: "rejected" } })
        .sort({ playCount: -1, publishedAt: -1 })
        .limit(limit)
        .populate("creatorId", "name username profilePicture")
        .populate("podcastId", "title coverUrl category")
        .lean();
    }
    const unlocked = await unlockedEpisodeIds(
      req.user ? String(req.user._id) : undefined,
      episodes.map((e) => e._id as mongoose.Types.ObjectId)
    );
    res.json({
      data: episodes.map((e) => lockEpisode(e as any, unlocked.has(String(e._id)))),
      basis: categories.length ? "listening-history" : "popular",
    });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------ creator */

/** POST /api/podcasts/shows — create a show (optional cover upload). */
router.post("/shows", authenticate, podcastCoverUpload, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const title = String(req.body.title || "").trim();
    if (!title) throw new AppError("Title is required", 400);
    const category = String(req.body.category || "").trim();
    if (!CATEGORY_IDS.has(category as any)) throw new AppError("Valid category is required", 400);

    const moderation = moderateEpisodeText({
      title,
      description: String(req.body.description || ""),
      tags: parseTags(req.body.tags),
    });
    if (moderation.state === "flagged") throw new AppError(moderation.reason || "Content rejected", 400);

    const show = await Podcast.create({
      ownerId: req.user!._id,
      title,
      description: String(req.body.description || "").trim() || undefined,
      category,
      tags: parseTags(req.body.tags),
      coverUrl: req.file ? podcastPublicUrl(req.file.filename) : undefined,
      language: String(req.body.language || "en").trim(),
      explicit: req.body.explicit === "1" || req.body.explicit === "true",
    });
    res.status(201).json({ data: show });
  } catch (err) {
    next(err);
  }
});

/** PATCH /api/podcasts/shows/:id — owner edits show metadata. */
router.patch("/shows/:id", authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const show = await Podcast.findById(req.params.id);
    if (!show) throw new AppError("Podcast not found", 404);
    if (String(show.ownerId) !== String(req.user!._id)) throw new AppError("Not your podcast", 403);

    if (typeof req.body.title === "string" && req.body.title.trim()) show.title = req.body.title.trim();
    if (typeof req.body.description === "string") show.description = req.body.description.trim();
    if (typeof req.body.category === "string" && CATEGORY_IDS.has(req.body.category as any)) {
      show.category = req.body.category;
    }
    if (req.body.tags !== undefined) show.tags = parseTags(req.body.tags);
    await show.save();
    res.json({ data: show });
  } catch (err) {
    next(err);
  }
});

/** GET /api/podcasts/me/shows */
router.get("/me/shows", authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const shows = await Podcast.find({ ownerId: req.user!._id, status: { $ne: "removed" } })
      .sort({ createdAt: -1 })
      .lean();
    res.json({ data: shows });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/podcasts/episodes — upload an episode.
 * multipart/form-data: audio (required), cover (optional), podcastId, title, description,
 * tags, isPremium, price, allowDownload, crossPostToTv, adBreaksSeconds, sponsorshipTier, sponsorName.
 */
router.post("/episodes", authenticate, podcastEpisodeUpload, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const files = req.files as Record<string, Express.Multer.File[]> | undefined;
    const audio = files?.audio?.[0];
    if (!audio) throw new AppError("Episode audio file is required", 400);

    const podcastId = String(req.body.podcastId || "").trim();
    if (!mongoose.isValidObjectId(podcastId)) throw new AppError("podcastId is required", 400);
    const show = await Podcast.findById(podcastId);
    if (!show) throw new AppError("Podcast not found", 404);
    if (String(show.ownerId) !== String(req.user!._id)) throw new AppError("Not your podcast", 403);

    const title = String(req.body.title || "").trim();
    if (!title) throw new AppError("Episode title is required", 400);
    const description = String(req.body.description || "").trim();
    const tags = parseTags(req.body.tags);

    const moderation = moderateEpisodeText({ title, description, tags });

    const isPremium = req.body.isPremium === "1" || req.body.isPremium === "true";
    const price = isPremium ? Math.max(0, Number(req.body.price) || 0) : undefined;
    if (isPremium && (!price || price <= 0)) throw new AppError("Premium episodes need a price", 400);

    const adBreaksSeconds = String(req.body.adBreaksSeconds || "")
      .split(",")
      .map((v) => Number(v.trim()))
      .filter((v) => Number.isFinite(v) && v >= 0)
      .slice(0, 12);

    const episode = await PodcastEpisode.create({
      podcastId: show._id,
      creatorId: req.user!._id,
      title,
      description: description || undefined,
      tags,
      category: show.category,
      audioUrl: podcastPublicUrl(audio.filename),
      mimeType: audio.mimetype,
      fileSizeBytes: audio.size,
      coverUrl: files?.cover?.[0] ? podcastPublicUrl(files.cover[0].filename) : show.coverUrl,
      episodeNumber: Number(req.body.episodeNumber) || undefined,
      seasonNumber: Number(req.body.seasonNumber) || undefined,
      moderationState: moderation.state,
      moderationReason: moderation.reason,
      allowDownload: req.body.allowDownload !== "0" && req.body.allowDownload !== "false",
      isPremium,
      price,
      adBreaksSeconds,
      sponsorshipTier: ["gold", "silver", "bronze"].includes(String(req.body.sponsorshipTier))
        ? req.body.sponsorshipTier
        : undefined,
      sponsorName: String(req.body.sponsorName || "").trim() || undefined,
      status: "published",
      publishedAt: new Date(),
    });

    await Podcast.updateOne({ _id: show._id }, { $inc: { episodeCount: 1 } });

    // Processing layer (non-blocking): duration probe, adaptive renditions, HLS.
    processEpisodeInBackground(String(episode._id), path.join(audio.destination, audio.filename));
    void requestTranscript(String(episode._id));

    // Distribution: cross-post to the QwertyTV / social feed as an audio post.
    const crossPost = req.body.crossPostToTv !== "0" && req.body.crossPostToTv !== "false";
    if (crossPost && moderation.state === "approved" && !isPremium) {
      try {
        const tvPost = await TVPost.create({
          creatorId: req.user!._id,
          type: "audio",
          mediaUrls: [episode.audioUrl],
          heading: title,
          caption: description ? description.slice(0, 500) : undefined,
          hashtags: ["QwertyPodcasts", ...tags].slice(0, 10),
          artworkUrl: episode.coverUrl,
          genre: "podcast",
          status: "approved",
        });
        episode.tvPostId = tvPost._id as mongoose.Types.ObjectId;
        await episode.save();
      } catch (e) {
        logger.warn("[podcasts] TV cross-post failed (non-fatal)", { error: e });
      }
    }

    // Engagement: notify subscribers of the new episode.
    void (async () => {
      try {
        const subs = await PodcastSubscription.find({ podcastId: show._id, notify: true })
          .select("userId")
          .limit(2000)
          .lean();
        for (const sub of subs) {
          await sendNotification({
            userId: String(sub.userId),
            type: "podcast_episode",
            message: `New episode: ${title} — ${show.title}`,
            meta: { url: `/qwerty-media/podcasts/${String(episode._id)}`, episodeId: String(episode._id) },
          });
        }
      } catch (e) {
        logger.warn("[podcasts] subscriber notify failed (non-fatal)", { error: e });
      }
    })();

    res.status(201).json({ data: episode });
  } catch (err) {
    next(err);
  }
});

/** DELETE /api/podcasts/episodes/:id — creator removes an episode. */
router.delete("/episodes/:id", authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const episode = await PodcastEpisode.findById(req.params.id);
    if (!episode) throw new AppError("Episode not found", 404);
    if (String(episode.creatorId) !== String(req.user!._id)) throw new AppError("Not your episode", 403);
    episode.status = "removed";
    await episode.save();
    await Podcast.updateOne({ _id: episode.podcastId }, { $inc: { episodeCount: -1 } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/* --------------------------------------------------------------- engagement */

/** POST /api/podcasts/episodes/:id/play — record a play / resume position. */
router.post("/episodes/:id/play", authenticateOptional, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const episode = await PodcastEpisode.findById(req.params.id).select("_id");
    if (!episode) throw new AppError("Episode not found", 404);
    await PodcastEpisode.updateOne({ _id: episode._id }, { $inc: { playCount: 1 } });
    if (req.user) {
      const positionSeconds = Math.max(0, Number(req.body?.positionSeconds) || 0);
      await PodcastInteraction.updateOne(
        { episodeId: episode._id, userId: req.user._id, type: "play" },
        { $set: { positionSeconds } },
        { upsert: true }
      );
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/** POST /api/podcasts/episodes/:id/like — toggle like. */
router.post("/episodes/:id/like", authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const episode = await PodcastEpisode.findById(req.params.id).select("_id likeCount creatorId title");
    if (!episode) throw new AppError("Episode not found", 404);
    const existing = await PodcastInteraction.findOne({
      episodeId: episode._id,
      userId: req.user!._id,
      type: "like",
    });
    if (existing) {
      await existing.deleteOne();
      await PodcastEpisode.updateOne({ _id: episode._id }, { $inc: { likeCount: -1 } });
      res.json({ data: { liked: false, likeCount: Math.max(0, (episode.likeCount || 1) - 1) } });
      return;
    }
    await PodcastInteraction.create({ episodeId: episode._id, userId: req.user!._id, type: "like" });
    await PodcastEpisode.updateOne({ _id: episode._id }, { $inc: { likeCount: 1 } });
    res.json({ data: { liked: true, likeCount: (episode.likeCount || 0) + 1 } });
  } catch (err) {
    next(err);
  }
});

/** GET /api/podcasts/episodes/:id/comments */
router.get("/episodes/:id/comments", async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { page, limit, skip } = parsePaging(req);
    const filter = { episodeId: req.params.id, status: "visible" };
    const [total, comments] = await Promise.all([
      PodcastComment.countDocuments(filter),
      PodcastComment.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("userId", "name username profilePicture")
        .lean(),
    ]);
    res.json({ data: comments, page, limit, total, hasMore: skip + comments.length < total });
  } catch (err) {
    next(err);
  }
});

/** POST /api/podcasts/episodes/:id/comments */
router.post("/episodes/:id/comments", authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const text = String(req.body.text || "").trim();
    if (!text) throw new AppError("Comment text is required", 400);
    const episode = await PodcastEpisode.findById(req.params.id).select("_id creatorId title");
    if (!episode) throw new AppError("Episode not found", 404);

    const comment = await PodcastComment.create({
      episodeId: episode._id,
      userId: req.user!._id,
      text,
      parentId: mongoose.isValidObjectId(req.body.parentId) ? req.body.parentId : undefined,
    });
    await PodcastEpisode.updateOne({ _id: episode._id }, { $inc: { commentCount: 1 } });

    if (String(episode.creatorId) !== String(req.user!._id)) {
      void sendNotification({
        userId: String(episode.creatorId),
        type: "podcast_comment",
        message: `New comment on ${episode.title}`,
        meta: { url: `/qwerty-media/podcasts/${String(episode._id)}` },
      }).catch(() => undefined);
    }

    const populated = await PodcastComment.findById(comment._id)
      .populate("userId", "name username profilePicture")
      .lean();
    res.status(201).json({ data: populated });
  } catch (err) {
    next(err);
  }
});

/** POST /api/podcasts/shows/:id/subscribe — toggle subscription. */
router.post("/shows/:id/subscribe", authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const show = await Podcast.findById(req.params.id).select("_id subscriberCount");
    if (!show) throw new AppError("Podcast not found", 404);
    const existing = await PodcastSubscription.findOne({ podcastId: show._id, userId: req.user!._id });
    if (existing) {
      await existing.deleteOne();
      await Podcast.updateOne({ _id: show._id }, { $inc: { subscriberCount: -1 } });
      res.json({ data: { subscribed: false } });
      return;
    }
    await PodcastSubscription.create({ podcastId: show._id, userId: req.user!._id, notify: true });
    await Podcast.updateOne({ _id: show._id }, { $inc: { subscriberCount: 1 } });
    res.json({ data: { subscribed: true } });
  } catch (err) {
    next(err);
  }
});

/** GET /api/podcasts/me/subscriptions */
router.get("/me/subscriptions", authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const subs = await PodcastSubscription.find({ userId: req.user!._id })
      .sort({ createdAt: -1 })
      .populate("podcastId", "title coverUrl category episodeCount subscriberCount")
      .lean();
    res.json({ data: subs.filter((s) => s.podcastId).map((s) => s.podcastId) });
  } catch (err) {
    next(err);
  }
});

/* -------------------------------------------------------------- monetization */

/**
 * POST /api/podcasts/episodes/:id/unlock — buy a premium episode with the ACBPay Wallet.
 * Blocked on iOS (Guideline 3.1.1 would require In-App Purchase).
 */
router.post("/episodes/:id/unlock", authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (isIosClient(req)) {
      throw new AppError("Premium episode purchases are not available in the iOS app.", 403);
    }
    const episode = await PodcastEpisode.findById(req.params.id).select("_id isPremium price creatorId title");
    if (!episode) throw new AppError("Episode not found", 404);
    if (!episode.isPremium) throw new AppError("Episode is free", 400);
    const price = Number(episode.price || 0);
    if (price <= 0) throw new AppError("Episode price is not set", 400);

    const already = await PodcastPurchase.findOne({ episodeId: episode._id, userId: req.user!._id });
    if (already) {
      res.json({ data: { unlocked: true, alreadyOwned: true } });
      return;
    }

    const wallet = await Wallet.findOne({ user: req.user!._id });
    if (!wallet) throw new AppError("Wallet not found. Top up your ACBPay Wallet first.", 400);
    if (wallet.balance < price) throw new AppError("Insufficient wallet balance", 400);

    const reference = `podcast-${String(episode._id)}-${String(req.user!._id)}`;
    wallet.balance -= price;
    wallet.transactions.push({ type: "debit", amount: -price, reference, createdAt: new Date() });
    await wallet.save();
    await onWalletSaved(wallet);

    await PodcastPurchase.create({
      episodeId: episode._id,
      userId: req.user!._id,
      amount: price,
      reference,
      platform: String(req.body?.platform || "web").toLowerCase() === "android" ? "android" : "web",
    });

    void sendNotification({
      userId: String(episode.creatorId),
      type: "podcast_purchase",
      message: `Someone unlocked your premium episode: ${episode.title}`,
    }).catch(() => undefined);

    res.json({ data: { unlocked: true, amount: price } });
  } catch (err) {
    next(err);
  }
});

export default router;
