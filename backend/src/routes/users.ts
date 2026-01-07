// User management routes
import express, { Response } from "express";
import User from "../data/models/User";
import AuditLog from "../data/models/AuditLog";
import { authenticate, AuthRequest } from "../middleware/auth";
import { upload } from "../middleware/upload";
import { AppError } from "../middleware/errorHandler";
import { getPaginationParams } from "../utils/helpers";

const router = express.Router();

// Get user profile
router.get("/:id", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const user = await User.findById(req.params.id).select("-passwordHash");
    if (!user) throw new AppError("User not found", 404);

    res.json({ user });
  } catch (err) {
    next(err);
  }
});

// Update user profile
router.put("/:id", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    if (req.user?._id.toString() !== req.params.id) {
      throw new AppError("Unauthorized", 403);
    }

    const { name } = req.body;
    const updates: any = {};
    if (name) updates.name = name;

    const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true }).select(
      "-passwordHash"
    );

    if (!user) throw new AppError("User not found", 404);

    await AuditLog.create({
      action: "USER_UPDATED",
      user: user._id,
      meta: { updates },
    });

    res.json({ message: "Profile updated successfully", user });
  } catch (err) {
    next(err);
  }
});

// Upload avatar
router.post(
  "/:id/avatar",
  authenticate,
  upload.single("avatar"),
  async (req: AuthRequest, res: Response, next) => {
    try {
      if (req.user?._id.toString() !== req.params.id) {
        throw new AppError("Unauthorized", 403);
      }

      if (!req.file) throw new AppError("No file uploaded", 400);

      const avatarPath = `/uploads/${req.file.filename}`;

      const user = await User.findByIdAndUpdate(
        req.params.id,
        { avatar: avatarPath },
        { new: true }
      ).select("-passwordHash");

      if (!user) throw new AppError("User not found", 404);

      await AuditLog.create({
        action: "AVATAR_UPDATED",
        user: user._id,
        meta: { avatar: avatarPath },
      });

      res.json({ message: "Avatar uploaded successfully", avatar: avatarPath, user });
    } catch (err) {
      next(err);
    }
  }
);

// Delete user account
router.delete("/:id", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    if (req.user?._id.toString() !== req.params.id && req.user?.role !== "admin") {
      throw new AppError("Unauthorized", 403);
    }

    const user = await User.findByIdAndUpdate(req.params.id, { active: false }, { new: true });

    if (!user) throw new AppError("User not found", 404);

    await AuditLog.create({
      action: "USER_DELETED",
      user: user._id,
      meta: { deletedBy: req.user?._id },
    });

    res.json({ message: "User account deactivated successfully" });
  } catch (err) {
    next(err);
  }
});

// List users (with pagination)
router.get("/", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const { page, limit } = req.query;
    const { skip, limit: limitNum } = getPaginationParams(
      page ? parseInt(page as string) : undefined,
      limit ? parseInt(limit as string) : undefined
    );

    const query: any = { active: true };
    if (req.query.role) query.role = req.query.role;

    const [users, total] = await Promise.all([
      User.find(query).select("-passwordHash").skip(skip).limit(limitNum),
      User.countDocuments(query),
    ]);

    res.json({
      users,
      pagination: {
        total,
        page: Math.floor(skip / limitNum) + 1,
        limit: limitNum,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
