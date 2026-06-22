import express, { Response } from "express";
import mongoose from "mongoose";
import Song from "../data/models/Song";
import MusicSoundUsage from "../data/models/MusicSoundUsage";
import { AuthRequest } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import type { SoundLibraryStatus } from "../data/models/Song";

const router = express.Router();

const ALLOWED: SoundLibraryStatus[] = ["none", "pending", "approved", "rejected"];

/** GET /admin/music/sound-library/catalog */
router.get("/music/sound-library/catalog", async (req: AuthRequest, res: Response, next) => {
  try {
    const page = Math.max(parseInt(String(req.query.page || "1"), 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(String(req.query.limit || "40"), 10) || 40, 1), 100);
    const skip = (page - 1) * limit;
    const status = String(req.query.status || "all").trim().toLowerCase();
    const q = String(req.query.q || "").trim();
    const filter: Record<string, unknown> = {};
    if (status !== "all" && ALLOWED.includes(status as SoundLibraryStatus)) {
      filter.soundLibraryStatus = status;
    }
    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      (filter as any).$or = [{ title: rx }, { artist: rx }];
    }
    const total = await Song.countDocuments(filter);
    const songs = await Song.find(filter)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("userId", "name email username")
      .lean();
    res.json({ data: songs, page, limit, total, hasMore: skip + songs.length < total });
  } catch (err) {
    next(err);
  }
});

/** PATCH /admin/music/sound-library/songs/:id */
router.patch("/music/sound-library/songs/:id", async (req: AuthRequest, res: Response, next) => {
  try {
    const id = req.params.id;
    if (!mongoose.isValidObjectId(id)) throw new AppError("Invalid song id", 400);
    const song = await Song.findById(id);
    if (!song) throw new AppError("Song not found", 404);
    const bodyStatus = req.body?.soundLibraryStatus as string | undefined;
    if (bodyStatus && !ALLOWED.includes(bodyStatus as SoundLibraryStatus)) {
      throw new AppError("Invalid soundLibraryStatus", 400);
    }
    if (bodyStatus) {
      (song as any).soundLibraryStatus = bodyStatus;
      (song as any).soundLibraryReviewedAt = new Date();
      if (bodyStatus === "rejected") {
        (song as any).soundLibraryRejectedReason =
          typeof req.body?.soundLibraryRejectedReason === "string"
            ? String(req.body.soundLibraryRejectedReason).trim().slice(0, 500)
            : "Not approved";
      } else {
        (song as any).soundLibraryRejectedReason = undefined;
      }
    }
    if (typeof req.body?.soundLibraryNote === "string") {
      (song as any).soundLibraryNote = String(req.body.soundLibraryNote).trim().slice(0, 500);
    }
    await song.save();
    const fresh = await Song.findById(song._id).populate("userId", "name email username").lean();
    res.json({ data: fresh });
  } catch (err) {
    next(err);
  }
});

/** GET /admin/music/sound-library/stats */
router.get("/music/sound-library/stats", async (_req: AuthRequest, res: Response, next) => {
  try {
    const [pending, approved, rejected, none] = await Promise.all([
      Song.countDocuments({ soundLibraryStatus: "pending" }),
      Song.countDocuments({ soundLibraryStatus: "approved" }),
      Song.countDocuments({ soundLibraryStatus: "rejected" }),
      Song.countDocuments({ $or: [{ soundLibraryStatus: "none" }, { soundLibraryStatus: { $exists: false } }] }),
    ]);
    const clipAgg = await MusicSoundUsage.aggregate<{
      _id: mongoose.Types.ObjectId;
      clips: number;
      views: number;
    }>([
      {
        $lookup: {
          from: "tvposts",
          localField: "tvPostId",
          foreignField: "_id",
          as: "post",
        },
      },
      { $unwind: { path: "$post", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: "$songId",
          clips: { $sum: 1 },
          views: { $sum: { $ifNull: ["$post.viewCount", 0] } },
        },
      },
      { $sort: { clips: -1 } },
      { $limit: 25 },
    ]);
    const songIds = clipAgg.map((r) => r._id).filter(Boolean);
    const songRows = await Song.find({ _id: { $in: songIds } })
      .select("title artist artworkUrl soundLibraryStatus")
      .lean();
    const songMap = new Map(songRows.map((s) => [s._id.toString(), s]));
    const topByClips = clipAgg.map((row) => ({
      songId: row._id?.toString?.(),
      clips: row.clips,
      views: row.views,
      song: row._id ? songMap.get(row._id.toString()) : null,
    }));
    res.json({
      data: {
        counts: { pending, approved, rejected, none },
        topByClips,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
