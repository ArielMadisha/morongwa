// Authentication routes (register, login)
import express, { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import User from "../data/models/User";
import Wallet from "../data/models/Wallet";
import AuditLog from "../data/models/AuditLog";
import { registerSchema, loginSchema, sendOtpSchema, verifyOtpSchema, sendEmailOtpSchema, verifyEmailOtpSchema } from "../utils/validators";
import { authLimiter, otpSendLimiter, registerLimiter } from "../middleware/rateLimit";
import { AppError } from "../middleware/errorHandler";
import { authenticate, AuthRequest } from "../middleware/auth";
import { sendOtpCode, otpSmsChannelReady, otpSmsReadyForCountry, countryIsoFromCanonicalDigits } from "../services/otpDelivery";
import { sendEmailWithAttachments } from "../services/notification";
import { getPrimaryWhatsappSendProfile } from "../utils/twilioWaCredentials";
import { isValidForOtp, normalizePhone } from "../utils/phoneValidation";
import { canonicalPhoneDigits } from "../utils/phoneE164";
import { computePhoneLocale, sanitizePreferredCurrencyForApi } from "../utils/phoneCountryCurrency";
import { resolveCanonicalUserByPhoneDigits } from "../utils/resolveCanonicalUserByPhone";
import { getClientIp, lookupRegistrationGeo } from "../utils/clientIpGeo";
import { isGenericDisplayName, sanitizeUserForClient } from "../utils/userDisplayLabel";
import {
  assertRegistrationAllowed,
  isBlockedRegistrationPhonePrefix,
  isDisposableRegistrationEmail,
} from "../utils/registrationSecurity";
import { getJwtSecret, getOtpSecret } from "../utils/secrets";
import { getRunnerServiceCity } from "../data/runnerServiceAreas";
import { bumpStatusStripCache } from "../services/statusStripPolicy";
import path from "path";
import { applyResolvedAvatarToUserPayload } from "../utils/resolveUserAvatar";
import { assignStockAvatarForNewUser } from "../utils/stockAvatar";

/**
 * Phone lookup variants for login (digits-only storage + common SA local form).
 */
function phoneLoginCandidates(raw: string): string[] {
  const digits = String(raw || "").replace(/\D/g, "");
  const canon = canonicalPhoneDigits(raw) || canonicalPhoneDigits(digits);
  const out = new Set<string>();
  if (digits) out.add(digits);
  if (canon) {
    out.add(canon);
    out.add(`+${canon}`);
    // SA national: 27XXXXXXXXX → 0XXXXXXXXX
    if (canon.startsWith("27") && canon.length === 11) out.add(`0${canon.slice(2)}`);
  }
  if (digits.startsWith("0") && digits.length >= 10) {
    const asZa = `27${digits.slice(1)}`;
    out.add(asZa);
    out.add(`+${asZa}`);
  }
  return [...out].filter(Boolean);
}

const UPLOADS_ROOT = path.resolve(__dirname, "../uploads");

const router = express.Router();

// Per-phone OTP limits (use Redis in production for multi-instance)
const OTP_COOLDOWN_MS = 2 * 60 * 1000; // 2 min between requests per phone
const OTP_DAILY_CAP = 5;
const phoneLastSent = new Map<string, number>();
const phoneDailyCount = new Map<string, { count: number; date: string }>();

function getPhoneOtpLimits(normalized: string): { allowed: boolean; reason?: string } {
  const now = Date.now();
  const last = phoneLastSent.get(normalized);
  if (last && now - last < OTP_COOLDOWN_MS) {
    const waitSec = Math.ceil((OTP_COOLDOWN_MS - (now - last)) / 1000);
    return { allowed: false, reason: `Please wait ${waitSec} seconds before requesting another code` };
  }
  const today = new Date().toISOString().slice(0, 10);
  const entry = phoneDailyCount.get(normalized);
  if (entry) {
    if (entry.date !== today) {
      phoneDailyCount.delete(normalized);
    } else if (entry.count >= OTP_DAILY_CAP) {
      return { allowed: false, reason: "Daily limit reached. Try again tomorrow." };
    }
  }
  return { allowed: true };
}

function recordOtpSent(normalized: string): void {
  phoneLastSent.set(normalized, Date.now());
  const today = new Date().toISOString().slice(0, 10);
  const entry = phoneDailyCount.get(normalized);
  if (!entry || entry.date !== today) {
    phoneDailyCount.set(normalized, { count: 1, date: today });
  } else {
    entry.count++;
  }
}

/** Backfill country + preferred currency from stored phone (same rules as login). */
async function syncUserPhoneLocale(userId: string): Promise<void> {
  const doc = await User.findById(userId).select("phone countryCode preferredCurrency").lean();
  if (!doc?.phone) return;
  if (doc.countryCode && doc.preferredCurrency) return;
  const loc = computePhoneLocale(String(doc.phone));
  if (loc.countryCode) {
    await User.updateOne({ _id: userId }, { $set: loc });
  }
}

/** Generate a URL-safe username from name. Returns unique by appending numbers if taken. */
async function generateUniqueUsername(name: string): Promise<string> {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 30) || "user";
  let candidate = base;
  let n = 0;
  while (await User.findOne({ username: candidate })) {
    n++;
    candidate = `${base}${n}`.slice(0, 30);
  }
  return candidate;
}

