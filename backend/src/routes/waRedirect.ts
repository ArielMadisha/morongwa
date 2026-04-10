import express, { Request, Response } from "express";
import {
  verifyWaRedirectToken,
  resolveWaRedirectToWhatsAppUrl,
} from "../utils/waSignedLink";

const router = express.Router();

function getTwilioWhatsAppFromDigits(): string {
  const fromRaw = String(process.env.TWILIO_WHATSAPP_FROM || "").trim();
  return fromRaw.replace(/^whatsapp:/i, "").replace(/\D/g, "");
}

/**
 * GET /api/wa/g/:token
 * HMAC-signed redirect to wa.me — prefilled text cannot be altered without invalidating the signature.
 */
router.get("/g/:token", (req: Request, res: Response) => {
  const token = String(req.params.token || "").trim();
  const data = verifyWaRedirectToken(token);
  if (!data) {
    res.status(400).type("text/plain").send("Invalid or expired link. Open QwertyHub from the latest bot message.");
    return;
  }
  const waDigits = getTwilioWhatsAppFromDigits();
  const url = resolveWaRedirectToWhatsAppUrl(data, waDigits);
  if (!url) {
    res.status(503).type("text/plain").send("WhatsApp link is not configured.");
    return;
  }
  res.redirect(302, url);
});

export default router;
