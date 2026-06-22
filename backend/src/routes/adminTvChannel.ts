import path from "path";
import express, { Response } from "express";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import mongoose from "mongoose";
import TvChannelProgram from "../data/models/TvChannelProgram";
import TvChannelState, { TV_CHANNEL_STATE_ID } from "../data/models/TvChannelState";
import { tvChannelVideoUpload } from "../middleware/tvChannelUpload";
import { AuthRequest } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import AuditLog from "../data/models/AuditLog";
import {
  advanceToNext,
  getChannelNowPayload,
  pauseChannel,
  playChannel,
  seekCurrent,
} from "../services/tvChannelRuntime";

const router = express.Router();
const execFileAsync = promisify(execFile);

function mediaUrl(filename: string) {
  return `/uploads/tv-channel/${filename}`;
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
    return Math.round(duration);
  } catch {
    return null;
  }
}

router.get("/tv-channel/programs", async (req: AuthRequest, res: Response, next) => {
  try {
    const list = await TvChannelProgram.find().sort({ sortOrder: 1, createdAt: 1 }).lean();
    res.json({ data: list });
  } catch (err) {
    next(err);
  }
});

router.get("/tv-channel/now", async (req: AuthRequest, res: Response, next) => {
  try {
    const data = await getChannelNowPayload();
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

router.post(
  "/tv-channel/upload",
  (req: AuthRequest, res: Response, next) => {
    tvChannelVideoUpload.single("video")(req, res, (err) => {
      if (err) return next(new AppError(err.message || "Upload failed", 400));
      next();
    });
  },
  async (req: AuthRequest, res: Response, next) => {
    try {
      const file = (req as any).file as Express.Multer.File | undefined;
      if (!file) throw new AppError("No video file", 400);
      const title = String(req.body?.title || "").trim() || path.parse(file.originalname || "Programme").name;
      const description = String(req.body?.description || "").trim() || undefined;
      const genre = String(req.body?.genre || "").trim() || undefined;
      const sortOrder = Number(req.body?.sortOrder);
      const scheduledStart = req.body?.scheduledStart ? new Date(String(req.body.scheduledStart)) : undefined;
      const scheduledEnd = req.body?.scheduledEnd ? new Date(String(req.body.scheduledEnd)) : undefined;
      const scheduleModeRaw = String(req.body?.scheduleMode || "queue").trim().toLowerCase();
      const scheduleMode = scheduleModeRaw === "fixed" ? "fixed" : "queue";
      if (scheduleMode === "fixed") {
        if (!scheduledStart || Number.isNaN(scheduledStart.getTime())) {
          throw new AppError("Fixed schedule requires scheduledStart", 400);
        }
      }
      let durationSeconds = Number(req.body?.durationSeconds);
      if (!Number.isFinite(durationSeconds) || durationSeconds < 1) {
        const probed = await probeVideoDurationSeconds(file.path);
        durationSeconds = probed ?? 3600;
      }
      durationSeconds = Math.min(Math.max(1, Math.round(durationSeconds)), 86400 * 4);

      const maxOrder = await TvChannelProgram.findOne().sort({ sortOrder: -1 }).select("sortOrder").lean();
      const nextOrder = Number.isFinite(sortOrder) ? sortOrder : (maxOrder?.sortOrder ?? 0) + 1;

      const videoUrl = mediaUrl(file.filename);
      const doc = await TvChannelProgram.create({
        title,
        description,
        videoUrl,
        durationSeconds,
        genre,
        sortOrder: nextOrder,
        scheduleMode,
        scheduledStart: scheduledStart && !Number.isNaN(scheduledStart.getTime()) ? scheduledStart : undefined,
        scheduledEnd: scheduledEnd && !Number.isNaN(scheduledEnd.getTime()) ? scheduledEnd : undefined,
        createdBy: req.user!._id,
      });
      await AuditLog.create({
        action: "TV_CHANNEL_PROGRAM_UPLOAD",
        user: req.user!._id,
        target: doc._id,
        meta: { title: doc.title },
      });
      res.status(201).json({ data: doc });
    } catch (err) {
      next(err);
    }
  }
);

router.patch("/tv-channel/programs/:id", async (req: AuthRequest, res: Response, next) => {
  try {
    const id = req.params.id;
    if (!mongoose.isValidObjectId(id)) throw new AppError("Invalid id", 400);
    const program = await TvChannelProgram.findById(id);
    if (!program) throw new AppError("Not found", 404);
    const body = req.body || {};
    if (typeof body.title === "string") program.title = body.title.trim() || program.title;
    if (typeof body.description === "string") program.description = body.description.trim();
    if (typeof body.genre === "string") program.genre = body.genre.trim();
    if (body.enabled === true || body.enabled === false) program.enabled = body.enabled;
    if (typeof body.sortOrder === "number" && Number.isFinite(body.sortOrder)) program.sortOrder = body.sortOrder;
    if (typeof body.durationSeconds === "number" && body.durationSeconds >= 1) {
      program.durationSeconds = Math.min(Math.round(body.durationSeconds), 86400 * 4);
    }
    if (body.scheduledStart === null) program.scheduledStart = undefined;
    else if (typeof body.scheduledStart === "string") {
      const d = new Date(body.scheduledStart);
      if (!Number.isNaN(d.getTime())) program.scheduledStart = d;
    }
    if (body.scheduledEnd === null) program.scheduledEnd = undefined;
    else if (typeof body.scheduledEnd === "string") {
      const d = new Date(body.scheduledEnd);
      if (!Number.isNaN(d.getTime())) program.scheduledEnd = d;
    }
    if (body.scheduleMode === "queue" || body.scheduleMode === "fixed") {
      program.scheduleMode = body.scheduleMode;
    }
    if (program.scheduleMode === "fixed") {
      if (!program.scheduledStart) {
        throw new AppError("Fixed schedule requires scheduledStart", 400);
      }
    }
    await program.save();
    res.json({ data: program });
  } catch (err) {
    next(err);
  }
});

router.delete("/tv-channel/programs/:id", async (req: AuthRequest, res: Response, next) => {
  try {
    const id = req.params.id;
    if (!mongoose.isValidObjectId(id)) throw new AppError("Invalid id", 400);
    const program = await TvChannelProgram.findById(id);
    if (!program) throw new AppError("Not found", 404);
    const state = await TvChannelState.findById(TV_CHANNEL_STATE_ID).lean();
    if (state?.currentProgramId && String(state.currentProgramId) === id) {
      await advanceToNext("skip");
    }
    await program.deleteOne();
    await AuditLog.create({
      action: "TV_CHANNEL_PROGRAM_DELETED",
      user: req.user!._id,
      target: program._id,
      meta: { title: program.title },
    });
    res.json({ message: "Deleted" });
  } catch (err) {
    next(err);
  }
});

router.post("/tv-channel/reorder", async (req: AuthRequest, res: Response, next) => {
  try {
    const ids = Array.isArray(req.body?.orderedIds) ? req.body.orderedIds.map((x: unknown) => String(x || "").trim()) : [];
    if (!ids.length) throw new AppError("orderedIds required", 400);
    let order = 0;
    for (const raw of ids) {
      if (!mongoose.isValidObjectId(raw)) continue;
      await TvChannelProgram.updateOne({ _id: raw }, { $set: { sortOrder: order } });
      order += 1;
    }
    const list = await TvChannelProgram.find().sort({ sortOrder: 1, createdAt: 1 }).lean();
    res.json({ data: list });
  } catch (err) {
    next(err);
  }
});

router.post("/tv-channel/controls/play", async (req: AuthRequest, res: Response, next) => {
  try {
    await playChannel();
    const data = await getChannelNowPayload();
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

router.post("/tv-channel/controls/pause", async (req: AuthRequest, res: Response, next) => {
  try {
    await pauseChannel();
    const data = await getChannelNowPayload();
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

router.post("/tv-channel/controls/skip", async (req: AuthRequest, res: Response, next) => {
  try {
    await advanceToNext("skip");
    const data = await getChannelNowPayload();
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

router.post("/tv-channel/controls/seek", async (req: AuthRequest, res: Response, next) => {
  try {
    const positionMs = Number(req.body?.positionMs);
    if (!Number.isFinite(positionMs)) throw new AppError("positionMs required", 400);
    await seekCurrent(positionMs);
    const data = await getChannelNowPayload();
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

router.post("/tv-channel/controls/start-program", async (req: AuthRequest, res: Response, next) => {
  try {
    const programId = String(req.body?.programId || "").trim();
    if (!mongoose.isValidObjectId(programId)) throw new AppError("programId required", 400);
    await TvChannelState.updateOne(
      { _id: TV_CHANNEL_STATE_ID },
      {
        $set: {
          currentProgramId: new mongoose.Types.ObjectId(programId),
          isPaused: false,
          anchorWallTime: new Date(),
          anchorElapsedMs: 0,
        },
      },
      { upsert: true }
    );
    const data = await getChannelNowPayload();
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

export default router;