// In-memory OTP store (use Redis/DB in production). Format: phone -> { otpHash, expiresAt }
const otpStore = new Map<string, { otpHash: string; expiresAt: number }>();
const OTP_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const OTP_VERIFY_MAX_ATTEMPTS = 5;
const otpVerifyAttempts = new Map<string, { count: number; firstAt: number }>();

function getOtpVerifyAttemptEntry(phone: string): { count: number; firstAt: number } {
  const now = Date.now();
  const existing = otpVerifyAttempts.get(phone);
  if (!existing || now - existing.firstAt > OTP_EXPIRY_MS) {
    const fresh = { count: 0, firstAt: now };
    otpVerifyAttempts.set(phone, fresh);
    return fresh;
  }
  return existing;
}

// OTP provider health — disabled on production (use Twilio dashboard / internal ops).
router.get("/otp-health", (_req: Request, res: Response) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(404).json({ error: "Not found" });
  }
  const hasSid = !!process.env.TWILIO_ACCOUNT_SID;
  const hasToken = !!process.env.TWILIO_AUTH_TOKEN;
  const hasSmsFrom = !!process.env.TWILIO_SMS_FROM;
  const hasSmsMessagingService = !!process.env.TWILIO_SMS_MESSAGING_SERVICE_SID;
  const hasSmsFromBw = !!process.env.TWILIO_SMS_FROM_BW;
  const hasSmsFromZa = !!process.env.TWILIO_SMS_FROM_ZA;
  const hasWhatsappFrom = !!getPrimaryWhatsappSendProfile();
  const twilioConfigured = hasSid && hasToken;

  res.json({
    data: {
      provider: "twilio",
      configured: twilioConfigured,
      smsReady: otpSmsChannelReady(),
      smsReadyBw: otpSmsReadyForCountry("BW"),
      smsReadyZa: otpSmsReadyForCountry("ZA"),
      whatsappReady: hasWhatsappFrom,
      hasSmsMessagingService,
      hasRegionalSmsBw: hasSmsFromBw,
      hasRegionalSmsZa: hasSmsFromZa,
      mode: process.env.NODE_ENV === "production" ? "production" : "development",
    },
  });
});

