// Rate limiting middleware
import type { Request } from "express";
import rateLimit from "express-rate-limit";

/** Prefer real client IP when behind nginx / Cloudflare (shared NAT must not share one bucket). */
function clientIpKey(req: Request): string {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.trim()) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const cf = req.headers["cf-connecting-ip"];
  if (typeof cf === "string" && cf.trim()) return cf.trim();
  return req.ip || "unknown";
}

/** Cached public GETs must not burn the shared API quota (wall feed = many calls per session). */
function skipPublicCachedRead(req: Request): boolean {
  if (req.method !== "GET") return false;
  const path = (req.originalUrl || req.url || "").split("?")[0] || "";
  return (
    path === "/api/fx/rates" ||
    path.endsWith("/fx/rates") ||
    path === "/api/landing-backgrounds" ||
    path.endsWith("/landing-backgrounds")
  );
}

const apiMax =
  process.env.NODE_ENV === "development"
    ? 5000
    : Number(process.env.API_RATE_LIMIT_MAX || 3000);

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: Number.isFinite(apiMax) && apiMax > 0 ? apiMax : 3000,
  message: "Too many requests from this IP, please try again later",
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: clientIpKey,
  skip: skipPublicCachedRead,
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === "development" ? 100 : 20,
  message: "Too many authentication attempts, please try again in 15 minutes",
  skipSuccessfulRequests: true,
});

/** Stricter limit for OTP send - prevents SMS/WhatsApp abuse and Twilio cost exhaustion. */
export const otpSendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === "development" ? 20 : 10,
  message: "Too many verification requests. Please try again in a few minutes.",
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: clientIpKey,
});

/** Password reset request limiter (email/SMS/WhatsApp delivery abuse protection). */
export const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === "development" ? 20 : 5,
  message: "Too many password reset requests. Please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

/** Registration limiter: counts successful + failed attempts to prevent farming accounts. */
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: process.env.NODE_ENV === "development" ? 30 : 8,
  message: "Too many registration attempts. Please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
});

export const strictLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: "Too many requests, please try again later",
});

/** Stricter limits for wallet and payment routes (financial abuse prevention). */
export const walletPaymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === "development" ? 300 : 80,
  message: "Too many wallet requests. Please try again shortly.",
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: clientIpKey,
});
