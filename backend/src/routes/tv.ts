import express, { Response } from "express";
import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import multer from "multer";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import TVPost from "../data/models/TVPost";
import TVComment from "../data/models/TVComment";
import ResellerWall from "../data/models/ResellerWall";
import TVInteraction from "../data/models/TVInteraction";
import TVReport from "../data/models/TVReport";
import Product from "../data/models/Product";
import Song from "../data/models/Song";
import { authenticate, authenticateOptional, AuthRequest } from "../middleware/auth";
import { tvUploadSingle, tvUploadMultiple } from "../middleware/tvUpload";
import { AppError } from "../middleware/errorHandler";
import { TV_WATERMARK } from "../data/models/TVPost";
import { moderateMedia } from "../services/contentModeration";
import AuditLog from "../data/models/AuditLog";

const router = express.Router();
const execFileAsync = promisify(execFile);
const QWERTZ_MAX_DURATION_SECONDS = 180;

const commentAudioStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, path.join(__dirname, "../../uploads/tv")),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname || "") || ".m4a";
    cb(null, `tv-comment-audio-${unique}${ext}`);
  },
});

const commentAudioUpload = multer({
  storage: commentAudioStorage,
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "audio/mpeg",
      "audio/mp3",
      "audio/wav",
      "audio/x-wav",
      "audio/webm",
      "audio/ogg",
      "audio/mp4",
      "audio/aac",
      "audio/x-m4a",
    ];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new AppError("Invalid audio format for voice note", 400));
  },
  limits: { fileSize: 20 * 1024 * 1024 },
});

function mediaUrl(filename: string) {
  return `/uploads/tv/${filename}`;
}

function resolveUploadedTvFilePath(url: string): string | null {
  if (!url) return null;
  const normalized = String(url).trim();
  let mediaPath = normalized;
  if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
    try {
      mediaPath = new URL(normalized).pathname;
    } catch {
      return null;
    }
  }
  if (!mediaPath.startsWith("/uploads/tv/")) return null;
  const fileName = path.basename(mediaPath);
  return path.join(__dirname, "../../uploads/tv", fileName);
}

async function probeVideoDurationSeconds(filePath: string): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath,
    ]);
    const duration = Number(String(stdout || "").trim());
    if (!Number.isFinite(duration) || duration <= 0) return null;
    return duration;
  } catch {
    return null;
  }
}

// GET /api/tv/statuses - Instagram-style statuses: users with recent posts (last 24h) + live users
router.get("/statuses", async (req: express.Request, res: Response, next) => {
  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const User = require("../data/models/User").default;
    const [agg, liveUsers] = await Promise.all([
      TVPost.aggregate([
        { $match: { status: "approved", createdAt: { $gte: cutoff } } },
        { $sort: { createdAt: -1 } },
        { $group: { _id: "$creatorId", latestPost: { $first: "$$ROOT" } } },
        {
          $lookup: {
            from: "users",
            localField: "_id",
            foreignField: "_id",
            as: "user",
            pipeline: [{ $project: { name: 1, avatar: 1, isLive: 1 } }],
          },
        },
        { $unwind: "$user" },
        { $sort: { "latestPost.createdAt": -1 } },
        { $limit: 50 },
      ]),
      User.find({ isLive: true }).select("_id name avatar isLive").lean(),
    ]);
    const seen = new Set<string>();
    const statuses: any[] = [];
    for (const u of liveUsers) {
      const id = (u as any)._id.toString();
      if (!seen.has(id)) {
        seen.add(id);
        statuses.push({
          userId: (u as any)._id,
          name: (u as any).name,
          avatar: (u as any).avatar,
          isLive: true,
          latestPost: null,
        });
      }
    }
    for (const s of agg) {
      const id = s._id.toString();
      if (!seen.has(id)) {
        seen.add(id);
        statuses.push({
          userId: s._id,
          name: s.user?.name,
          avatar: s.user?.avatar,
          isLive: !!s.user?.isLive,
          latestPost: s.latestPost
            ? { _id: s.latestPost._id, type: s.latestPost.type, mediaUrls: s.latestPost.mediaUrls, createdAt: s.latestPost.createdAt }
            : null,
        });
      }
    }
    res.json({ data: statuses });
  } catch (err) {
    next(err);
  }
});