// Send OTP via SMS or WhatsApp (Twilio)
router.post("/send-otp", otpSendLimiter, async (req: Request, res: Response, next) => {
  try {
    const { error } = sendOtpSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);
    const { phone, channel = "whatsapp" } = req.body;
    const normalized = canonicalPhoneDigits(phone) || normalizePhone(phone);
    if (!normalized || normalized.length < 10) {
      throw new AppError(
        "Invalid phone number. Use international format, e.g. +27 82 123 4567 or +267 71 234 567.",
        400
      );
    }

    const phoneCheck = isValidForOtp(normalized);
    if (!phoneCheck.valid) throw new AppError(phoneCheck.reason || "Invalid phone", 400);
    if (isBlockedRegistrationPhonePrefix(normalized)) {
      throw new AppError(
        "This phone number range is not supported for verification. Use a standard mobile number or register with email.",
        400
      );
    }

    if (channel === "sms") {
      const iso = countryIsoFromCanonicalDigits(normalized);
      if (!otpSmsReadyForCountry(iso)) {
        throw new AppError(
          "SMS verification is not available for this country yet. Try WhatsApp or register with email.",
          503
        );
      }
    }

    const limitCheck = getPhoneOtpLimits(normalized);
    if (!limitCheck.allowed) throw new AppError(limitCheck.reason || "Too many requests", 429);

    const otp = crypto.randomInt(100000, 999999).toString();
    const otpHash = crypto.createHmac("sha256", getOtpSecret()).update(otp).digest("hex");
    otpStore.set(normalized, { otpHash, expiresAt: Date.now() + OTP_EXPIRY_MS });

    await sendOtpCode({ phone: normalized, channel, otp });
    recordOtpSent(normalized);

    const channelLabel = channel === "sms" ? "SMS" : "WhatsApp";
    res.json({ message: `OTP sent via ${channelLabel}`, sent: true });
  } catch (err) {
    next(err);
  }
});

// Verify OTP and return token for registration
router.post("/verify-otp", authLimiter, async (req: Request, res: Response, next) => {
  try {
    const { error } = verifyOtpSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);
    const { phone, otp } = req.body;
    const normalized = canonicalPhoneDigits(phone) || normalizePhone(phone);
    if (!normalized) throw new AppError("Invalid phone number", 400);

    const stored = otpStore.get(normalized);
    if (!stored) throw new AppError("OTP expired or invalid", 400);
    if (Date.now() > stored.expiresAt) {
      otpStore.delete(normalized);
      throw new AppError("OTP expired", 400);
    }

    const otpHash = crypto.createHmac("sha256", getOtpSecret()).update(otp).digest("hex");
    if (otpHash !== stored.otpHash) {
      const attempts = getOtpVerifyAttemptEntry(normalized);
      attempts.count += 1;
      if (attempts.count >= OTP_VERIFY_MAX_ATTEMPTS) {
        otpStore.delete(normalized);
        otpVerifyAttempts.delete(normalized);
        throw new AppError("Too many invalid OTP attempts. Request a new code.", 429);
      }
      throw new AppError("Invalid OTP", 400);
    }

    otpStore.delete(normalized);
    otpVerifyAttempts.delete(normalized);
    const otpToken = jwt.sign({ phone: normalized, verified: true }, getOtpSecret(), { expiresIn: "10m" });
    res.json({ verified: true, otpToken });
  } catch (err) {
    next(err);
  }
});

// In-memory email OTP store (same pattern as phone OTP).
const emailOtpStore = new Map<string, { otpHash: string; expiresAt: number }>();
const emailOtpLastSent = new Map<string, number>();
const emailOtpDailyCount = new Map<string, { count: number; date: string }>();
const emailOtpVerifyAttempts = new Map<string, { count: number; firstAt: number }>();

function getEmailOtpLimits(email: string): { allowed: boolean; reason?: string } {
  const now = Date.now();
  const last = emailOtpLastSent.get(email);
  if (last && now - last < OTP_COOLDOWN_MS) {
    const waitSec = Math.ceil((OTP_COOLDOWN_MS - (now - last)) / 1000);
    return { allowed: false, reason: `Please wait ${waitSec} seconds before requesting another code` };
  }
  const today = new Date().toISOString().slice(0, 10);
  const entry = emailOtpDailyCount.get(email);
  if (entry) {
    if (entry.date !== today) {
      emailOtpDailyCount.delete(email);
    } else if (entry.count >= OTP_DAILY_CAP) {
      return { allowed: false, reason: "Daily limit reached. Try again tomorrow." };
    }
  }
  return { allowed: true };
}

