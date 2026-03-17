/**
 * Webhooks for external suppliers (CJ, Spocket, EPROLO)
 * Order status and tracking updates
 */

import express, { Request, Response } from "express";
import Order from "../data/models/Order";
import { logger } from "../services/monitoring";

const router = express.Router();

router.use(express.json());

/** CJ Dropshipping webhook – order status, tracking */
router.post("/cj", async (req: Request, res: Response) => {
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { orderId, orderNumber, trackingNumber, trackingStatus, trackingUrl } = body;

    if (!orderNumber && !orderId) {
      return res.status(400).json({ error: "Missing orderNumber or orderId" });
    }

    const qmOrderId = typeof orderNumber === "string" && orderNumber.startsWith("QM-")
      ? orderNumber.replace("QM-", "")
      : null;

    if (qmOrderId) {
      const mongoose = await import("mongoose");
      const order = mongoose.Types.ObjectId.isValid(qmOrderId) && qmOrderId.length === 24
        ? await Order.findById(qmOrderId)
        : null;
      if (order) {
        const updates: Record<string, unknown> = {};
        if (trackingNumber) {
          (updates as any)["delivery.trackingNo"] = trackingNumber;
        }
        if (trackingUrl) {
          (updates as any)["delivery.trackingUrl"] = trackingUrl;
        }
        if (trackingStatus) {
          (updates as any)["delivery.carrier"] = body.logisticName || body.carrier;
        }
        if (["shipped", "delivered", "in_transit"].includes(String(trackingStatus).toLowerCase())) {
          (updates as any).status = "shipped";
        }
        if (String(trackingStatus).toLowerCase() === "delivered") {
          (updates as any).status = "delivered";
        }
        if (Object.keys(updates).length > 0) {
          await Order.updateOne({ _id: qmOrderId }, { $set: updates });
          logger.info("CJ webhook: order updated", { orderId: qmOrderId, trackingNumber, trackingStatus });
        }
      }
    }

    return res.status(200).json({ received: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("CJ webhook error", { error: msg });
    return res.status(500).json({ error: "Webhook processing failed", details: msg });
  }
});

/** Spocket webhook – placeholder */
router.post("/spocket", async (req: Request, res: Response) => {
  return res.status(200).json({ received: true });
});

/** EPROLO webhook – placeholder */
router.post("/eprolo", async (req: Request, res: Response) => {
  return res.status(200).json({ received: true });
});

export default router;
