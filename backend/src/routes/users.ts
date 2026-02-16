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

    const { name, isPrivate, avatar, stripBackgroundPic } = req.body;
    const updates: any = {};
    if (name) updates.name = name;
    if (typeof isPrivate === "boolean") updates.isPrivate = isPrivate;
    if (typeof avatar === "string" && avatar.trim()) updates.avatar = avatar.trim();
    if (typeof stripBackgroundPic === "string") updates.stripBackgroundPic = stripBackgroundPic.trim() || null;

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

// Go live / end live (toggle isLive)
router.patch("/:id/live", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    if (req.user?._id.toString() !== req.params.id) {
      throw new AppError("Unauthorized", 403);
    }
    const user = await User.findById(req.params.id);
    if (!user) throw new AppError("User not found", 404);
    (user as any).isLive = !(user as any).isLive;
    await user.save();
    res.json({ message: (user as any).isLive ? "You are now live" : "Live ended", isLive: (user as any).isLive });
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

// Set avatar from existing URL (e.g. from wall post image)
router.patch("/:id/avatar-url", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    if (req.user?._id.toString() !== req.params.id) throw new AppError("Unauthorized", 403);
    const { url } = req.body;
    if (!url || typeof url !== "string" || !url.trim()) throw new AppError("URL required", 400);
    const user = await User.findByIdAndUpdate(req.params.id, { avatar: url.trim() }, { new: true }).select("-passwordHash");
    if (!user) throw new AppError("User not found", 404);
    await AuditLog.create({ action: "AVATAR_UPDATED", user: user._id, meta: { avatar: url } });
    res.json({ message: "Profile picture updated", avatar: url, user });
  } catch (err) {
    next(err);
  }
});

// Upload strip background
router.post(
  "/:id/strip-background",
  authenticate,
  upload.single("image"),
  async (req: AuthRequest, res: Response, next) => {
    try {
      if (req.user?._id.toString() !== req.params.id) throw new AppError("Unauthorized", 403);
      if (!req.file) throw new AppError("No file uploaded", 400);
      const url = `/uploads/${req.file.filename}`;
      const user = await User.findByIdAndUpdate(req.params.id, { stripBackgroundPic: url }, { new: true }).select("-passwordHash");
      if (!user) throw new AppError("User not found", 404);
      await AuditLog.create({ action: "STRIP_BACKGROUND_UPDATED", user: user._id, meta: { stripBackgroundPic: url } });
      res.json({ message: "Strip background updated", stripBackgroundPic: url, user });
    } catch (err) {
      next(err);
    }
  }
);

// Upload vehicle (runner) - add vehicle with documents (max 3 vehicles per user)
router.post(
  "/:id/vehicles",
  authenticate,
  upload.array("documents", 5),
  async (req: AuthRequest, res: Response, next) => {
    try {
      if (req.user?._id.toString() !== req.params.id) {
        throw new AppError("Unauthorized", 403);
      }

      const user = await User.findById(req.params.id);
      if (!user) throw new AppError("User not found", 404);

      // Only runners should upload vehicles (but allow role addition later)
      if (!user.role.includes('runner')) {
        throw new AppError("Only runners may register vehicles", 403);
      }

      // Ensure max 3 vehicles
      const existing = (user.vehicles || []).length;
      if (existing >= 3) {
        throw new AppError("Maximum of 3 vehicles allowed", 400);
      }

      const { make, model, plate } = req.body;
      const files = (req.files as Express.Multer.File[]) || [];

      const vehicle = {
        make: make || undefined,
        model: model || undefined,
        plate: plate || undefined,
        documents: files.map((f) => ({ filename: f.filename, path: `/uploads/${f.filename}`, uploadedAt: new Date() })),
        verified: false,
      };

      user.vehicles = [...(user.vehicles || []), vehicle] as any;
      await user.save();

      await AuditLog.create({ action: 'VEHICLE_ADDED', user: user._id, meta: { plate, make, model } });

      res.status(201).json({ message: 'Vehicle uploaded successfully', vehicle });
    } catch (err) {
      next(err);
    }
  }
);

// Upload PDP (Professional Driving Permit) for runner
router.post('/:id/pdp', authenticate, upload.single('pdp'), async (req: AuthRequest, res: Response, next) => {
  try {
    if (req.user?._id.toString() !== req.params.id) {
      throw new AppError('Unauthorized', 403);
    }

    const user = await User.findById(req.params.id);
    if (!user) throw new AppError('User not found', 404);

    if (!req.file) throw new AppError('No file uploaded', 400);

    user.pdp = { filename: req.file.filename, path: `/uploads/${req.file.filename}`, uploadedAt: new Date(), verified: false } as any;
    await user.save();

    await AuditLog.create({ action: 'PDP_UPLOADED', user: user._id, meta: { file: user.pdp?.path || null } });

    res.json({ message: 'PDP uploaded successfully', pdp: user.pdp });
  } catch (err) {
    next(err);
  }
});

// Update runner location (geotracking) - runner posts their coordinates
router.patch('/:id/location', authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    if (req.user?._id.toString() !== req.params.id) {
      throw new AppError('Unauthorized', 403);
    }

    const { latitude, longitude } = req.body;
    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      throw new AppError('Invalid coordinates', 400);
    }

    const user = await User.findById(req.params.id);
    if (!user) throw new AppError('User not found', 404);

    user.location = { type: 'Point', coordinates: [longitude, latitude], updatedAt: new Date() } as any;
    await user.save();

    // Emit location update over Socket.IO to clients of assigned tasks
    try {
      const { emitRunnerLocation } = require('../services/notification');
      await emitRunnerLocation(user._id.toString(), user.location as any);
    } catch (emitErr) {
      // non-fatal - continue
    }

    await AuditLog.create({ action: 'LOCATION_UPDATED', user: user._id, meta: { latitude, longitude } });

    res.json({ message: 'Location updated', location: user.location });
  } catch (err) {
    next(err);
  }
});

// Delete user account
router.delete("/:id", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const isAdmin = (r: any) => Array.isArray(r) ? r.includes('admin') : r === 'admin';
    if (req.user?._id.toString() !== req.params.id && !isAdmin(req.user?.role)) {
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
    if (req.query.role) query.role = { $in: [req.query.role] };

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

// Add or remove roles for current user
router.post("/:id/roles", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    if (req.user?._id.toString() !== req.params.id) {
      throw new AppError("Unauthorized", 403);
    }

    const { action, role } = req.body; // action: 'add' or 'remove', role: 'client' or 'runner'

    if (!['add', 'remove'].includes(action)) {
      throw new AppError("Invalid action. Use 'add' or 'remove'", 400);
    }

    if (!['client', 'runner'].includes(role)) {
      throw new AppError("Invalid role. Use 'client' or 'runner'", 400);
    }

    const user = await User.findById(req.params.id);
    if (!user) throw new AppError("User not found", 404);

    if (action === 'add') {
      // Add role if not already present
      if (!user.role.includes(role as any)) {
        user.role.push(role as any);
      }
    } else {
      // Remove role, but ensure at least one role remains
      if (user.role.length > 1) {
        user.role = user.role.filter(r => r !== role) as any;
      } else {
        throw new AppError("Cannot remove last role. User must have at least one role", 400);
      }
    }

    await user.save();

    await AuditLog.create({
      action: "USER_ROLE_UPDATED",
      user: user._id,
      meta: { action, role, newRoles: user.role },
    });

    res.json({ 
      message: `Role ${action === 'add' ? 'added' : 'removed'} successfully`, 
      roles: user.role 
    });
  } catch (err) {
    next(err);
  }
});

export default router;
