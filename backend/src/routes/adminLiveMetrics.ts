import express, { Response } from "express";
import mongoose from "mongoose";
import User from "../data/models/User";
import LivestreamPlaybackEvent from "../data/models/LivestreamPlaybackEvent";
import { AuthRequest } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { buildLivestreamUrls, getHlsPublicBase } from "../services/livestream";

const router = express.Router();

function hoursParam(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return 24;
  return Math.min(168, Math.floor(n));
}

/** HEAD/GET probe for HLS playlist (some origins only allow GET). */
async function probeHlsUrl(url: string): Promise<{ ok: boolean; status: number; ms: number; method: string }> {
  const once = async (httpMethod: "HEAD" | "GET") => {
    const t0 = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    try {
      const r = await fetch(url, {
        method: httpMethod,
        signal: controller.signal,
        headers: httpMethod === "GET" ? { Range: "bytes=0-0" } : undefined,
      });
      clearTimeout(timer);
      const ok = r.ok || r.status === 206;
      return { ok, status: r.status, ms: Date.now() - t0, method: httpMethod };
    } catch {
      clearTimeout(timer);
      return { ok: false, status: 0, ms: Date.now() - t0, method: httpMethod };
    }
  };
  const head = await once("HEAD");
  if (head.status === 405 || head.status === 501) {
    const g = await once("GET");
    return { ok: g.ok, status: g.status, ms: g.ms, method: "GET" };
  }
  return { ok: head.ok, status: head.status, ms: head.ms, method: "HEAD" };
}

router.get("/live/metrics/summary", async (req: AuthRequest, res: Response, next) => {
  try {
    const hours = hoursParam(req.query.hours);
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    let broadcasterFilter: Record<string, unknown> = {};
    const bid = String(req.query.broadcasterUserId || "").trim();
    if (bid) {
      if (!mongoose.isValidObjectId(bid)) throw new AppError("Invalid broadcasterUserId", 400);
      broadcasterFilter = { broadcasterUserId: new mongoose.Types.ObjectId(bid) };
    }

    const [byType, recentErrors, viewerAgg] = await Promise.all([
      LivestreamPlaybackEvent.aggregate<{ _id: string; count: number }>([
        { $match: { createdAt: { $gte: since }, ...broadcasterFilter } },
        { $group: { _id: "$eventType", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      LivestreamPlaybackEvent.find({
        createdAt: { $gte: since },
        eventType: { $in: ["error", "fatal_error", "buffer_stall"] },
        ...broadcasterFilter,
      })
        .sort({ createdAt: -1 })
        .limit(40)
        .select("streamKey eventType message sessionId createdAt broadcasterUserId")
        .lean(),
      LivestreamPlaybackEvent.aggregate<{ _id: string; viewersApprox: number }>([
        {
          $match: {
            createdAt: { $gte: new Date(Date.now() - 15 * 60 * 1000) },
            eventType: "heartbeat",
            sessionId: { $exists: true, $nin: [null, ""] },
            ...broadcasterFilter,
          },
        },
        { $group: { _id: { streamKey: "$streamKey", sessionId: "$sessionId" } } },
        { $group: { _id: "$_id.streamKey", viewersApprox: { $sum: 1 } } },
        { $sort: { viewersApprox: -1 } },
      ]),
    ]);

    res.json({
      data: {
        hours,
        since: since.toISOString(),
        byType,
        recentErrors,
        /** Distinct heartbeat sessions per streamKey in the last ~15 minutes (rough concurrency). */
        viewersApproxByStream: viewerAgg,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post("/live/metrics/hls-probe", async (_req: AuthRequest, res: Response, next) => {
  try {
    const hlsBase = getHlsPublicBase();
    if (!hlsBase) throw new AppError("HLS base not configured", 503);

    const live = await User.find({ isLive: true, liveStreamName: { $exists: true, $ne: "" } })
      .select("_id name username liveStreamName")
      .limit(25)
      .lean();

    const results: Array<{
      userId: string;
      name?: string;
      username?: string;
      streamKey: string;
      hlsUrl: string;
      probe: { ok: boolean; status: number; ms: number; method: string };
    }> = [];

    for (const u of live) {
      const streamKey = String((u as any).liveStreamName || "");
      if (!streamKey) continue;
      const urls = buildLivestreamUrls(streamKey);
      if (!urls?.hlsUrl) continue;
      const probe = await probeHlsUrl(urls.hlsUrl);
      results.push({
        userId: String(u._id),
        name: (u as any).name,
        username: (u as any).username,
        streamKey,
        hlsUrl: urls.hlsUrl,
        probe,
      });
    }

    res.json({
      data: {
        hlsBaseConfigured: Boolean(hlsBase),
        checkedAt: new Date().toISOString(),
        streams: results,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
