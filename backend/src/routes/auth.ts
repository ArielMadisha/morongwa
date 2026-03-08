// Authentication routes (register, login)
import express, { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import User from "../data/models/User";
import Wallet from "../data/models/Wallet";
import AuditLog from "../data/models/AuditLog";
import { registerSchema, loginSchema, sendOtpSchema, verifyOtpSchema } from "../utils/validators";
import { authLimiter } from "../middleware/rateLimit";
import { AppError } from "../middleware/errorHandler";
import { authenticate, AuthRequest } from "../middleware/auth";

const router = express.Router();

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

// Send OTP via SMS or WhatsApp (stub - integrate Twilio for SMS, WhatsApp Cloud API for WhatsApp)
router.post("/send-otp", authLimiter, async (req: Request, res: Response, next) => {
  try {
    const { error } = sendOtpSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);
    const { phone, channel = "whatsapp" } = req.body;
    const normalized = phone.replace(/\D/g, "");
    if (normalized.length < 10) throw new AppError("Invalid phone number", 400);

    const otp = crypto.randomInt(100000, 999999).toString();
    const otpHash = crypto.createHmac("sha256", OTP_SECRET).update(otp).digest("hex");
    otpStore.set(normalized, { otpHash, expiresAt: Date.now() + OTP_EXPIRY_MS });

    // TODO: Integrate Twilio (SMS) and WhatsApp Cloud API to send OTP
    // For dev, log OTP (remove in production)
    if (process.env.NODE_ENV !== "production") {
      console.log(`[DEV] OTP for ${normalized} (${channel}): ${otp}`);
    }

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
    if (otpHash !== stored.otpHash) throw new AppError("Invalid OTP", 400);

    otpStore.delete(normalized);
    const otpToken = jwt.sign({ phone: normalized, verified: true }, OTP_SECRET, { expiresIn: "10m" });
    res.json({ verified: true, otpToken });
  } catch (err) {
    next(err);
  }
});

// Register a new user
router.post("/register", authLimiter, async (req: Request, res: Response, next) => {
  try {
    const { error } = registerSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);

    const { name, email, password, role, dateOfBirth, username, phone, otpToken } = req.body;

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

    res.status(201).json({
      message: "User registered successfully",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        username: (user as any).username,
        role: user.role,
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
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        stripBackgroundPic: (user as any).stripBackgroundPic,
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

    const user = await User.findById(decoded.userId).select("-passwordHash");
    if (!user) throw new AppError("User not found", 404);

    res.json({ user });
  } catch (err) {
    next(err);
  }
});

export default router;
