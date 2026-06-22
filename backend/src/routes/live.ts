import express, { Response } from "express";
import mongoose from "mongoose";
import User from "../data/models/User";
import LivestreamPlaybackEvent from "../data/models/LivestreamPlaybackEvent";
import { authenticate, authenticateOptional, AuthRequest } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import {
  buildLivestreamUrls,
  generateLiveStreamName,
  isLivestreamPlaybackConfigured,
  isLivestreamPublishConfigured,
} from "../services/livestream";
import { userShowsLiveBadge } from "./tv";

const router = express.Router();

const METRIC_TYPES = new Set([
  "play_start",
  "heartbeat",
  "buffer_stall",
  "error",
  "fatal_error",
  "ended",
]);

// GET /api/live/config — client checks if streaming is set up
router.get("/config", (_req, res) => {
  res.json({
    data: {
      playbackConfigured: isLivestreamPlaybackConfigured(),
      publishConfigured: isLivestreamPublishConfigured(),
    },
  });
});

// GET /api/live/session — current user’s live session (OBS instructions)
router.get("/session", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const user = await User.findById(req.user!._id).select("isLive liveStreamName liveStartedAt name");
    if (!user) throw new AppError("User not found", 404);
    const streamName = (user as any).liveStreamName as string | undefined;
    const urls = streamName ? buildLivestreamUrls(streamName) : null;
    res.json({
      data: {
        isLive: !!(user as any).isLive,
        liveStreamName: streamName || null,
        liveStartedAt: (user as any).liveStartedAt || null,
        urls,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/live/start — begin broadcast (RTMP + HLS when configured)
router.post("/start", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    if (!isLivestreamPublishConfigured()) {
      throw new AppError(
        "Live streaming publish is not configured. Set LIVESTREAM_HLS_PUBLIC_BASE and LIVESTREAM_RTMP_PUBLIC_HOST on the server.",
        503
      );
    }
    const user = await User.findById(req.user!._id);
    if (!user) throw new AppError("User not found", 404);

    let streamName = (user as any).liveStreamName as string | undefined;
    if (!streamName) {
      streamName = generateLiveStreamName();
      let attempts = 0;
      while (attempts < 5) {
        const clash = await User.findOne({ liveStreamName: streamName, _id: { $ne: user._id } }).select("_id").lean();
        if (!clash) break;
        streamName = generateLiveStreamName();
               attempts++;
      }
      (user as any).liveStreamName = streamName;
    }
    (user as any).isLive = true;
    (user as any).lastLiveEndedAt = undefined;
    (user as any).liveStartedAt = new Date();
    await user.save();

    const urls = buildLivestreamUrls(streamName!);
    if (!urls) throw new AppError("Could not build stream URLs", 500);

    res.json({
      message: "Live session started",
      data: {
        isLive: true,
        liveStreamName: streamName,
        liveStartedAt: (user as any).liveStartedAt,
        urls,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/live/stop
router.post("/stop", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const user = await User.findById(req.user!._id);
    if (!user) throw new AppError("User not found", 404);
    (user as any).isLive = false;
    (user as any).liveStreamName = undefined;
    (user as any).liveStartedAt = undefined;
    (user as any).lastLiveEndedAt = new Date();
    await user.save();
    res.json({ message: "Live ended", data: { isLive: false } });
  } catch (err) {
    next(err);
  }
});

// GET /api/live/playback/:userId — HLS URL for viewers (only when broadcaster is live with stream)
router.get("/playback/:userId", authenticateOptional, async (req: AuthRequest, res: Response, next) => {
  try {
    const target = await User.findById(req.params.userId)
      .select("name avatar isLive liveStreamName liveStartedAt")
      .lean();
    if (!target) throw new AppError("User not found", 404);
    const stillLive = userShowsLiveBadge(target as any) && !!(target as any).liveStreamName;
    if (!stillLive) {
      res.json({
        data: {
          isLive: false,
          hlsUrl: null,
          liveStartedAt: null,
          streamKey: null,
          user: { name: (target as any).name, avatar: (target as any).avatar },
        },
      });
      return;
    }
    const urls = buildLivestreamUrls(String((target as any).liveStreamName));
    res.json({
      data: {
        isLive: stillLive,
        hlsUrl: urls?.hlsUrl ?? null,
        liveStartedAt: (target as any).liveStartedAt || null,
        streamKey: String((target as any).liveStreamName),
        user: { name: (target as any).name, avatar: (target as any).avatar },
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Viewer-side playback telemetry (buffering, errors, heartbeats).
 * Validates broadcaster is live and stream key matches — does not change stream lifecycle.
 */
router.post("/metrics/report", authenticateOptional, async (req: AuthRequest, res: Response, next) => {
  try {
    const broadcasterUserId = String(req.body?.broadcasterUserId || "").trim();
    const streamKey = String(req.body?.streamKey || "").trim();
    const eventType = String(req.body?.eventType || "").trim() as
      | "play_start"
      | "heartbeat"
      | "buffer_stall"
      | "error"
      | "fatal_error"
      | "ended";
    const message =
      typeof req.body?.message === "string" ? String(req.body.message).trim().slice(0, 500) : undefined;
    const sessionId =
      typeof req.body?.sessionId === "string" ? String(req.body.sessionId).trim().slice(0, 80) : undefined;

    if (!mongoose.isValidObjectId(broadcasterUserId)) throw new AppError("broadcasterUserId required", 400);
    if (!streamKey || streamKey.length > 120) throw new AppError("streamKey required", 400);
    if (!METRIC_TYPES.has(eventType)) throw new AppError("Invalid eventType", 400);

    const broadcaster = await User.findById(broadcasterUserId).select("isLive liveStreamName").lean();
    if (!broadcaster) throw new AppError("Broadcaster not found", 404);
    if (!(broadcaster as any).isLive || String((broadcaster as any).liveStreamName || "") !== streamKey) {
      throw new AppError("Stream is not active", 403);
    }

    await LivestreamPlaybackEvent.create({
      broadcasterUserId: new mongoose.Types.ObjectId(broadcasterUserId),
      streamKey,
      eventType,
      message: message || undefined,
      sessionId: sessionId || undefined,
    });
    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
