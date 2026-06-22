import crypto from "crypto";
import { AppError } from "../middleware/errorHandler";

const QR_SIGNING_SECRET = String(process.env.MERCHANT_QR_SECRET || process.env.JWT_SECRET || "merchant-qr-secret-change-me");

function base64UrlEncode(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function base64UrlDecode(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

function signSegment(segment: string): string {
  return crypto.createHmac("sha256", QR_SIGNING_SECRET).update(segment).digest("base64url");
}

export function signQrPayload(payload: Record<string, unknown>): string {
  const encoded = base64UrlEncode(JSON.stringify(payload));
  const sig = signSegment(encoded);
  return `${encoded}.${sig}`;
}

export function verifyQrToken(token: string): Record<string, any> {
  const raw = String(token || "").trim();
  const [encoded, sig] = raw.split(".");
  if (!encoded || !sig) throw new AppError("Invalid QR token", 400);
  const expected = signSegment(encoded);
  if (sig !== expected) throw new AppError("Invalid QR signature", 400);
  const payload = JSON.parse(base64UrlDecode(encoded));
  if (payload?.expiresAt) {
    const expiryMs = new Date(String(payload.expiresAt)).getTime();
    if (!Number.isFinite(expiryMs) || Date.now() > expiryMs) {
      throw new AppError("QR token expired", 400);
    }
  }
  return payload;
}