function recordEmailOtpSent(email: string): void {
  emailOtpLastSent.set(email, Date.now());
  const today = new Date().toISOString().slice(0, 10);
  const entry = emailOtpDailyCount.get(email);
  if (!entry || entry.date !== today) {
    emailOtpDailyCount.set(email, { count: 1, date: today });
  } else {
    entry.count++;
  }
}

function getEmailOtpVerifyAttemptEntry(email: string): { count: number; firstAt: number } {
  const now = Date.now();
  const existing = emailOtpVerifyAttempts.get(email);
  if (!existing || now - existing.firstAt > OTP_EXPIRY_MS) {
    const fresh = { count: 0, firstAt: now };
    emailOtpVerifyAttempts.set(email, fresh);
    return fresh;
  }
  return existing;
}

/** Send 6-digit verification code to email before account creation. */
router.post("/send-email-otp", otpSendLimiter, async (req: Request, res: Response, next) => {
  try {
    const { error } = sendEmailOtpSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);
    const email = String(req.body.email || "").trim().toLowerCase();
    if (isDisposableRegistrationEmail(email)) {
      throw new AppError("Please use a personal email address you control.", 400);
    }
    const existing = await User.findOne({ email }).select("_id").lean();
    if (existing) throw new AppError("Email already registered", 400);

    const limitCheck = getEmailOtpLimits(email);
    if (!limitCheck.allowed) throw new AppError(limitCheck.reason || "Too many requests", 429);

    const otp = crypto.randomInt(100000, 999999).toString();
    const otpHash = crypto.createHmac("sha256", getOtpSecret()).update(`email:${email}:${otp}`).digest("hex");
    emailOtpStore.set(email, { otpHash, expiresAt: Date.now() + OTP_EXPIRY_MS });

    const sent = await sendEmailWithAttachments({
      to: email,
      subject: "Your Qwertymates verification code",
      text: `Your Qwertymates verification code is ${otp}. It expires in 5 minutes. If you did not request this, ignore this email.`,
      html: `<p>Your Qwertymates verification code is <strong>${otp}</strong>.</p><p>It expires in 5 minutes.</p><p>If you did not request this, ignore this email.</p>`,
    });
    if (!sent) throw new AppError("Could not send verification email. Try again shortly.", 503);
    recordEmailOtpSent(email);
    res.json({ message: "Verification code sent to your email", sent: true });
  } catch (err) {
    next(err);
  }
});

/** Verify email OTP and return emailToken for register. */
router.post("/verify-email-otp", authLimiter, async (req: Request, res: Response, next) => {
  try {
    const { error } = verifyEmailOtpSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);
    const email = String(req.body.email || "").trim().toLowerCase();
    const otp = String(req.body.otp || "").trim();

    const stored = emailOtpStore.get(email);
    if (!stored) throw new AppError("Code expired or invalid", 400);
    if (Date.now() > stored.expiresAt) {
      emailOtpStore.delete(email);
      throw new AppError("Code expired", 400);
    }

    const otpHash = crypto.createHmac("sha256", getOtpSecret()).update(`email:${email}:${otp}`).digest("hex");
    if (otpHash !== stored.otpHash) {
      const attempts = getEmailOtpVerifyAttemptEntry(email);
      attempts.count += 1;
      if (attempts.count >= OTP_VERIFY_MAX_ATTEMPTS) {
        emailOtpStore.delete(email);
        emailOtpVerifyAttempts.delete(email);
        throw new AppError("Too many invalid attempts. Request a new code.", 429);
      }
      throw new AppError("Invalid verification code", 400);
    }

    emailOtpStore.delete(email);
    emailOtpVerifyAttempts.delete(email);
    const emailToken = jwt.sign({ email, verified: true }, getOtpSecret(), { expiresIn: "30m" });
    res.json({ verified: true, emailToken });
  } catch (err) {
    next(err);
  }
});

