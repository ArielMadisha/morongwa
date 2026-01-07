// Password reset routes
import express, { Request, Response } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import User from "../data/models/User";
import AuditLog from "../data/models/AuditLog";
import { passwordResetRequestSchema, passwordResetSchema } from "../utils/validators";
import { AppError } from "../middleware/errorHandler";
import nodemailer from "nodemailer";

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
router.post("/forgot", async (req: Request, res: Response, next) => {
  try {
    const { error } = passwordResetRequestSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);

    const { email } = req.body;

    const user = await User.findOne({ email: email.toLowerCase() });
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

    await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: user.email,
      subject: "Password Reset Request",
      html: `
        <h1>Password Reset Request</h1>
        <p>You requested a password reset. Click the link below to reset your password:</p>
        <a href="${resetUrl}">${resetUrl}</a>
        <p>This link expires in 1 hour.</p>
        <p>If you didn't request this, please ignore this email.</p>
      `,
    });

    await AuditLog.create({
      action: "PASSWORD_RESET_REQUESTED",
      user: user._id,
      meta: { email: user.email },
    });

    res.json({ message: "If that email exists, a reset link has been sent" });
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
