// Password reset routes
import express, { Request, Response } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import User from "../data/models/User";
import AuditLog from "../data/models/AuditLog";
import { passwordResetRequestSchema, passwordResetSchema } from "../utils/validators";
import { AppError } from "../middleware/errorHandler";
import nodemailer from "nodemailer";
import { normalizePhone } from "../utils/phoneValidation";
import { sendSms } from "../services/otpDelivery";
import { isValidForOtp } from "../utils/phoneValidation";
import { passwordResetLimiter } from "../middleware/rateLimit";

const router = express.Router();

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// Request password reset
// In-memory per-phone reset throttles (use Redis in production multi-instance)
const RESET_PHONE_COOLDOWN_MS = 3 * 60 * 1000;
const RESET_PHONE_DAILY_CAP = 3;
const resetPhoneLastSent = new Map<string, number>();
const resetPhoneDailyCount = new Map<string, { count: number; date: string }>();

function getPhoneResetLimits(normalizedPhone: string): { allowed: boolean; reason?: string } {
  const now = Date.now();
  const last = resetPhoneLastSent.get(normalizedPhone);
  if (last && now - last < RESET_PHONE_COOLDOWN_MS) {
    const waitSec = Math.ceil((RESET_PHONE_COOLDOWN_MS - (now - last)) / 1000);
    return { allowed: false, reason: `Please wait ${waitSec} seconds before requesting another reset link` };
  }
  const today = new Date().toISOString().slice(0, 10);
  const entry = resetPhoneDailyCount.get(normalizedPhone);
  if (entry) {
    if (entry.date !== today) {
      resetPhoneDailyCount.delete(normalizedPhone);
    } else if (entry.count >= RESET_PHONE_DAILY_CAP) {
      return { allowed: false, reason: "Daily reset limit reached for this number. Try again tomorrow." };
    }
  }
  return { allowed: true };
}

function recordPhoneResetSent(normalizedPhone: string): void {
  resetPhoneLastSent.set(normalizedPhone, Date.now());
  const today = new Date().toISOString().slice(0, 10);
  const entry = resetPhoneDailyCount.get(normalizedPhone);
  if (!entry || entry.date !== today) {
    resetPhoneDailyCount.set(normalizedPhone, { count: 1, date: today });
  } else {
    entry.count++;
  }
}

router.post("/forgot", passwordResetLimiter, async (req: Request, res: Response, next) => {
  try {
    const { error } = passwordResetRequestSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);

    const rawIdentifier = String(req.body.identifier || req.body.email || "").trim();
    const preferredChannel = String(req.body.channel || "auto").toLowerCase();
    const looksLikeEmail = rawIdentifier.includes("@");
    const normalized = normalizePhone(rawIdentifier);
    const email = looksLikeEmail ? rawIdentifier.toLowerCase() : "";
    const phone = !looksLikeEmail ? normalized : "";
    if (!looksLikeEmail) {
      const phoneCheck = isValidForOtp(phone);
      if (!phoneCheck.valid) throw new AppError(phoneCheck.reason || "Invalid phone number", 400);
      const limitCheck = getPhoneResetLimits(phone);
      if (!limitCheck.allowed) throw new AppError(limitCheck.reason || "Too many reset requests", 429);
    }

    const user = await User.findOne(
      looksLikeEmail
        ? { email }
        : {
            $or: [{ phone }, { phone: rawIdentifier }],
          }
    );
    if (!user) {
      // Don't reveal if email exists
      res.json({ message: "If that email exists, a reset link has been sent" });
      return;
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenExpires = Date.now() + 3600000; // 1 hour

    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = resetTokenExpires;
    await user.save();

    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

    const userEmail = String(user.email || "").trim().toLowerCase();
    const userPhone = String((user as any).phone || "").trim();
    const shouldUsePhone =
      preferredChannel === "sms" ||
      preferredChannel === "whatsapp" ||
      (preferredChannel === "auto" && !looksLikeEmail);
    const waOrSmsChannel = preferredChannel === "sms" ? "sms" : "whatsapp";
    let delivered = false;

    if (shouldUsePhone && userPhone) {
      await sendSms({
        phone: userPhone,
        channel: waOrSmsChannel,
        text: `ACBPayWallet password reset: ${resetUrl} (expires in 1 hour). If you did not request this, ignore this message.`,
      }).catch(() => {});
      delivered = true;
      recordPhoneResetSent(normalizePhone(userPhone));
    }

    if (!delivered && userEmail) {
      await transporter.sendMail({
        from: process.env.SMTP_USER,
        to: userEmail,
        subject: "Password Reset Request",
        html: `
          <h1>Password Reset Request</h1>
          <p>You requested a password reset. Click the link below to reset your password:</p>
          <a href="${resetUrl}">${resetUrl}</a>
          <p>This link expires in 1 hour.</p>
          <p>If you didn't request this, please ignore this email.</p>
        `,
      });
      delivered = true;
    }

    await AuditLog.create({
      action: "PASSWORD_RESET_REQUESTED",
      user: user._id,
      meta: { email: user.email, phone: (user as any).phone, channel: preferredChannel, delivered },
    });

    res.json({ message: "If that account exists, a reset link has been sent" });
  } catch (err) {
    next(err);
  }
});

// Reset password with token
router.post("/reset", async (req: Request, res: Response, next) => {
  try {
    const { error } = passwordResetSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);

    const { token, newPassword } = req.body;

    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      throw new AppError("Invalid or expired reset token", 400);
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    user.passwordHash = passwordHash;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    await AuditLog.create({
      action: "PASSWORD_RESET_COMPLETED",
      user: user._id,
      meta: { email: user.email },
    });

    res.json({ message: "Password reset successful" });
  } catch (err) {
    next(err);
  }
});

export default router;