// Register a new user
router.post("/register", registerLimiter, async (req: Request, res: Response, next) => {
  try {
    const { error, value } = registerSchema.validate(req.body, { abortEarly: true, stripUnknown: true });
    if (error) throw new AppError(error.details[0].message, 400);

    const {
      name,
      email,
      password,
      role,
      dateOfBirth,
      username,
      otpToken,
      emailToken,
      phone: phoneRaw,
    } = value as typeof req.body;

    // Enforce minimum age 13
    if (dateOfBirth) {
      const birth = new Date(dateOfBirth);
      const today = new Date();
      let age = today.getFullYear() - birth.getFullYear();
      const m = today.getMonth() - birth.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
      if (age < 13) {
        throw new AppError("You must be at least 13 years old to register", 400);
      }
    }

    // Restrict admin and superadmin roles from public registration
    if (role && (role === "admin" || role === "superadmin")) {
      throw new AppError("Cannot register with admin or superadmin role", 403);
    }

    let finalEmail: string;
    let finalPhone: string | undefined;
    let emailVerified = false;

    if (otpToken) {
      try {
        const decoded = jwt.verify(otpToken, getOtpSecret()) as { phone: string; verified?: boolean };
        finalPhone = decoded.phone;
        finalEmail = `wa_${decoded.phone}@morongwa.local`;
        emailVerified = true; // phone OTP already proves control of the channel
      } catch {
        throw new AppError("Invalid or expired verification. Please verify your phone again.", 400);
      }
    } else if (email) {
      finalEmail = String(email).toLowerCase();
      if (isDisposableRegistrationEmail(finalEmail)) {
        throw new AppError("Please use a personal email address you control.", 400);
      }
      if (!emailToken) {
        throw new AppError("Please verify your email before creating an account.", 400);
      }
      try {
        const decoded = jwt.verify(emailToken, getOtpSecret()) as { email?: string; verified?: boolean };
        if (!decoded?.verified || String(decoded.email || "").toLowerCase() !== finalEmail) {
          throw new AppError("Email verification does not match. Request a new code.", 400);
        }
        emailVerified = true;
      } catch (err) {
        if (err instanceof AppError) throw err;
        throw new AppError("Invalid or expired email verification. Please verify your email again.", 400);
      }
      if (typeof phoneRaw === "string" && phoneRaw.trim()) {
        const phoneCheck = isValidForOtp(phoneRaw);
        if (!phoneCheck.valid) throw new AppError(phoneCheck.reason || "Invalid phone", 400);
        const normalizedPhone = normalizePhone(phoneRaw);
        const existingPhone = await User.findOne({
          $or: [{ phone: normalizedPhone }, { email: `wa_${normalizedPhone}@morongwa.local` }],
        });
        if (existingPhone) throw new AppError("Phone already registered", 400);
        finalPhone = normalizedPhone;
      }
    } else {
      throw new AppError("Email or phone verification required", 400);
    }

    await assertRegistrationAllowed({
      name,
      email: finalEmail,
      phone: finalPhone,
    });

    const existingUser = await User.findOne({ email: finalEmail });
    if (existingUser) {
      throw new AppError(finalEmail.includes("@morongwa.local") ? "Phone already registered" : "Email already registered", 400);
    }

    let finalUsername: string;
    if (username) {
      const uname = username.toLowerCase().trim();
      const existingByUsername = await User.findOne({ username: uname });
      if (existingByUsername) throw new AppError("Username already taken", 400);
      finalUsername = uname;
    } else {
      finalUsername = await generateUniqueUsername(name);
    }

    const passwordHash = await bcrypt.hash(password, 10);

    // Unified registration: default to client only. Runner requires separate verification.
    let roles: string[];
    if (role) {
      roles = Array.isArray(role) ? role : [role];
    } else {
      roles = ["client"];
    }

    const validRoles = roles.filter(r => r === "client" || r === "runner");
    if (validRoles.length === 0) {
      validRoles.push("client");
    }

    const registrationIp = getClientIp(req);
    const registrationGeo = await lookupRegistrationGeo(registrationIp);

    const userData: any = {
      name,
      email: finalEmail,
      passwordHash,
      role: validRoles,
      emailVerified,
      emailVerifiedAt: emailVerified ? new Date() : undefined,
      registrationIp: registrationIp !== "unknown" ? registrationIp : undefined,
      registrationGeo: registrationGeo || undefined,
    };
    if (dateOfBirth) userData.dateOfBirth = new Date(dateOfBirth);
    userData.username = finalUsername;
    if (finalPhone) userData.phone = finalPhone;
    if (finalPhone) {
      const loc = computePhoneLocale(finalPhone);
      if (loc.countryCode) Object.assign(userData, loc);
    }
    // Email/username signups often skip a photo — assign gendered stock avatar.
    const stock = assignStockAvatarForNewUser({ name, username: finalUsername });
    userData.avatar = stock.avatar;

    const user = await User.create(userData);
    bumpStatusStripCache();

    // Create wallet for user
    await Wallet.create({ user: user._id });

    // Audit log
    await AuditLog.create({
      action: "USER_REGISTERED",
      user: user._id,
      meta: {
        email: user.email,
        role: user.role,
        avatar: stock.avatar,
        inferredGender: stock.gender,
        emailVerified,
        ip: registrationIp,
        geo: registrationGeo,
        userAgent: String(req.headers["user-agent"] || "").slice(0, 300),
      },
    });

    const token = jwt.sign({ userId: user._id }, getJwtSecret(), { expiresIn: "7d" });

    const fresh = await User.findById(user._id).select("-passwordHash").lean();

    res.status(201).json({
      message: "User registered successfully",
      token,
      user: sanitizeUserForClient({
        id: fresh?._id,
        _id: fresh?._id,
        name: fresh?.name,
        email: fresh?.email,
        username: (fresh as any)?.username,
        role: fresh?.role,
        phone: (fresh as any)?.phone,
        countryCode: (fresh as any)?.countryCode,
        preferredCurrency: sanitizePreferredCurrencyForApi((fresh as any)?.preferredCurrency),
        avatar: (fresh as any)?.avatar || stock.avatar,
      }),
    });
  } catch (err) {
    next(err);
  }
});

