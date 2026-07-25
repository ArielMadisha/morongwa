import express, { Request, Response } from "express";
import twilio from "twilio";
import VoiceCall from "../data/models/VoiceCall";
import { authenticate, AuthRequest } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { strictLimiter } from "../middleware/rateLimit";
import { voiceClientConfigured, voiceEnabled, voiceMinBalanceZar } from "../config/voiceRates";
import {
  getTwilioVoicePricingSyncStatus,
  readTwilioVoicePricingExport,
  runTwilioVoicePricingSyncSafe,
} from "../services/twilioVoicePricingSync";
import { getTwilioVoicePricingSchedulerStatus } from "../services/twilioVoicePricingScheduler";
import {
  createClientAccessTokenOrThrow,
  createClientCallSession,
  getVoiceQuote,
  handleStatusWebhook,
  twimlForClientOutbound,
  validateTwilioWebhook,
} from "../services/twilioVoiceService";
import { logger } from "../services/monitoring";

const router = express.Router();

function webhookParams(req: Request): Record<string, string> {
  const out: Record<string, string> = {};
  const src = req.body && typeof req.body === "object" ? req.body : {};
  for (const [k, v] of Object.entries(src)) {
    if (v != null) out[k] = String(v);
  }
  return out;
}

function webhookUrl(req: Request): string {
  const configured = String(
    process.env.TWILIO_WEBHOOK_BASE_URL || process.env.BACKEND_URL || process.env.API_PUBLIC_URL || ""
  )
    .trim()
    .replace(/\/$/, "");
  if (configured) {
    return `${configured}${req.originalUrl}`;
  }
  const proto = String(req.headers["x-forwarded-proto"] || req.protocol || "https").split(",")[0];
  const host = String(req.headers["x-forwarded-host"] || req.get("host") || "");
  return `${proto}://${host}${req.originalUrl}`;
}

router.get("/status", (_req, res) => {
  res.json({
    enabled: voiceEnabled(),
    clientSdk: voiceClientConfigured(),
    modes: ["client"],
    note: "Twilio Voice SDK (WebRTC in browser/app) → TwiML → PSTN. No callback to your SIM.",
  });
});

router.get("/twilio-charges", authenticate, async (_req: AuthRequest, res, next) => {
  try {
    const exportData = readTwilioVoicePricingExport();
    res.json({
      scheduler: getTwilioVoicePricingSchedulerStatus(),
      sync: getTwilioVoicePricingSyncStatus(),
      data: exportData,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/twilio-charges/sync", authenticate, strictLimiter, async (_req: AuthRequest, res, next) => {
  try {
    await runTwilioVoicePricingSyncSafe();
    res.json({
      ok: true,
      scheduler: getTwilioVoicePricingSchedulerStatus(),
      sync: getTwilioVoicePricingSyncStatus(),
      data: readTwilioVoicePricingExport(),
    });
  } catch (err) {
    next(err);
  }
});

router.get("/rates", authenticate, async (req: AuthRequest, res, next) => {
  try {
    const to = String(req.query.to || "").trim();
    if (!to) {
      return res.json({
        enabled: voiceEnabled(),
        clientSdk: voiceClientConfigured(),
        minWalletBalanceZar: voiceMinBalanceZar(),
        message: "Pass ?to=+27821234567 for a quote",
      });
    }
    const quote = await getVoiceQuote(to);
    res.json({ quote });
  } catch (err) {
    next(err);
  }
});

router.get("/history", authenticate, async (req: AuthRequest, res, next) => {
  try {
    const userId = String(req.user?._id || "");
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const rows = await VoiceCall.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    res.json({ calls: rows });
  } catch (err) {
    next(err);
  }
});

router.get("/client-token", authenticate, async (req: AuthRequest, res, next) => {
  try {
    const userId = String(req.user?._id || "");
    const token = createClientAccessTokenOrThrow(userId);
    res.json({ token });
  } catch (err) {
    next(err);
  }
});

/** Create call session + return Voice SDK access token. Client must device.connect({ params: { To, CallId } }). */
router.post("/outbound", authenticate, strictLimiter, async (req: AuthRequest, res, next) => {
  try {
    const to = String(req.body?.to || req.body?.destination || "").trim();
    if (!to) throw new AppError("Destination number (to) is required", 400);

    const result = await createClientCallSession({
      userId: String(req.user?._id || ""),
      destination: to,
    });

    res.status(201).json({
      message: "Connecting via Morongwa — allow microphone access.",
      ...result,
    });
  } catch (err) {
    next(err);
  }
});

/** Twilio Voice Application request URL — client outbound TwiML (dial PSTN). */
router.post("/twiml/client-outbound", async (req: Request, res: Response) => {
  try {
    const params = webhookParams(req);
    const sig = req.headers["x-twilio-signature"] as string | undefined;
    const url = webhookUrl(req);
    if (process.env.NODE_ENV === "production" && !validateTwilioWebhook(sig, url, params)) {
      logger.warn("Voice TwiML signature rejected", { url, hasSignature: Boolean(sig) });
      return res.status(403).send("Forbidden");
    }

    const xml = await twimlForClientOutbound(params);
    res.type("text/xml");
    res.send(xml);
  } catch (err) {
    logger.error("Voice TwiML error", { err: String(err) });
    const vr = new twilio.twiml.VoiceResponse();
    vr.say("An error occurred.");
    vr.hangup();
    res.type("text/xml");
    res.send(vr.toString());
  }
});

/** Legacy Dial action URL — empty TwiML keeps the client leg up until Twilio ends the call naturally. */
router.post("/twiml/dial-status", async (_req: Request, res: Response) => {
  res.type("text/xml");
  res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
});

router.post("/webhook/status", async (req: Request, res: Response) => {
  try {
    const params = webhookParams(req);
    const sig = req.headers["x-twilio-signature"] as string | undefined;
    if (process.env.NODE_ENV === "production" && !validateTwilioWebhook(sig, webhookUrl(req), params)) {
      return res.status(403).send("Forbidden");
    }
    const callId = String(req.query.callId || "").trim();
    await handleStatusWebhook(params, callId || undefined);
    res.status(200).send("OK");
  } catch {
    res.status(200).send("OK");
  }
});

export default router;
