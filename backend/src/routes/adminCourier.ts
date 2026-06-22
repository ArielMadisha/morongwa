import express, { Response } from "express";
import mongoose from "mongoose";
import CourierProvider from "../data/models/CourierProvider";
import CourierTariff from "../data/models/CourierTariff";
import CourierShipment from "../data/models/CourierShipment";
import Order from "../data/models/Order";
import { AuthRequest } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import AuditLog from "../data/models/AuditLog";
import { ensureCourierCatalogSeed } from "../services/courierSeed";
import { getPaginationParams } from "../utils/helpers";
import { finalizeCourierOnOrderPaid } from "../services/courierOrderHooks";

const router = express.Router();

router.use(async (_req, _res, next) => {
  try {
    await ensureCourierCatalogSeed();
    next();
  } catch (e) {
    next(e);
  }
});

// GET /api/admin/courier/providers
router.get("/providers", async (_req: AuthRequest, res: Response, next) => {
  try {
    const rows = await CourierProvider.find().sort({ sortOrder: 1, name: 1 }).lean();
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/courier/providers
router.post("/providers", async (req: AuthRequest, res: Response, next) => {
  try {
    const { slug, name, coverage, countries, integrationType, pricingNote, active, sortOrder } = req.body ?? {};
    if (!slug || !name || !coverage) throw new AppError("slug, name, coverage required", 400);
    const row = await CourierProvider.create({
      slug: String(slug).trim().toLowerCase(),
      name: String(name).trim(),
      coverage,
      countries: Array.isArray(countries) ? countries.map((c: string) => String(c).toUpperCase()) : [],
      integrationType: integrationType || "tariff_table",
      pricingNote: pricingNote?.trim(),
      active: active !== false,
      sortOrder: Number(sortOrder) || 100,
    });
    res.status(201).json({ data: row });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/admin/courier/providers/:id
router.patch("/providers/:id", async (req: AuthRequest, res: Response, next) => {
  try {
    const row = await CourierProvider.findById(req.params.id);
    if (!row) throw new AppError("Provider not found", 404);
    const b = req.body ?? {};
    if (b.name !== undefined) row.name = String(b.name).trim();
    if (b.coverage !== undefined) row.coverage = b.coverage;
    if (b.countries !== undefined) row.countries = b.countries;
    if (b.integrationType !== undefined) row.integrationType = b.integrationType;
    if (b.pricingNote !== undefined) row.pricingNote = b.pricingNote;
    if (b.active !== undefined) row.active = !!b.active;
    if (b.sortOrder !== undefined) row.sortOrder = Number(b.sortOrder);
    await row.save();
    res.json({ data: row });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/courier/tariffs
router.get("/tariffs", async (req: AuthRequest, res: Response, next) => {
  try {
    const countryCode = req.query.countryCode ? String(req.query.countryCode).toUpperCase() : undefined;
    const match: Record<string, unknown> = {};
    if (countryCode) match.countryCode = countryCode;
    if (req.query.providerId && mongoose.isValidObjectId(String(req.query.providerId))) {
      match.providerId = req.query.providerId;
    }
    const rows = await CourierTariff.find(match)
      .populate("providerId", "name slug coverage")
      .sort({ countryCode: 1, sortOrder: 1, price: 1 })
      .lean();
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/courier/tariffs
router.post("/tariffs", async (req: AuthRequest, res: Response, next) => {
  try {
    const b = req.body ?? {};
    if (!b.providerId || !mongoose.isValidObjectId(String(b.providerId))) {
      throw new AppError("providerId required", 400);
    }
    const row = await CourierTariff.create({
      providerId: b.providerId,
      countryCode: String(b.countryCode || "ZA").toUpperCase(),
      zone: b.zone?.trim(),
      serviceLabel: String(b.serviceLabel || "Standard").trim(),
      minWeightKg: Number(b.minWeightKg) || 0,
      maxWeightKg: Number(b.maxWeightKg) || 5,
      price: Number(b.price),
      currency: String(b.currency || "ZAR").toUpperCase(),
      minDeliveryDays: Number(b.minDeliveryDays) || 3,
      maxDeliveryDays: Number(b.maxDeliveryDays) || 7,
      active: b.active !== false,
      sortOrder: Number(b.sortOrder) || 100,
    });
    res.status(201).json({ data: row });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/admin/courier/tariffs/:id
router.patch("/tariffs/:id", async (req: AuthRequest, res: Response, next) => {
  try {
    const row = await CourierTariff.findById(req.params.id);
    if (!row) throw new AppError("Tariff not found", 404);
    const b = req.body ?? {};
    const fields = [
      "countryCode",
      "zone",
      "serviceLabel",
      "minWeightKg",
      "maxWeightKg",
      "price",
      "currency",
      "minDeliveryDays",
      "maxDeliveryDays",
      "active",
      "sortOrder",
    ] as const;
    for (const f of fields) {
      if (b[f] !== undefined) (row as any)[f] = b[f];
    }
    if (b.countryCode !== undefined) row.countryCode = String(b.countryCode).toUpperCase();
    await row.save();
    res.json({ data: row });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/courier/tariffs/:id
router.delete("/tariffs/:id", async (req: AuthRequest, res: Response, next) => {
  try {
    await CourierTariff.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/courier/shipments
router.get("/shipments", async (req: AuthRequest, res: Response, next) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
    const limit = Math.min(100, parseInt(String(req.query.limit || "50"), 10) || 50);
    const { skip } = getPaginationParams(page, limit);
    const match: Record<string, unknown> = {};
    if (req.query.status) match.status = req.query.status;
    if (req.query.disputeStatus) match.disputeStatus = req.query.disputeStatus;
    if (req.query.q) {
      const q = String(req.query.q).trim();
      if (mongoose.isValidObjectId(q)) {
        match.$or = [{ orderId: q }, { buyerId: q }, { trackingNumber: q }];
      } else if (q.length >= 3) {
        match.trackingNumber = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      }
    }
    const total = await CourierShipment.countDocuments(match);
    const rows = await CourierShipment.find(match)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("buyerId", "name email username")
      .populate("orderId", "status amounts paymentMethod paidAt")
      .lean();
    res.json({
      data: rows,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) || 1 },
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/admin/courier/shipments/:id
router.patch("/shipments/:id", async (req: AuthRequest, res: Response, next) => {
  try {
    const row = await CourierShipment.findById(req.params.id);
    if (!row) throw new AppError("Shipment not found", 404);
    const b = req.body ?? {};
    const prevStatus = row.status;
    if (b.status) {
      row.status = b.status;
      row.statusHistory.push({
        status: b.status,
        note: b.statusNote?.trim(),
        at: new Date(),
        byAdminId: req.user!._id,
      });
    }
    if (b.trackingNumber !== undefined) row.trackingNumber = String(b.trackingNumber).trim() || undefined;
    if (b.trackingUrl !== undefined) row.trackingUrl = String(b.trackingUrl).trim() || undefined;
    if (b.carrierNotes !== undefined) row.carrierNotes = String(b.carrierNotes).trim().slice(0, 2000);
    await row.save();

    if (row.orderId && b.status && ["shipped", "in_transit", "out_for_delivery", "delivered"].includes(b.status)) {
      const order = await Order.findById(row.orderId);
      if (order && order.status === "paid") order.status = b.status === "delivered" ? "delivered" : "shipped";
      if (order) {
        order.delivery = order.delivery || {};
        order.delivery.method = "courier";
        order.delivery.carrier = row.providerName;
        if (row.trackingNumber) order.delivery.trackingNo = row.trackingNumber;
        if (row.trackingUrl) order.delivery.trackingUrl = row.trackingUrl;
        await order.save();
      }
    }

    if (prevStatus !== row.status) {
      await AuditLog.create({
        action: "ADMIN_COURIER_SHIPMENT_UPDATE",
        user: req.user!._id,
        target: row.orderId,
        meta: { shipmentId: String(row._id), status: row.status, trackingNumber: row.trackingNumber },
      });
    }
    res.json({ data: row });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/courier/shipments/:id/dispute
router.post("/shipments/:id/dispute", async (req: AuthRequest, res: Response, next) => {
  try {
    const row = await CourierShipment.findById(req.params.id);
    if (!row) throw new AppError("Shipment not found", 404);
    const action = String(req.body?.action || "open");
    if (action === "open") {
      row.disputeStatus = "open";
      row.disputeReason = String(req.body?.reason || "").trim().slice(0, 2000) || row.disputeReason;
      row.disputeOpenedAt = new Date();
    } else if (action === "investigate") {
      row.disputeStatus = "investigating";
    } else if (action === "resolve") {
      row.disputeStatus = "resolved";
      row.disputeResolution = String(req.body?.resolution || "").trim().slice(0, 2000);
      row.disputeResolvedAt = new Date();
      row.disputeHandledBy = req.user!._id;
    } else if (action === "close") {
      row.disputeStatus = "closed";
      row.disputeResolvedAt = new Date();
      row.disputeHandledBy = req.user!._id;
    } else {
      throw new AppError("Invalid dispute action", 400);
    }
    await row.save();
    await AuditLog.create({
      action: "ADMIN_COURIER_DISPUTE",
      user: req.user!._id,
      target: row.orderId,
      meta: { shipmentId: String(row._id), disputeStatus: row.disputeStatus },
    });
    res.json({ data: row });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/courier/shipments/from-order/:orderId — finalize courier parcel for paid order
router.post("/shipments/from-order/:orderId", async (req: AuthRequest, res: Response, next) => {
  try {
    const order = await Order.findById(req.params.orderId);
    if (!order) throw new AppError("Order not found", 404);
    if (order.status === "pending_payment") {
      throw new AppError("Order is not paid yet — courier is finalized automatically when payment completes", 400);
    }
    await finalizeCourierOnOrderPaid(order._id.toString());
    const row = await CourierShipment.findOne({ orderId: order._id });
    if (!row) throw new AppError("No delivery on this order to finalize", 400);
    res.status(201).json({ data: row });
  } catch (err) {
    next(err);
  }
});

export default router;
