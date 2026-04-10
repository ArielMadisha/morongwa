// Authentication routes (register, login)
import express, { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import User from "../data/models/User";
import Wallet from "../data/models/Wallet";
import AuditLog from "../data/models/AuditLog";
import { registerSchema, loginSchema, sendOtpSchema, verifyOtpSchema } from "../utils/validators";
import { authLimiter, otpSendLimiter, registerLimiter } from "../middleware/rateLimit";
import { AppError } from "../middleware/errorHandler";
import { authenticate, AuthRequest } from "../middleware/auth";
import { sendOtpCode } from "../services/otpDelivery";
import { isValidForOtp, normalizePhone } from "../utils/phoneValidation";
import { computePhoneLocale } from "../utils/phoneCountryCurrency";

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
const OTP_SECRET = process.env.OTP_SECRET || "otp-secret-change-me";
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

// OTP provider health (safe, no secret values returned)
router.get("/otp-health", (_req: Request, res: Response) => {
  const hasSid = !!process.env.TWILIO_ACCOUNT_SID;
  const hasToken = !!process.env.TWILIO_AUTH_TOKEN;
  const hasSmsFrom = !!process.env.TWILIO_SMS_FROM;
  const hasWhatsappFrom = !!process.env.TWILIO_WHATSAPP_FROM;
  const twilioConfigured = hasSid && hasToken;

  res.json({
    data: {
      provider: "twilio",
      configured: twilioConfigured,
      smsReady: twilioConfigured && hasSmsFrom,
      whatsappReady: twilioConfigured && hasWhatsappFrom,
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
    const normalized = normalizePhone(phone);
    if (normalized.length < 10) throw new AppError("Invalid phone number", 400);

    const phoneCheck = isValidForOtp(phone);
    if (!phoneCheck.valid) throw new AppError(phoneCheck.reason || "Invalid phone", 400);

    const limitCheck = getPhoneOtpLimits(normalized);
    if (!limitCheck.allowed) throw new AppError(limitCheck.reason || "Too many requests", 429);

    const otp = crypto.randomInt(100000, 999999).toString();
    const otpHash = crypto.createHmac("sha256", OTP_SECRET).update(otp).digest("hex");
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
    const normalized = phone.replace(/\D/g, "");

    const stored = otpStore.get(normalized);
    if (!stored) throw new AppError("OTP expired or invalid", 400);
    if (Date.now() > stored.expiresAt) {
      otpStore.delete(normalized);
      throw new AppError("OTP expired", 400);
    }

    const otpHash = crypto.createHmac("sha256", OTP_SECRET).update(otp).digest("hex");
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
    const otpToken = jwt.sign({ phone: normalized, verified: true }, OTP_SECRET, { expiresIn: "10m" });
    res.json({ verified: true, otpToken });
  } catch (err) {
    next(err);
  }
});

// Register a new user
router.post("/register", registerLimiter, async (req: Request, res: Response, next) => {
  try {
    const { error } = registerSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);

    const { name, email, password, role, dateOfBirth, username, otpToken, phone: phoneRaw } = req.body;

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

    if (otpToken) {
      try {
        const decoded = jwt.verify(otpToken, OTP_SECRET) as { phone: string };
        finalPhone = decoded.phone;
        finalEmail = `wa_${decoded.phone}@morongwa.local`;
      } catch {
        throw new AppError("Invalid or expired verification. Please verify your phone again.", 400);
      }
    } else if (email) {
      finalEmail = email.toLowerCase();
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

    const userData: any = {
      name,
      email: finalEmail,
      passwordHash,
      role: validRoles,
    };
    if (dateOfBirth) userData.dateOfBirth = new Date(dateOfBirth);
    userData.username = finalUsername;
    if (finalPhone) userData.phone = finalPhone;
    if (finalPhone) {
      const loc = computePhoneLocale(finalPhone);
      if (loc.countryCode) Object.assign(userData, loc);
    }
    const user = await User.create(userData);

    // Create wallet for user
    await Wallet.create({ user: user._id });

    // Audit log
    await AuditLog.create({
      action: "USER_REGISTERED",
      user: user._id,
      meta: { email: user.email, role: user.role },
    });

    const jwtSecret = process.env.JWT_SECRET || "default-secret-change-me";
    const token = jwt.sign({ userId: user._id }, jwtSecret, { expiresIn: "7d" });

    const fresh = await User.findById(user._id).select("-passwordHash").lean();

    res.status(201).json({
      message: "User registered successfully",
      token,
      user: {
        id: fresh?._id,
        _id: fresh?._id,
        name: fresh?.name,
        email: fresh?.email,
        username: (fresh as any)?.username,
        role: fresh?.role,
        phone: (fresh as any)?.phone,
        countryCode: (fresh as any)?.countryCode,
        preferredCurrency: (fresh as any)?.preferredCurrency,
      },
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
      const normalized = phone.replace(/\D/g, "");
      user = await User.findOne({ $or: [{ phone: normalized }, { email: `wa_${normalized}@morongwa.local` }] });
    } else if (username) {
      user = await User.findOne({ username: username.trim().toLowerCase() });
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

    if (user.phone && (!(user as any).countryCode || !(user as any).preferredCurrency)) {
      const loc = computePhoneLocale(user.phone);
      if (loc.countryCode) {
        await User.updateOne({ _id: user._id }, { $set: loc });
        (user as any).countryCode = loc.countryCode;
        (user as any).preferredCurrency = loc.preferredCurrency;
      }
    }

    const jwtSecret = process.env.JWT_SECRET || "default-secret-change-me";
    const token = jwt.sign({ userId: user._id }, jwtSecret, { expiresIn: "7d" });

    await AuditLog.create({
      action: "USER_LOGIN",
      user: user._id,
      meta: { email: user.email },
    });

    res.json({
      message: "Login successful",
      token,
      user: {
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
        preferredCurrency: (user as any).preferredCurrency,
      },
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

    user.role = [...roles, "runner"];
    await user.save();

    await AuditLog.create({
      action: "RUNNER_APPLICATION",
      user: user._id,
      meta: { requestedAt: new Date() },
    });

    const userJson = user.toJSON ? user.toJSON() : user.toObject ? user.toObject() : user;
    res.json({
      message: "Runner application submitted. Complete verification (PDP, criminal record, vehicle) for admin approval.",
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

    const jwtSecret = process.env.JWT_SECRET || "default-secret-change-me";
    const decoded = jwt.verify(token, jwtSecret) as { userId: string };

    await syncUserPhoneLocale(decoded.userId);
    const user = await User.findById(decoded.userId).select("-passwordHash");
    if (!user) throw new AppError("User not found", 404);

    res.json({ user: user.toJSON() });
  } catch (err) {
    next(err);
  }
});

export default router;