// GET /api/tv/hashtags/trending - list trending hashtags with post counts
router.get("/hashtags/trending", async (_req: express.Request, res: Response, next) => {
  try {
    const limit = Math.min(20, parseInt((_req as any).query?.limit as string) || 10);
    const agg = await TVPost.aggregate([
      { $match: { status: "approved", hashtags: { $exists: true, $ne: [] } } },
      { $unwind: "$hashtags" },
      { $group: { _id: { $toLower: "$hashtags" }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: limit },
      { $project: { tag: "$_id", count: 1, _id: 0 } },
    ]);
    res.json({ data: agg });
  } catch (err) {
    next(err);
  }
});

// GET /api/tv - list posts (feed, scroll). sort=newest|trending|random, type=video|image|carousel|product
router.get("/", authenticateOptional, async (req: AuthRequest, res: Response, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, parseInt(req.query.limit as string) || 20);
    const sort = (req.query.sort as string) || "newest";
    const type = req.query.type as string; // optional: video, image, carousel, product

    const match: Record<string, unknown> = { status: "approved" };

    // Respect content preferences: hide product posts when user opted out
    const hideProducts =
      (req.user && (req.user as any).contentPreferences?.showProducts === false) ||
      req.query.hideProducts === "1" ||
      req.query.hideProducts === "true";
    if (type) {
      if (type === "images") {
        (match as any).type = { $in: ["image", "carousel"] };
      } else if (["video", "image", "carousel", "product", "audio", "text"].includes(type)) {
        match.type = type;
      }
    }
    if (hideProducts) {
      if (type === "product") {
        return res.json({ data: [], total: 0, page: 1, limit });
      }
      if (!(match as any).type) {
        (match as any).type = { $ne: "product" };
      }
    }
    const genreParam = (req.query.genre as string)?.trim();
    if (genreParam && genreParam !== "qwertz") {
      (match as any).genre = genreParam;
    }
    const qRaw = (req.query.q as string)?.trim();
    const q = qRaw?.replace(/^#/, "") ?? "";
    if (q && q.length >= 2) {
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      (match as any).$or = [
        { caption: { $regex: escaped, $options: "i" } },
        { hashtags: new RegExp(`^${escaped}$`, "i") },
      ];
    }
    const creatorId = req.query.creatorId as string;
    if (creatorId && mongoose.Types.ObjectId.isValid(creatorId)) {
      match.creatorId = new mongoose.Types.ObjectId(creatorId);
    }

    let query = TVPost.find(match)
      .populate("creatorId", "name avatar")
      .populate({ path: "productId", populate: { path: "supplierId", select: "userId" } })
      .populate("songId", "title artist artworkUrl downloadEnabled downloadPrice");

    if (sort === "trending") {
      query = query.sort({ likeCount: -1, commentCount: -1, createdAt: -1 });
    } else if (sort === "random") {
      const posts = await TVPost.aggregate([
        { $match: match },
        { $sample: { size: limit } },
        {
          $lookup: {
            from: "users",
            localField: "creatorId",
            foreignField: "_id",
            as: "creatorId",
            pipeline: [{ $project: { name: 1, avatar: 1 } }],
          },
        },
        { $unwind: { path: "$creatorId", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "products",
            localField: "productId",
            foreignField: "_id",
            as: "productId",
            pipeline: [
              { $project: { title: 1, description: 1, price: 1, discountPrice: 1, images: 1, currency: 1, supplierId: 1 } },
              {
                $lookup: {
                  from: "suppliers",
                  localField: "supplierId",
                  foreignField: "_id",
                  as: "supplierId",
                  pipeline: [{ $project: { userId: 1 } }],
                },
              },
              { $unwind: { path: "$supplierId", preserveNullAndEmptyArrays: true } },
            ],
          },
        },
        { $unwind: { path: "$productId", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "songs",
            localField: "songId",
            foreignField: "_id",
            as: "songId",
            pipeline: [{ $project: { title: 1, artist: 1, artworkUrl: 1, downloadEnabled: 1, downloadPrice: 1 } }],
          },
        },
        { $unwind: { path: "$songId", preserveNullAndEmptyArrays: true } },
      ]);
      // Enrich audio posts missing artwork: lookup Song by audioUrl
      let enriched = await Promise.all(
        posts.map(async (p: any) => {
          if (p.type !== "audio" || (p.artworkUrl || (p.songId && p.songId.artworkUrl))) return p;
          const audioUrl = p.mediaUrls?.[0];
          if (!audioUrl) return p;
          const song = await Song.findOne({ audioUrl }).select("_id artworkUrl title artist downloadEnabled downloadPrice").lean();
          if (song) return { ...p, artworkUrl: song.artworkUrl, songId: p.songId || song };
          return p;
        })
      );
      // Enrich product posts: attach resellerCommissionPct when post has productId + creatorId
      const productIdsRandom = enriched
        .filter((p: any) => p.productId)
        .map((p: any) => ({ post: p, productId: (p.productId as any)?._id?.toString?.() ?? p.productId?.toString?.(), creatorId: (p.creatorId as any)?._id?.toString?.() ?? p.creatorId?.toString?.() }))
        .filter((x) => x.productId && x.creatorId);
      if (productIdsRandom.length > 0) {
        const walls = await ResellerWall.find({ resellerId: { $in: [...new Set(productIdsRandom.map((x) => x.creatorId))] } }).lean();
        const wallMap = new Map(walls.map((w: any) => [w.resellerId?.toString(), w]));
        for (const { post, productId, creatorId } of productIdsRandom) {
          const wall = wallMap.get(creatorId);
          const wp = (wall?.products as any[])?.find((p) => (p.productId as any)?.toString?.() === productId);
          if (wp?.resellerCommissionPct != null) (post as any).resellerCommissionPct = wp.resellerCommissionPct;
        }
      }
      const total = await TVPost.countDocuments(match);
      return res.json({ data: enriched, total, page: 1, limit });
    }

    const skip = (page - 1) * limit;
    let posts = await query.sort({ createdAt: -1 }).skip(skip).limit(limit).lean();
    // Enrich audio posts: if missing artworkUrl, try to find Song by matching audioUrl
    posts = await Promise.all(
      posts.map(async (p: any) => {
        if (p.type !== "audio" || (p.artworkUrl || (p.songId && p.songId.artworkUrl))) return p;
        const audioUrl = p.mediaUrls?.[0];
        if (!audioUrl || typeof audioUrl !== "string") return p;
        const song = await Song.findOne({ audioUrl }).select("_id artworkUrl title artist downloadEnabled downloadPrice").lean();
        if (song) {
          return { ...p, artworkUrl: p.artworkUrl || song.artworkUrl, songId: p.songId || song };
        }
        return p;
      })
    );
    // Enrich product posts: attach resellerCommissionPct when post has productId + creatorId (reseller wall)
    const productIds = posts
      .filter((p: any) => p.productId)
      .map((p: any) => ({ post: p, productId: (p.productId as any)?._id?.toString?.() ?? p.productId?.toString?.(), creatorId: (p.creatorId as any)?._id?.toString?.() ?? p.creatorId?.toString?.() }))
      .filter((x) => x.productId && x.creatorId);
    if (productIds.length > 0) {
      const walls = await ResellerWall.find({ resellerId: { $in: [...new Set(productIds.map((x) => x.creatorId))] } }).lean();
      const wallMap = new Map(walls.map((w: any) => [w.resellerId?.toString(), w]));
      for (const { post, productId, creatorId } of productIds) {
        const wall = wallMap.get(creatorId);
        const wp = (wall?.products as any[])?.find((p) => (p.productId as any)?.toString?.() === productId);
        if (wp?.resellerCommissionPct != null) {
          (post as any).resellerCommissionPct = wp.resellerCommissionPct;
        }
      }
    }
    const total = await TVPost.countDocuments(match);
    res.json({ data: posts, total, page, limit });
  } catch (err) {
    next(err);
  }
});

