import express, { Response } from "express";
import fs from "fs";
import path from "path";
import TVPost from "../data/models/TVPost";
import TVComment from "../data/models/TVComment";
import TVInteraction from "../data/models/TVInteraction";
import TVReport from "../data/models/TVReport";
import Product from "../data/models/Product";
import { authenticate, AuthRequest } from "../middleware/auth";
import { tvUploadSingle, tvUploadMultiple } from "../middleware/tvUpload";
import { AppError } from "../middleware/errorHandler";
import { TV_WATERMARK } from "../data/models/TVPost";
import { moderateMedia } from "../services/contentModeration";

const router = express.Router();

function mediaUrl(filename: string) {
  return `/uploads/tv/${filename}`;
}

// GET /api/tv - list posts (feed, scroll). sort=newest|trending|random, type=video|image|carousel|product
router.get("/", async (req: express.Request, res: Response, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, parseInt(req.query.limit as string) || 20);
    const sort = (req.query.sort as string) || "newest";
    const type = req.query.type as string; // optional: video, image, carousel, product

    const match: Record<string, unknown> = { status: "approved" };
    if (type && ["video", "image", "carousel", "product"].includes(type)) {
      match.type = type;
    }

    let query = TVPost.find(match)
      .populate("creatorId", "name avatar")
      .populate({ path: "productId", populate: { path: "supplierId", select: "userId" } });

    if (sort === "trending") {
      query = query.sort({ likeCount: -1, commentCount: -1, createdAt: -1 });
    } else if (sort === "random") {
      query = query.aggregate([
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
              { $project: { title: 1, price: 1, discountPrice: 1, images: 1, currency: 1, supplierId: 1 } },
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
      ]);
      const posts = await query;
      const total = await TVPost.countDocuments(match);
      return res.json({ data: posts, total, page: 1, limit });
    }

    const skip = (page - 1) * limit;
    const posts = await query.sort({ createdAt: -1 }).skip(skip).limit(limit).lean();
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
    const filePath = (req.file as any).path || path.join(__dirname, "../../uploads/tv", req.file.filename);
    const result = await moderateMedia(filePath, req.file.mimetype);
    if (!result.safe) {
      try {
        fs.unlinkSync(filePath);
      } catch (e) {
        /* ignore */
      }
      throw new AppError(result.reason || "Content violates community guidelines", 400);
    }
    const url = mediaUrl(req.file.filename);
    res.json({ url });
  } catch (err) {
    next(err);
  }
});

// POST /api/tv/upload-images - upload multiple images (carousel, auto-moderation)
router.post("/upload-images", authenticate, tvUploadMultiple.array("images", 10), async (req: AuthRequest, res: Response, next) => {
  try {
    const files = (req as any).files as Express.Multer.File[];
    if (!files?.length) throw new AppError("No images uploaded", 400);
    const uploadDir = path.join(__dirname, "../../uploads/tv");
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
        throw new AppError(result.reason || "Content violates community guidelines", 400);
      }
    }
    const urls = files.map((f) => mediaUrl(f.filename));
    res.json({ urls });
  } catch (err) {
    next(err);
  }
});

// GET /api/tv/watermark - must be before /:id
router.get("/watermark", (_req, res) => {
  res.json({ data: { watermark: TV_WATERMARK } });
});

// GET /api/tv/products/featured - must be before /:id
router.get("/products/featured", async (_req, res: Response, next) => {
  try {
    const products = await Product.find({ active: true })
      .select("title price discountPrice images currency slug")
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
    const { type, mediaUrls, caption, productId, filter } = req.body;
    if (!type || !mediaUrls?.length) throw new AppError("type and mediaUrls required", 400);
    if (!["video", "image", "carousel", "product"].includes(type)) throw new AppError("Invalid type", 400);

    const post = await TVPost.create({
      creatorId: req.user!._id,
      type,
      mediaUrls: Array.isArray(mediaUrls) ? mediaUrls : [mediaUrls],
      caption: caption?.trim(),
      productId: productId || undefined,
      filter: filter || undefined,
      hasWatermark: true,
      status: "approved",
    });
    const populated = await TVPost.findById(post._id)
      .populate("creatorId", "name avatar")
      .populate("productId", "title price discountPrice images currency")
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
      productId: original.productId,
      filter: original.filter,
      hasWatermark: true,
      originalPostId: original._id,
      repostedBy: req.user!._id,
      status: "approved",
    });
    await TVPost.findByIdAndUpdate(original._id, { $inc: { shareCount: 1 } });
    await TVInteraction.create({ postId: original._id, userId: req.user!._id, type: "repost", repostId: repost._id });

    const populated = await TVPost.findById(repost._id)
      .populate("creatorId", "name avatar")
      .populate("productId", "title price discountPrice images currency")
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
    const { text } = req.body;
    if (!text?.trim()) throw new AppError("text required", 400);
    const post = await TVPost.findById(req.params.id);
    if (!post) throw new AppError("Post not found", 404);

    const comment = await TVComment.create({
      postId: post._id,
      userId: req.user!._id,
      text: text.trim().substring(0, 1000),
    });
    await TVPost.findByIdAndUpdate(post._id, { $inc: { commentCount: 1 } });
    const populated = await TVComment.findById(comment._id).populate("userId", "name avatar").lean();
    res.status(201).json({ data: populated });
  } catch (err) {
    next(err);
  }
});

export default router;
