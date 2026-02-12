// Authentication routes (register, login)
import express, { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../data/models/User";
import Wallet from "../data/models/Wallet";
import AuditLog from "../data/models/AuditLog";
import { registerSchema, loginSchema } from "../utils/validators";
import { authLimiter } from "../middleware/rateLimit";
import { AppError } from "../middleware/errorHandler";
import { authenticate, AuthRequest } from "../middleware/auth";

const router = express.Router();

// Register a new user
router.post("/register", authLimiter, async (req: Request, res: Response, next) => {
  try {
    const { error } = registerSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);

    const { name, email, password, role } = req.body;

    // Restrict admin and superadmin roles from public registration
    if (role && (role === "admin" || role === "superadmin")) {
      throw new AppError("Cannot register with admin or superadmin role", 403);
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      throw new AppError("Email already registered", 400);
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

    const user = await User.create({
      name,
      email: email.toLowerCase(),
      passwordHash,
      role: validRoles,
    });

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

    const { email, password } = req.body;

    const user = await User.findOne({ email: email.toLowerCase() });
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
