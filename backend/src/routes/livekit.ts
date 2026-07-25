/**
 * LiveKit token + config + webhook routes.
 * POST bodies are JSON; webhook uses raw body + LiveKit signature.
 */
import express, { Response, NextFunction } from "express";
import { authenticate, AuthRequest } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { logger } from "../services/monitoring";
import {
  audioRoomName,
  callRoomName,
  getLiveKitUrl,
  getWebhookReceiver,
  isLiveKitConfigured,
  liveRoomName,
  mintAccessToken,
  qwertzRoomName,
  type LiveKitRole,
} from "../services/livekitService";

const router = express.Router();

function requireConfigured(_req: AuthRequest, _res: Response, next: NextFunction): void {
  if (!isLiveKitConfigured()) {
    next(new AppError("Live media is not configured", 503));
    return;
  }
  next();
}

function userIdOf(req: AuthRequest): string {
  return String(req.user?._id || (req.user as { id?: string })?.id || "").trim();
}

function displayNameOf(req: AuthRequest): string {
  const u = req.user as { name?: string; username?: string } | undefined;
  return String(u?.name || u?.username || "").trim() || userIdOf(req);
}

/** GET /api/livekit/config — public-ish (no secret). */
router.get("/config", (_req, res) => {
  const configured = isLiveKitConfigured();
  res.json({
    data: {
      configured,
      url: configured ? getLiveKitUrl() : null,
    },
  });
});

/**
 * POST /api/livekit/call-token — 1:1 call (or meeting when roomName is provided).
 * Body: { peerUserId } and/or { roomName } — at least one required.
 */
router.post("/call-token", authenticate, requireConfigured, async (req: AuthRequest, res, next) => {
  try {
    const me = userIdOf(req);
    const peerUserId = String(req.body?.peerUserId || "").trim();
    const roomNameOverride = String(req.body?.roomName || "").trim();
    if (!me) throw new AppError("Authentication required", 401);
    if (!peerUserId && !roomNameOverride) {
      throw new AppError("peerUserId or roomName is required", 400);
    }
    if (peerUserId && peerUserId === me && !roomNameOverride) {
      throw new AppError("Cannot call yourself", 400);
    }

    const room = roomNameOverride
      ? roomNameOverride.slice(0, 128)
      : callRoomName(me, peerUserId);
    const minted = await mintAccessToken({
      identity: me,
      name: displayNameOf(req),
      roomName: room,
      role: "call",
      metadata: {
        kind: roomNameOverride ? "meeting" : "call",
        ...(peerUserId ? { peerUserId } : {}),
      },
    });
    res.json({ data: minted });
  } catch (err) {
    next(err);
  }
});

/** POST /api/livekit/live/token — Live Rooms (host / viewer). */
router.post("/live/token", authenticate, requireConfigured, async (req: AuthRequest, res, next) => {
  try {
    const me = userIdOf(req);
    if (!me) throw new AppError("Authentication required", 401);
    const asHost = Boolean(req.body?.asHost);
    const hostUserId = asHost ? me : String(req.body?.hostUserId || "").trim();
    if (!hostUserId) throw new AppError("hostUserId is required for viewers", 400);

    const role: LiveKitRole = asHost ? "host" : "viewer";
    const room = liveRoomName(hostUserId);
    const minted = await mintAccessToken({
      identity: me,
      name: displayNameOf(req),
      roomName: room,
      role,
      metadata: { kind: "live", hostUserId },
    });
    res.json({ data: { ...minted, hostUserId } });
  } catch (err) {
    next(err);
  }
});

/** POST /api/livekit/audio/token — Audio Rooms. */
router.post("/audio/token", authenticate, requireConfigured, async (req: AuthRequest, res, next) => {
  try {
    const me = userIdOf(req);
    if (!me) throw new AppError("Authentication required", 401);
    const roomId = String(req.body?.roomId || "").trim();
    if (!roomId) throw new AppError("roomId is required", 400);

    const rawRole = String(req.body?.role || "listener").trim().toLowerCase();
    let role: LiveKitRole = "listener";
    if (rawRole === "host") role = "host";
    else if (rawRole === "speaker") role = "speaker";
    else role = "listener";

    const room = audioRoomName(roomId);
    const minted = await mintAccessToken({
      identity: me,
      name: displayNameOf(req),
      roomName: room,
      role,
      metadata: { kind: "audio", roomId },
    });
    res.json({ data: { ...minted, roomId } });
  } catch (err) {
    next(err);
  }
});

/** POST /api/livekit/qwertz/token — Qwertz Live (vertical). */
router.post("/qwertz/token", authenticate, requireConfigured, async (req: AuthRequest, res, next) => {
  try {
    const me = userIdOf(req);
    if (!me) throw new AppError("Authentication required", 401);
    const asHost = Boolean(req.body?.asHost);
    const hostUserId = asHost ? me : String(req.body?.hostUserId || "").trim();
    if (!hostUserId) throw new AppError("hostUserId is required for viewers", 400);

    const role: LiveKitRole = asHost ? "host" : "viewer";
    const room = qwertzRoomName(hostUserId);
    const minted = await mintAccessToken({
      identity: me,
      name: displayNameOf(req),
      roomName: room,
      role,
      metadata: { kind: "qwertz", hostUserId },
    });
    res.json({ data: { ...minted, hostUserId } });
  } catch (err) {
    next(err);
  }
});

router.post(
  "/webhook",
  async (req, res) => {
    const receiver = getWebhookReceiver();
    if (!receiver) {
      return res.status(503).json({ error: "Live media is not configured" });
    }
    try {
      const authHeader = String(req.get("Authorization") || req.get("authorization") || "");
      const raw = (req as express.Request & { rawBody?: Buffer }).rawBody;
      const body =
        raw && Buffer.isBuffer(raw)
          ? raw.toString("utf8")
          : Buffer.isBuffer(req.body)
            ? req.body.toString("utf8")
            : typeof req.body === "string"
              ? req.body
              : JSON.stringify(req.body ?? {});
      const event = await receiver.receive(body, authHeader);
      logger.info("LiveKit webhook", {
        event: event.event,
        room: event.room?.name,
        participant: event.participant?.identity,
      });
      return res.json({ ok: true });
    } catch (err) {
      logger.warn("LiveKit webhook rejected", {
        error: err instanceof Error ? err.message : String(err),
      });
      return res.status(401).json({ error: "Invalid webhook signature" });
    }
  }
);

export default router;
