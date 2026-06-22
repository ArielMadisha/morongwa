import mongoose from "mongoose";
import Order from "../data/models/Order";
import CourierShipment from "../data/models/CourierShipment";
import { estimateCartWeightKg, resolveCourierTariffQuote, type CourierQuoteOption } from "./courierPricingService";
import { AppError } from "../middleware/errorHandler";

function cartQtyFromOrder(order: { items?: Array<{ qty?: number }> }): number {
  return (order.items || []).reduce((sum, i) => sum + (i.qty || 1), 0);
}

function inferProviderNameFromOrder(order: {
  delivery?: { carrier?: string; serviceLabel?: string };
  amounts?: { shippingBreakdown?: Array<{ storeName: string; shippingCost: number }> };
}): string {
  const d = order.delivery || {};
  if (d.carrier) return d.carrier;
  const breakdown = order.amounts?.shippingBreakdown || [];
  const withCost = breakdown.find((b) => (b.shippingCost ?? 0) > 0);
  if (withCost?.storeName) {
    const name = withCost.storeName;
    const paren = name.indexOf(" (");
    return paren > 0 ? name.slice(paren + 2, -1) : name;
  }
  return "Delivery";
}

async function resolveCourierSnapshotForOrder(order: {
  items?: Array<{ qty?: number }>;
  delivery?: {
    countryCode?: string;
    courierTariffId?: string;
    carrier?: string;
    serviceLabel?: string;
    courierProviderId?: string;
    estimatedDeliveryDaysMin?: number;
    estimatedDeliveryDaysMax?: number;
    courierPriceZar?: number;
  };
}): Promise<CourierQuoteOption | null> {
  const tariffId = order.delivery?.courierTariffId;
  if (!tariffId) return null;
  const country = String(order.delivery?.countryCode || "ZA").toUpperCase();
  const weightKg = estimateCartWeightKg(cartQtyFromOrder(order));
  return resolveCourierTariffQuote(tariffId, country, weightKg);
}

/**
 * When an order is paid, lock courier selection on the order and upsert an admin parcel row (status booked).
 * Throws if a paid order still requires a courier choice that was never captured.
 */
export async function finalizeCourierOnOrderPaid(orderId: string): Promise<void> {
  const order = await Order.findById(orderId);
  if (!order) return;
  if (order.status === "cancelled" || order.status === "pending_payment") return;
  if (!order.items?.length) return;

  const shippingPaid = Number(order.amounts?.shipping ?? 0);
  const country = String(order.delivery?.countryCode || "ZA").toUpperCase();
  const weightKg = estimateCartWeightKg(cartQtyFromOrder(order));

  const snapshot = await resolveCourierSnapshotForOrder(order);
  const courierPriceZar = Number((order.delivery as { courierPriceZar?: number })?.courierPriceZar ?? 0);

  if (order.delivery?.courierTariffId && !snapshot) {
    throw new AppError(
      "Order is paid but the selected courier tariff is no longer valid. Reconcile delivery before shipping.",
      500
    );
  }

  if (!order.delivery?.courierTariffId && courierPriceZar > 0) {
    throw new AppError(
      "Order is paid but courier selection data is incomplete. Reconcile delivery before shipping.",
      500
    );
  }

  const delivery = { ...(order.delivery || {}) } as Record<string, unknown>;
  const now = new Date();

  if (snapshot) {
    delivery.method = "courier";
    delivery.carrier = snapshot.providerName;
    delivery.courierTariffId = snapshot.tariffId;
    delivery.courierProviderId = snapshot.providerId;
    delivery.serviceLabel = snapshot.serviceLabel;
    delivery.courierPriceZar = snapshot.priceZar;
    delivery.estimatedDeliveryDaysMin = snapshot.minDeliveryDays;
    delivery.estimatedDeliveryDaysMax = snapshot.maxDeliveryDays;
  } else if (shippingPaid > 0) {
    delivery.serviceLabel =
      (delivery.serviceLabel as string) ||
      (delivery.carrier ? `${delivery.carrier} shipping` : "Standard delivery");
  }

  delivery.courierFinalizedAt = now;
  order.delivery = delivery as typeof order.delivery;
  await order.save();

  const breakdownProviders = (order.amounts?.shippingBreakdown || [])
    .map((b) => (b as { providerName?: string }).providerName?.trim())
    .filter(Boolean) as string[];
  const providerName =
    breakdownProviders.length > 1
      ? [...new Set(breakdownProviders)].join(" + ")
      : breakdownProviders[0] || snapshot?.providerName || inferProviderNameFromOrder(order);
  const serviceLabel =
    snapshot?.serviceLabel ||
    (order.delivery as { serviceLabel?: string })?.serviceLabel ||
    "Standard";
  const prepaid = (order.amounts as { deliveryPrepaid?: boolean })?.deliveryPrepaid !== false && shippingPaid > 0;

  const providerId =
    snapshot?.providerId && mongoose.isValidObjectId(snapshot.providerId)
      ? new mongoose.Types.ObjectId(snapshot.providerId)
      : order.delivery?.courierProviderId && mongoose.isValidObjectId(order.delivery.courierProviderId)
        ? new mongoose.Types.ObjectId(order.delivery.courierProviderId)
        : undefined;
  const tariffId =
    snapshot?.tariffId && mongoose.isValidObjectId(snapshot.tariffId)
      ? new mongoose.Types.ObjectId(snapshot.tariffId)
      : order.delivery?.courierTariffId && mongoose.isValidObjectId(order.delivery.courierTariffId)
        ? new mongoose.Types.ObjectId(order.delivery.courierTariffId)
        : undefined;

  const shipmentPayload = {
    buyerId: order.buyerId,
    providerId,
    providerName,
    tariffId,
    serviceLabel,
    destinationCountry: country,
    deliveryAddress: order.delivery?.address,
    weightKg,
    priceCharged: shippingPaid,
    currency: order.amounts?.currency || "ZAR",
    deliveryPrepaid: prepaid,
    status: "booked" as const,
  };

  const existing = await CourierShipment.findOne({ orderId: order._id });
  const note = snapshot
    ? `Courier confirmed at checkout: ${providerName} — ${serviceLabel}. Delivery prepaid R${shippingPaid}. Add tracking when dispatched.`
    : `Delivery confirmed at checkout (R${shippingPaid}). Add tracking when dispatched.`;

  if (existing) {
    existing.providerId = providerId;
    existing.providerName = providerName;
    existing.tariffId = tariffId;
    existing.serviceLabel = serviceLabel;
    existing.destinationCountry = country;
    existing.deliveryAddress = order.delivery?.address;
    existing.weightKg = weightKg;
    existing.priceCharged = shippingPaid;
    existing.deliveryPrepaid = prepaid;
    if (existing.status === "pending") {
      existing.status = "booked";
      existing.statusHistory.push({
        status: "booked",
        note,
        at: now,
      });
    }
    await existing.save();
    return;
  }

  if (shippingPaid <= 0 && !snapshot) return;

  await CourierShipment.create({
    orderId: order._id,
    ...shipmentPayload,
    statusHistory: [{ status: "booked", note, at: now }],
  });
}

/** @deprecated Use finalizeCourierOnOrderPaid */
export async function ensureCourierShipmentForOrder(orderId: string): Promise<void> {
  await finalizeCourierOnOrderPaid(orderId);
}