// POST /api/tv/upload - upload video or image (auto-moderation if API configured)
router.post("/upload", authenticate, tvUploadSingle.single("media"), async (req: AuthRequest, res: Response, next) => {
  try {
    if (!req.file) throw new AppError("No file uploaded", 400);
    const filePath =
      (req.file as Express.Multer.File & { path?: string }).path ??
      path.join(req.file.destination ?? path.join(__dirname, "../../uploads/tv"), req.file.filename);
    const result = await moderateMedia(filePath, req.file.mimetype);
    if (!result.safe) {
      try {
        fs.unlinkSync(filePath);
      } catch (e) {
        /* ignore */
      }
      await AuditLog.create({
        action: "CONTENT_MODERATION_BLOCKED",
        user: req.user!._id,
        meta: {
          fileName: req.file.originalname,
          mimeType: req.file.mimetype,
          reason: result.reason,
          categories: result.categories,
        },
      });
      throw new AppError(result.reason || "Content violates community guidelines", 400);
    }
    const url = mediaUrl(req.file.filename);
    res.json({ url, sensitive: result.sensitive ?? false });
  } catch (err) {
    next(err);
  }
});

// POST /api/tv/upload-images - upload multiple images (carousel, auto-moderation)
router.post("/upload-images", authenticate, tvUploadMultiple.array("images", 20), async (req: AuthRequest, res: Response, next) => {
  try {
    const files = (req as any).files as Express.Multer.File[];
    if (!files?.length) throw new AppError("No images uploaded", 400);
    const uploadDir = path.join(__dirname, "../../uploads/tv");
    let anySensitive = false;
    for (const f of files) {
      const filePath = (f as any).path || path.join(uploadDir, f.filename);
      const result = await moderateMedia(filePath, f.mimetype);
      if (!result.safe) {
        files.forEach((file) => {
          try {
            fs.unlinkSync(path.join(uploadDir, file.filename));
          } catch (e) {
            /* ignore */
          }
        });
        await AuditLog.create({
          action: "CONTENT_MODERATION_BLOCKED",
          user: req.user!._id,
          meta: {
            fileName: f.originalname,
            mimeType: f.mimetype,
            reason: result.reason,
            categories: result.categories,
          },
        });
        throw new AppError(result.reason || "Content violates community guidelines", 400);
      }
      if (result.sensitive) anySensitive = true;
    }
    const urls = files.map((f) => mediaUrl(f.filename));
    res.json({ urls, sensitive: anySensitive });
  } catch (err) {
    next(err);
  }
});