// Login
router.post("/login", authLimiter, async (req: Request, res: Response, next) => {
  try {
    const { error } = loginSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);

    const { email, username, phone, password } = req.body;

    let user;
    if (phone) {
      const candidates = phoneLoginCandidates(phone);
      const digits =
        candidates.map((c) => String(c).replace(/\D/g, "")).find((d) => d.length >= 8) ||
        String(phone).replace(/\D/g, "");
      user = digits ? await resolveCanonicalUserByPhoneDigits(digits) : null;
      // If digits were entered but stored under username-like identifier, fall through below.
      if (!user && username) {
        user = await User.findOne({ username: String(username).trim().toLowerCase() });
      }
    } else if (username) {
      const uname = String(username).trim().toLowerCase();
      user = await User.findOne({ username: uname });
      // Allow typing a phone into the username field (mobile / single-box UIs).
      if (!user) {
        const candidates = phoneLoginCandidates(uname);
        const digits =
          candidates.map((c) => String(c).replace(/\D/g, "")).find((d) => d.length >= 8) ||
          uname.replace(/\D/g, "");
        if (digits.length >= 8) {
          user = await resolveCanonicalUserByPhoneDigits(digits);
        }
      }
    } else if (email) {
      user = await User.findOne({ email: email.trim().toLowerCase() });
    } else {
      throw new AppError("Email, username or phone is required", 400);
    }
    if (!user) {
      throw new AppError("Invalid credentials", 401);
    }

    if (!user.active || user.suspended || user.locked) {
      throw new AppError("Account is suspended or locked", 403);
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new AppError("Invalid credentials", 401);
    }

    if (isGenericDisplayName(user.name) && (user as any).username) {
      user.name = String((user as any).username).trim();
      await user.save();
    }

    if (user.phone && (!(user as any).countryCode || !(user as any).preferredCurrency)) {
      const loc = computePhoneLocale(user.phone);
      if (loc.countryCode) {
        await User.updateOne({ _id: user._id }, { $set: loc });
        (user as any).countryCode = loc.countryCode;
        (user as any).preferredCurrency = loc.preferredCurrency;
      }
    }

    const normalizedPref = sanitizePreferredCurrencyForApi((user as any).preferredCurrency);
    if (String((user as any).preferredCurrency || "").toUpperCase() === "INR" && normalizedPref !== "INR") {
      await User.updateOne({ _id: user._id }, { $set: { preferredCurrency: normalizedPref } });
      (user as any).preferredCurrency = normalizedPref;
    }

    const token = jwt.sign({ userId: user._id }, getJwtSecret(), { expiresIn: "7d" });

    await AuditLog.create({
      action: "USER_LOGIN",
      user: user._id,
      meta: { email: user.email },
    });

    res.json({
      message: "Login successful",
      token,
      user: await applyResolvedAvatarToUserPayload(
        sanitizeUserForClient({
          id: user._id,
          _id: user._id,
          name: user.name,
          email: user.email,
          username: (user as any).username,
          role: user.role,
          avatar: user.avatar,
          stripBackgroundPic: (user as any).stripBackgroundPic,
          phone: user.phone,
          countryCode: (user as any).countryCode,
          preferredCurrency: sanitizePreferredCurrencyForApi((user as any).preferredCurrency),
        }) as Record<string, unknown>,
        UPLOADS_ROOT
      ),
    });
  } catch (err) {
    next(err);
  }
});

