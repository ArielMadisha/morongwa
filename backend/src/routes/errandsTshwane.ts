/**
 * Mobile + web clients: City of Tshwane errands (coverage, quote, book) — same rules as WhatsApp waFlow.
 */
import express, { Response } from "express";
import { authenticate, AuthRequest, authorize } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { TSHWANE_REGION_ORDER, TSHWANE_TOWNSHIPS, getTshwaneTownshipById } from "../data/tshwaneCoverageAreas";
import {
  quoteLocalErrandTshwane,
  quoteTransportTshwane,
  transportBandFromKg,
  type LocalServiceKey,
} from "../services/errandPricingTshwane";
import {
  createPostedTshwaneErrandTask,
  estimateTshwanePostedFlowPrice,
} from "../services/tshwaneErrandTaskService";
import { isSubstantialLocalErrandDeliveryText, isSubstantialLocalErrandPickupText } from "../utils/tshwaneErrandAddressText";

const router = express.Router();

router.get("/coverage", (_req, res: Response) => {
  res.json({
    regions: TSHWANE_REGION_ORDER,
    townships: TSHWANE_TOWNSHIPS,
  });
});

router.post("/quote", (req, res: Response) => {
  const body = (req.body || {}) as Record<string, unknown>;
  const kind = String(body.kind || "").toLowerCase();
  if (kind === "transport") {
    const q = quoteTransportTshwane({
      loadKg: Number(body.loadKg),
      peak: Boolean(body.peakHours),
      pickupTownship: getTshwaneTownshipById(String(body.pickupTownshipId || "")),
      deliveryTownship: getTshwaneTownshipById(String(body.deliveryTownshipId || "")),
    });
    if (!q.ok) return res.status(400).json({ message: q.message, code: q.code });
    return res.json({ quote: q });
  }
  if (kind === "local") {
    const q = quoteLocalErrandTshwane({
      serviceKey: body.localServiceKey as LocalServiceKey,
      peak: Boolean(body.peakHours),
      pickupTownship: getTshwaneTownshipById(String(body.pickupTownshipId || "")),
      deliveryTownship: getTshwaneTownshipById(String(body.deliveryTownshipId || "")),
    });
    if (!q.ok) return res.status(400).json({ message: q.message, code: q.code });
    return res.json({ quote: q });
  }
  return res.status(400).json({ message: 'kind must be "transport" or "local"' });
});

router.post("/book", authenticate, authorize("client"), async (req: AuthRequest, res: Response, next) => {
  try {
    const body = (req.body || {}) as Record<string, unknown>;
    const kind = String(body.kind || "").toLowerCase();
    if (kind !== "transport" && kind !== "local") {
      throw new AppError('kind must be "transport" or "local"', 400);
    }

    const pickupTownshipId = String(body.pickupTownshipId || "").trim();
    const deliveryTownshipId = String(body.deliveryTownshipId || "").trim();
    const peakHours = Boolean(body.peakHours);
    const pickup = String(body.pickup || "").trim();
    const delivery = String(body.delivery || "").trim();

    if (!pickupTownshipId || !deliveryTownshipId) {
      throw new AppError("pickupTownshipId and deliveryTownshipId are required", 400);
    }

    if (kind === "local") {
      const svc = String(body.localServiceKey || "").trim() as LocalServiceKey;
      const allowed: LocalServiceKey[] = ["small_parcel", "food", "medium_parcel", "large_parcel"];
      if (!allowed.includes(svc)) throw new AppError("Invalid localServiceKey", 400);
      if (!isSubstantialLocalErrandPickupText(pickup)) {
        throw new AppError("Pickup location must be a full place description (shop + area, 12+ chars, 2+ words).", 400);
      }
      const pinLat = Number(body.deliveryLatitude);
      const pinLng = Number(body.deliveryLongitude);
      const hasPin = Number.isFinite(pinLat) && Number.isFinite(pinLng);
      if (!hasPin && !isSubstantialLocalErrandDeliveryText(delivery)) {
        throw new AppError(
          "Delivery must be a GPS pin (deliveryLatitude + deliveryLongitude) or a full typed address (16+ chars, 2+ words).",
          400
        );
      }
      const payload: Record<string, any> = {
        createdVia: "mobile",
        pickupTownshipId,
        deliveryTownshipId,
        peakHours,
        pickup,
        delivery,
        localServiceKey: svc,
        deliveryVerifiedPin: hasPin,
      };
      if (hasPin) {
        payload.deliveryLatitude = pinLat;
        payload.deliveryLongitude = pinLng;
      }
      const estimate = estimateTshwanePostedFlowPrice("local", payload);
      if (!estimate) throw new AppError("Could not price this errand. Check townships and service.", 400);
      const { task } = await createPostedTshwaneErrandTask(req.user!, "local", payload);
      return res.status(201).json({ message: "Task created", task, estimate });
    }

    const vehicleType = body.vehicleType === "small_truck" ? "small_truck" : "bakkie";
    const loadKg = Number(body.loadKg);
    if (!Number.isFinite(loadKg) || loadKg <= 0) throw new AppError("loadKg is required", 400);
    if (transportBandFromKg(loadKg) === null) throw new AppError("loadKg must be between 10 and 1000 for automated pricing", 400);
    if (pickup.length < 8) throw new AppError("Pickup address is too short", 400);
    if (delivery.length < 8) throw new AppError("Delivery address is too short", 400);

    const payload: Record<string, any> = {
      createdVia: "mobile",
      pickupTownshipId,
      deliveryTownshipId,
      peakHours,
      pickup,
      delivery,
      loadKg,
      vehicleType,
      photoProvided: Boolean(body.photoProvided),
    };
    const estimate = estimateTshwanePostedFlowPrice("transport", payload);
    if (!estimate) throw new AppError("Could not price this transport job.", 400);
    const { task } = await createPostedTshwaneErrandTask(req.user!, "transport", payload);
    return res.status(201).json({ message: "Task created", task, estimate });
  } catch (e) {
    next(e);
  }
});

export default router;
