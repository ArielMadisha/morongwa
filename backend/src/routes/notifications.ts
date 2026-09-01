// Notification routes
import express, { Response } from "express";
import Notification from "../data/models/Notification";
import { authenticate, AuthRequest, authorize } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { getPaginationParams } from "../utils/helpers";
import { sendBroadcastNotification } from "../services/notification";
import {
  isExpoPushToken,
  removeUserExpoPushToken,
  upsertUserExpoPushToken,
} from "../services/expoPush";
import { SHOP_ORDER_NOTIFICATION_TYPES } from "../services/shopOwnerOrderNotify";
import { listApprovedSupplierProfilesForUser } from "../utils/supplierAccess";

const router = express.Router();

function parseShopOrdersQuery(req: AuthRequest): boolean {
  const q = req.query as { shopOrders?: string; types?: string };
  return q.shopOrders === "1" || q.shopOrders === "true" || String(q.types || "").includes("food_shop_order");
}

function shopOrderTypeFilter(): { type: { $in: string[] } } {
  return { type: { $in: [...SHOP_ORDER_NOTIFICATION_TYPES] } };
}

/**
 * Register / refresh an Expo push token for the authenticated user.
 * Used by Qwertymates mobile so food/grocery store owners can receive new-order pushes.
 */
router.post("/push-token", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const token = String((req.body as { token?: string })?.token || "").trim();
    const platform = String((req.body as { platform?: string })?.platform || "").trim();
    const deviceId = String((req.body as { deviceId?: string })?.deviceId || "").trim();
    if (!token || !isExpoPushToken(token)) {
      throw new AppError("Valid Expo push token is required", 400);
    }
    const result = await upsertUserExpoPushToken({
      userId: req.user!._id.toString(),
      token,
      platform: platform || undefined,
      deviceId: deviceId || undefined,
    });
    res.json({ ok: true, tokenCount: result.count });
  } catch (err) {
    next(err);
  }
});

/** Remove a device push token (logout / permission revoked). */
router.delete("/push-token", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const token = String(
      (req.body as { token?: string })?.token || (req.query as { token?: string })?.token || ""
    ).trim();
    if (!token) throw new AppError("token is required", 400);
    const result = await removeUserExpoPushToken({
      userId: req.user!._id.toString(),
      token,
    });
    res.json({ ok: true, tokenCount: result.count });
  } catch (err) {
    next(err);
  }
});

// Get notifications for current user
router.get("/", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const { page, limit, read, types, shopOrders } = req.query;
    const { skip, limit: limitNum } = getPaginationParams(
      page ? parseInt(page as string) : undefined,
      limit ? parseInt(limit as string) : undefined
    );

    const query: Record<string, unknown> = { user: req.user!._id };
    if (read !== undefined) {
      query.read = read === "true";
    }

    const typeList = String(types || "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (shopOrders === "1" || shopOrders === "true") {
      // Shop-owner inbox: only order types, and only if caller owns a store.
      const profiles = await listApprovedSupplierProfilesForUser(req.user!._id.toString());
      if (!profiles.length) {
        res.json({
          notifications: [],
          pagination: { total: 0, page: 1, limit: limitNum, pages: 0 },
          isShopOwner: false,
        });
        return;
      }
      Object.assign(query, shopOrderTypeFilter());
    } else if (typeList.length) {
      query.type = { $in: typeList };
    } else {
      // Activity feed: hide email/whatsapp/sms delivery stubs (they duplicated order alerts).
      query.channel = { $in: ["realtime", "broadcast", "push"] };
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
      isShopOwner: shopOrders === "1" || shopOrders === "true" ? true : undefined,
    });
  } catch (err) {
    next(err);
  }
});

// Get unread notification count
router.get("/unread/count", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const shopOrders = parseShopOrdersQuery(req);
    const query: Record<string, unknown> = {
      user: req.user!._id,
      read: false,
    };
    if (shopOrders) {
      const profiles = await listApprovedSupplierProfilesForUser(req.user!._id.toString());
      if (!profiles.length) {
        res.json({ unreadCount: 0, shopOrderUnreadCount: 0, isShopOwner: false });
        return;
      }
      Object.assign(query, shopOrderTypeFilter());
      const count = await Notification.countDocuments(query);
      res.json({ unreadCount: count, shopOrderUnreadCount: count, isShopOwner: true });
      return;
    }

    const [unreadCount, shopOrderUnreadCount, profiles] = await Promise.all([
      Notification.countDocuments({
        ...query,
        channel: { $in: ["realtime", "broadcast", "push"] },
      }),
      Notification.countDocuments({
        user: req.user!._id,
        read: false,
        ...shopOrderTypeFilter(),
      }),
      listApprovedSupplierProfilesForUser(req.user!._id.toString()),
    ]);

    res.json({
      unreadCount,
      shopOrderUnreadCount: profiles.length ? shopOrderUnreadCount : 0,
      isShopOwner: profiles.length > 0,
    });
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
    const shopOrders =
      (req.query as { shopOrders?: string }).shopOrders === "1" ||
      (req.query as { shopOrders?: string }).shopOrders === "true" ||
      (req.body as { shopOrders?: boolean | string })?.shopOrders === true ||
      (req.body as { shopOrders?: boolean | string })?.shopOrders === "1";

    const filter: Record<string, unknown> = { user: req.user!._id, read: false };
    if (shopOrders) {
      Object.assign(filter, shopOrderTypeFilter());
    }

    await Notification.updateMany(filter, { read: true, readAt: new Date() });

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
