import crypto from "crypto";
import { Router } from "express";
import { authenticate, AuthRequest } from "../middleware/auth";

const router = Router();

function parseTurnUrls(): string[] {
  const raw =
    process.env.TURN_URLS ||
    "turn:165.227.237.142:3478?transport=udp,turns:165.227.237.142:5349?transport=tcp";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function buildTemporaryTurnCredentials(userId: string) {
  const sharedSecret = String(process.env.TURN_SHARED_SECRET || "").trim();
  if (!sharedSecret) return null;
  const ttlSec = Number.parseInt(String(process.env.TURN_TTL_SECONDS || "3600"), 10) || 3600;
  const expiresAt = Math.floor(Date.now() / 1000) + Math.max(60, ttlSec);
  const username = `${expiresAt}:${userId}`;
  const credential = crypto
    .createHmac("sha1", sharedSecret)
    .update(username)
    .digest("base64");
  return { username, credential, ttlSec, expiresAt };
}

router.get("/turn-credentials", authenticate, async (req: AuthRequest, res) => {
  const userId = String(req.user?._id || req.user?.id || "").trim();
  if (!userId) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const urls = parseTurnUrls();
  const temporary = buildTemporaryTurnCredentials(userId);
  if (temporary) {
    return res.json({
      data: {
        urls,
        username: temporary.username,
        credential: temporary.credential,
        ttlSec: temporary.ttlSec,
        expiresAt: temporary.expiresAt,
      },
    });
  }

  const enforceEphemeralOnly = String(process.env.TURN_ENFORCE_EPHEMERAL || "").trim() === "1";
  if (enforceEphemeralOnly) {
    return res.status(503).json({ error: "TURN temporary credentials are required but not configured" });
  }

  // Backward-compatible fallback if TURN_SHARED_SECRET not configured yet.
  const username = String(process.env.TURN_USERNAME || "").trim();
  const credential = String(process.env.TURN_PASSWORD || "").trim();
  if (!username || !credential) {
    return res.status(503).json({ error: "TURN credentials unavailable" });
  }

  return res.json({
    data: {
      urls,
      username,
      credential,
      ttlSec: 300,
      expiresAt: Math.floor(Date.now() / 1000) + 300,
      fallback: true,
    },
  });
});

export default router;