// Request runner role (application to become a runner - adds role, verification separate)
router.post("/request-runner", authenticate, authLimiter, async (req: AuthRequest, res: Response, next) => {
  try {
    const user = await User.findById(req.user!._id);
    if (!user) throw new AppError("User not found", 404);

    const roles = Array.isArray(user.role) ? user.role : [user.role];
    if (roles.includes("runner")) {
      return res.json({ message: "Already a runner", user: user.toJSON() });
    }

    const rawCategory = String(req.body?.runnerCategory || "courier").trim();
    if (!["courier", "store_parcel"].includes(rawCategory)) {
      throw new AppError("Invalid runner category. Use courier or store_parcel.", 400);
    }

    const runnerServiceCountry = String(req.body?.runnerServiceCountry || "").trim().toUpperCase();
    const runnerServiceCity = String(req.body?.runnerServiceCity || "").trim().toLowerCase();
    if (rawCategory === "store_parcel") {
      if (!runnerServiceCountry || !runnerServiceCity) {
        throw new AppError("Store/parcel runners must select a service country and city.", 400);
      }
      if (!getRunnerServiceCity(runnerServiceCountry, runnerServiceCity)) {
        throw new AppError("Invalid service country or city.", 400);
      }
    }

    user.role = [...roles, "runner"];
    user.runnerCategory = rawCategory as "courier" | "store_parcel";
    if (runnerServiceCountry) user.runnerServiceCountry = runnerServiceCountry as any;
    if (runnerServiceCity) user.runnerServiceCity = runnerServiceCity as any;
    await user.save();

    await AuditLog.create({
      action: "RUNNER_APPLICATION",
      user: user._id,
      meta: { requestedAt: new Date(), runnerCategory: rawCategory, runnerServiceCountry, runnerServiceCity },
    });

    const userJson = user.toJSON ? user.toJSON() : user.toObject ? user.toObject() : user;
    const verificationHint =
      rawCategory === "store_parcel"
        ? "Upload your ID/passport and proof of residence for admin approval."
        : "Upload your driver's licence, PDP, and vehicle inspection for admin approval.";
    res.json({
      message: `Runner application submitted. ${verificationHint}`,
      user: userJson,
    });
  } catch (err) {
    next(err);
  }
});

// Get current user profile
router.get("/me", async (req: any, res: Response, next) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) throw new AppError("Authentication required", 401);

    const decoded = jwt.verify(token, getJwtSecret()) as { userId: string };

    await syncUserPhoneLocale(decoded.userId);
    const user = await User.findById(decoded.userId).select("-passwordHash");
    if (!user) throw new AppError("User not found", 404);

    const json = user.toJSON() as Record<string, unknown>;
    const clientUser = await applyResolvedAvatarToUserPayload(
      sanitizeUserForClient(json) as Record<string, unknown>,
      UPLOADS_ROOT
    );
    res.json({ user: clientUser });
  } catch (err) {
    next(err);
  }
});

export default router;