// POST /api/tv/comments/upload-audio - upload voice note for comments
router.post("/comments/upload-audio", authenticate, commentAudioUpload.single("audio"), async (req: AuthRequest, res: Response, next) => {
  try {
    if (!req.file) throw new AppError("No audio uploaded", 400);
    const url = mediaUrl(req.file.filename);
    res.json({ data: { url } });
  } catch (err) {
    next(err);
  }
});

// GET /api/tv/watermark - must be before /:id
router.get("/watermark", (_req, res) => {
  res.json({ data: { watermark: TV_WATERMARK } });
});

// GET /api/tv/products/featured - must be before /:id
router.get("/products/featured", authenticateOptional, async (req: AuthRequest, res: Response, next) => {
  try {
    const hideProducts =
      (req.user && (req.user as any).contentPreferences?.showProducts === false) ||
      req.query.hideProducts === "1" ||
      req.query.hideProducts === "true";
    if (hideProducts) {
      return res.json({ data: [] });
    }
    const products = await Product.find({ active: true })
      .select("title description price discountPrice images currency slug allowResell")
      .populate("supplierId", "userId")
      .limit(12)
      .lean();
    res.json({ data: products });
  } catch (err) {
    next(err);
  }
});

// POST /api/tv - create post
router.post("/", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const { type, mediaUrls, caption, heading, subject, hashtags, productId, filter, genre, artworkUrl, songId, sensitive } = req.body;
    if (!type) throw new AppError("type required", 400);
    if (!["video", "image", "carousel", "product", "text", "audio"].includes(type)) throw new AppError("Invalid type", 400);
    const isTextPost = type === "text";
    const isAudioPost = type === "audio";
    const isQwertzVideo = type === "video" && String(genre || "").trim().toLowerCase() === "qwertz";
    if (isAudioPost && !mediaUrls?.length) throw new AppError("mediaUrls required for audio posts", 400);
    if (!isTextPost && !isAudioPost && !mediaUrls?.length) throw new AppError("mediaUrls required for non-text posts", 400);
    if (isQwertzVideo) {
      const urls = Array.isArray(mediaUrls) ? mediaUrls : [mediaUrls];
      const first = urls[0];
      if (!first) throw new AppError("Qwertz video is required", 400);
      const localPath = resolveUploadedTvFilePath(first);
      if (!localPath || !fs.existsSync(localPath)) {
        throw new AppError("Unable to verify Qwertz video duration on server", 400);
      }
      const seconds = await probeVideoDurationSeconds(localPath);
      if (!seconds) {
        throw new AppError("Could not read Qwertz video duration", 400);
      }
      if (seconds > QWERTZ_MAX_DURATION_SECONDS) {
        throw new AppError("Qwertz videos must be 3 minutes or less", 400);
      }
    }

    const post = await TVPost.create({
      creatorId: req.user!._id,
      type,
      mediaUrls: isTextPost ? [] : (Array.isArray(mediaUrls) ? mediaUrls : [mediaUrls]),
      caption: caption?.trim(),
      heading: heading?.trim(),
      subject: isTextPost ? subject?.trim() : undefined,
      hashtags: isTextPost && Array.isArray(hashtags) ? hashtags.filter((t: string) => typeof t === "string" && t.trim()).map((t: string) => t.trim().replace(/^#/, "")) : undefined,
      productId: productId || undefined,
      artworkUrl: isAudioPost && artworkUrl ? String(artworkUrl).trim() : undefined,
      songId: isAudioPost && songId ? songId : undefined,
      filter: filter || undefined,
      genre: genre || undefined,
      hasWatermark: true,
      status: "approved",
      sensitive: !!sensitive,
    });
    const populated = await TVPost.findById(post._id)
      .populate("creatorId", "name avatar")
      .populate("productId", "title description price discountPrice images currency allowResell")
      .populate("songId", "title artist artworkUrl downloadEnabled downloadPrice")
      .lean();
    res.status(201).json({ data: populated });
  } catch (err) {
    next(err);
  }
});

