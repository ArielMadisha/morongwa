/**
 * Durable in-app order notifications for store owners (shop owners only).
 * Independent of WhatsApp / Expo push — always persist a Notification row when possible.
 */
import Notification from "../data/models/Notification";
import { sendNotification } from "./notification";
import { logger } from "./monitoring";

export const SHOP_ORDER_NOTIFICATION_TYPES = ["food_shop_order", "shop_order", "order_purchase"] as const;

export type ShopOwnerOrderNotifyType = "food_shop_order" | "shop_order";

export type ShopOwnerOrderMeta = {
  orderId: string;
  supplierId: string;
  orderNumber: string;
  storeName?: string;
  fulfilment?: string;
  url?: string;
  itemSummary?: string;
};

/**
 * Create (or reuse) an in-app Activity notification for the store owner.
 * Idempotent per owner + type + orderId + supplierId.
 */
export async function ensureShopOwnerInAppOrderNotification(params: {
  ownerId: string;
  type: ShopOwnerOrderNotifyType;
  message: string;
  meta: ShopOwnerOrderMeta;
}): Promise<{ notificationId: string | null; created: boolean }> {
  const ownerId = String(params.ownerId || "").trim();
  if (!ownerId) return { notificationId: null, created: false };

  const orderId = String(params.meta.orderId || "").trim();
  const supplierId = String(params.meta.supplierId || "").trim();
  if (!orderId || !supplierId) {
    logger.warn("ensureShopOwnerInAppOrderNotification skipped — missing orderId/supplierId", {
      ownerId,
      orderId,
      supplierId,
    });
    return { notificationId: null, created: false };
  }

  const url = String(params.meta.url || "/store/orders").trim() || "/store/orders";
  const meta: ShopOwnerOrderMeta = {
    ...params.meta,
    orderId,
    supplierId,
    orderNumber: String(params.meta.orderNumber || "").trim(),
    url,
  };

  try {
    const existing = await Notification.findOne({
      user: ownerId,
      type: params.type,
      "meta.orderId": orderId,
      "meta.supplierId": supplierId,
    })
      .select("_id")
      .lean();

    if (existing?._id) {
      return { notificationId: String(existing._id), created: false };
    }

    // Also treat legacy order_purchase without meta as already notified for this order text.
    // Prefer creating the typed row so Activity can deep-link.

    const created = await sendNotification({
      userId: ownerId,
      type: params.type,
      message: params.message,
      channel: "realtime",
      meta,
    });

    return {
      notificationId: created?._id ? String(created._id) : null,
      created: Boolean(created?._id),
    };
  } catch (err) {
    logger.error("ensureShopOwnerInAppOrderNotification failed (non-fatal)", {
      ownerId,
      orderId,
      supplierId,
      error: String((err as Error)?.message || err),
    });
    return { notificationId: null, created: false };
  }
}
