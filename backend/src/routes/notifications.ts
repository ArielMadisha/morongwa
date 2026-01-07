// Notification routes
import express, { Response } from "express";
import Notification from "../data/models/Notification";
import { authenticate, AuthRequest, authorize } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { getPaginationParams } from "../utils/helpers";
import { sendNotification, sendBroadcastNotification } from "../services/notification";

const router = express.Router();

// Get notifications for current user
router.get("/", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const { page, limit, read } = req.query;
    const { skip, limit: limitNum } = getPaginationParams(
      page ? parseInt(page as string) : undefined,
      limit ? parseInt(limit as string) : undefined
    );

    const query: any = { user: req.user!._id };
    if (read !== undefined) {
      query.read = read === "true";
    }

    const [notifications, total] = await Promise.all([
      Notification.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
      Notification.countDocuments(query),
    ]);

    res.json({
      notifications,
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

// Get unread notification count
router.get("/unread/count", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const count = await Notification.countDocuments({
      user: req.user!._id,
      read: false,
    });

    res.json({ unreadCount: count });
  } catch (err) {
    next(err);
  }
});

// Mark notification as read
router.post("/:id/read", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const notification = await Notification.findById(req.params.id);
    if (!notification) throw new AppError("Notification not found", 404);

    if (notification.user?.toString() !== req.user!._id.toString()) {
      throw new AppError("Unauthorized", 403);
    }

    notification.read = true;
    notification.readAt = new Date();
    await notification.save();

    res.json({ message: "Notification marked as read", notification });
  } catch (err) {
    next(err);
  }
});

// Mark all notifications as read
router.post("/read-all", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    await Notification.updateMany(
      { user: req.user!._id, read: false },
      { read: true, readAt: new Date() }
    );

    res.json({ message: "All notifications marked as read" });
  } catch (err) {
    next(err);
  }
});

// Send broadcast notification (admin only)
router.post(
  "/broadcast",
  authenticate,
  authorize("admin", "superadmin"),
  async (req: AuthRequest, res: Response, next) => {
    try {
      const { message, type, roles } = req.body;

      if (!message || !type) {
        throw new AppError("Message and type are required", 400);
      }

      await sendBroadcastNotification(message, type, roles);

      res.json({ message: "Broadcast notification sent successfully" });
    } catch (err) {
      next(err);
    }
  }
);

// Delete notification
router.delete("/:id", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const notification = await Notification.findById(req.params.id);
    if (!notification) throw new AppError("Notification not found", 404);

    if (notification.user?.toString() !== req.user!._id.toString()) {
      throw new AppError("Unauthorized", 403);
    }

    await notification.deleteOne();

    res.json({ message: "Notification deleted successfully" });
  } catch (err) {
    next(err);
  }
});

export default router;