// POST /api/tv/:id/repost
router.post("/:id/repost", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const original = await TVPost.findById(req.params.id);
    if (!original || original.status !== "approved") throw new AppError("Post not found", 404);

    const repost = await TVPost.create({
      creatorId: req.user!._id,
      type: original.type,
      mediaUrls: original.mediaUrls,
      caption: original.caption,
      heading: original.heading,
      subject: original.subject,
      hashtags: original.hashtags,
      productId: original.productId,
      artworkUrl: (original as any).artworkUrl,
      songId: (original as any).songId,
      filter: original.filter,
      hasWatermark: true,
      originalPostId: original._id,
      repostedBy: req.user!._id,
      status: "approved",
      sensitive: (original as any).sensitive,
    });
    await TVPost.findByIdAndUpdate(original._id, { $inc: { shareCount: 1 } });
    await TVInteraction.create({ postId: original._id, userId: req.user!._id, type: "repost", repostId: repost._id });

    const populated = await TVPost.findById(repost._id)
      .populate("creatorId", "name avatar")
      .populate("productId", "title description price discountPrice images currency allowResell")
      .populate("originalPostId", "creatorId")
      .lean();
    res.status(201).json({ data: populated });
  } catch (err) {
    next(err);
  }
});

// POST /api/tv/:id/like
router.post("/:id/like", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const post = await TVPost.findById(req.params.id);
    if (!post) throw new AppError("Post not found", 404);

    const existing = await TVInteraction.findOne({ postId: post._id, userId: req.user!._id, type: "like" });
    if (existing) {
      await TVInteraction.deleteOne({ _id: existing._id });
      await TVPost.findByIdAndUpdate(post._id, { $inc: { likeCount: -1 } });
      return res.json({ data: { liked: false, likeCount: post.likeCount - 1 } });
    }
    await TVInteraction.create({ postId: post._id, userId: req.user!._id, type: "like" });
    await TVPost.findByIdAndUpdate(post._id, { $inc: { likeCount: 1 } });
    res.json({ data: { liked: true, likeCount: post.likeCount + 1 } });
  } catch (err) {
    next(err);
  }
});

// GET /api/tv/:id/liked
router.get("/:id/liked", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const liked = await TVInteraction.findOne({ postId: req.params.id, userId: req.user!._id, type: "like" });
    res.json({ data: { liked: !!liked } });
  } catch (err) {
    next(err);
  }
});

// POST /api/tv/:id/report
router.post("/:id/report", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const { reason } = req.body;
    if (!reason?.trim()) throw new AppError("reason required", 400);
    const post = await TVPost.findById(req.params.id);
    if (!post) throw new AppError("Post not found", 404);

    await TVReport.create({
      reporterId: req.user!._id,
      targetType: "post",
      targetId: post._id,
      reason: reason.trim().substring(0, 500),
    });
    res.json({ message: "Report submitted" });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/tv/:id - delete own post (creator only)
router.delete("/:id", authenticate, async (req: AuthRequest, res: Response, next: express.NextFunction) => {
  try {
    const post = await TVPost.findById(req.params.id);
    if (!post) throw new AppError("Post not found", 404);
    const creatorId = typeof post.creatorId === "object" ? (post.creatorId as any)?._id : post.creatorId;
    if (String(creatorId) !== String(req.user!._id)) throw new AppError("You can only delete your own posts", 403);
    await TVPost.deleteOne({ _id: post._id });
    res.json({ message: "Post deleted" });
  } catch (err) {
    next(err);
  }
});

// GET /api/tv/:id/comments
router.get("/:id/comments", async (req: express.Request, res: Response, next) => {
  try {
    const comments = await TVComment.find({ postId: req.params.id, status: "visible" })
      .populate("userId", "name avatar")
      .sort({ createdAt: 1 })
      .lean();
    res.json({ data: comments });
  } catch (err) {
    next(err);
  }
});

// POST /api/tv/:id/comments
router.post("/:id/comments", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const rawText = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    const audioUrl = typeof req.body?.audioUrl === "string" ? req.body.audioUrl.trim() : "";
    if (!rawText && !audioUrl) throw new AppError("text or audioUrl is required", 400);
    const post = await TVPost.findById(req.params.id);
    if (!post) throw new AppError("Post not found", 404);

    const comment = await TVComment.create({
      postId: post._id,
      userId: req.user!._id,
      text: rawText ? rawText.substring(0, 1000) : undefined,
      audioUrl: audioUrl || undefined,
    });
    await TVPost.findByIdAndUpdate(post._id, { $inc: { commentCount: 1 } });
    const populated = await TVComment.findById(comment._id).populate("userId", "name avatar").lean();
    res.status(201).json({ data: populated });
  } catch (err) {
    next(err);
  }
});

// GET /api/tv/:id - single post (for share links) - must be after /:id/liked, /:id/comments, etc.
router.get("/:id", async (req: express.Request, res: Response, next) => {
  try {
    let post = await TVPost.findOne({ _id: req.params.id, status: "approved" })
      .populate("creatorId", "name avatar")
      .populate({ path: "productId", populate: { path: "supplierId", select: "userId" } })
      .populate("songId", "title artist artworkUrl downloadEnabled downloadPrice")
      .lean();
    if (!post) throw new AppError("Post not found", 404);
    // Enrich audio post: if missing artwork, lookup Song by audioUrl
    if ((post as any).type === "audio" && !(post as any).artworkUrl && !((post as any).songId && (post as any).songId.artworkUrl)) {
      const audioUrl = (post as any).mediaUrls?.[0];
      if (audioUrl) {
        const song = await Song.findOne({ audioUrl }).select("_id artworkUrl title artist downloadEnabled downloadPrice").lean();
        if (song) {
          (post as any).artworkUrl = song.artworkUrl;
          if (!(post as any).songId) (post as any).songId = song;
        }
      }
    }
    // Increment view count for video/carousel posts
    const isVideo = (post as any).type === "video" || ((post as any).type === "carousel" && (post as any).mediaUrls?.[0]?.match(/\.(mp4|webm)$/i));
    if (isVideo) {
      await TVPost.findByIdAndUpdate(req.params.id, { $inc: { viewCount: 1 } });
      (post as any).viewCount = ((post as any).viewCount ?? 0) + 1;
    }
    res.json({ data: post });
  } catch (err) {
    next(err);
  }
});

export default router;
