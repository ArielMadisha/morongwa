/**
 * Create posted Tshwane errands (transport + local) — shared by WhatsApp (waFlow) and mobile API.
 */
import Task from "../data/models/Task";
import { getTshwaneTownshipById } from "../data/tshwaneCoverageAreas";
import {
  ERRAND_PRICING_TSHWANE_VERSION,
  quoteLocalErrandTshwane,
  quoteTransportTshwane,
  transportBandFromKg,
  type LocalServiceKey,
} from "./errandPricingTshwane";
import { findMatchingRunners } from "./matching";
import { sendNotification } from "./notification";
import { logger } from "./monitoring";

export function normalizeErrandTaskTypeForDb(draftType: string): string {
  const t = String(draftType || "").trim();
  if (t === "cross_border_collection") return "collect_send";
  if (t === "shop_and_send") return "shop_send";
  if (t === "large_transport") return "transport";
  return t;
}

export type TshwanePostedFlow = "transport" | "local";

export function estimateTshwanePostedFlowPrice(flowType: TshwanePostedFlow, meta: Record<string, any>): number {
  if (flowType === "transport") {
    const q = quoteTransportTshwane({
      loadKg: Number(meta.loadKg),
      pickupTownship: getTshwaneTownshipById(meta.pickupTownshipId),
      deliveryTownship: getTshwaneTownshipById(meta.deliveryTownshipId),
      peak: Boolean(meta.peakHours),
    });
    return q.ok ? q.customerTotal : 0;
  }
  const q = quoteLocalErrandTshwane({
    serviceKey: meta.localServiceKey as LocalServiceKey,
    pickupTownship: getTshwaneTownshipById(meta.pickupTownshipId),
    deliveryTownship: getTshwaneTownshipById(meta.deliveryTownshipId),
    peak: Boolean(meta.peakHours),
  });
  return q.ok ? q.customerTotal : 0;
}

export function buildTshwanePostedFlowDraft(
  flowType: TshwanePostedFlow,
  payload: Record<string, any>,
  createdVia: "whatsapp" | "mobile" = "whatsapp"
): {
  taskType: string;
  title: string;
  description: string;
  pickupAddress: string;
  deliveryAddress: string;
  workflowMeta: Record<string, any>;
} {
  if (flowType === "transport") {
    const pt = getTshwaneTownshipById(payload.pickupTownshipId);
    const dt = getTshwaneTownshipById(payload.deliveryTownshipId);
    const vt = payload.vehicleType === "small_truck" ? "Small truck" : "Bakkie";
    const band = transportBandFromKg(Number(payload.loadKg));
    const bandShort =
      band === "light"
        ? "Light"
        : band === "medium"
          ? "Medium"
          : band === "heavy"
            ? "Heavy"
            : band === "extra_heavy"
              ? "Extra heavy"
              : "Load";
    const title = `Transport (${bandShort}) — ${vt}`;
    const description = [
      `Large-item transport ~${payload.loadKg} kg using ${vt}.`,
      pt && dt ? `Areas: ${pt.name} → ${dt.name}.` : "",
      `Pickup: ${payload.pickup || "TBC"}`,
      `Drop-off: ${payload.delivery || "TBC"}`,
    ]
      .filter(Boolean)
      .join("\n");
    return {
      taskType: "large_transport",
      title,
      description,
      pickupAddress: payload.pickup || pt?.name || "Unknown pickup",
      deliveryAddress: payload.delivery || dt?.name || "Unknown delivery",
      workflowMeta: {
        coverage: "city_of_tshwane",
        errandFlow: "transport_items",
        pickupTownshipId: payload.pickupTownshipId,
        deliveryTownshipId: payload.deliveryTownshipId,
        loadKg: Number(payload.loadKg),
        vehicleType: payload.vehicleType,
        peakHours: Boolean(payload.peakHours),
        photoProvided: Boolean(payload.photoProvided),
        pricingVersion: ERRAND_PRICING_TSHWANE_VERSION,
        createdVia,
      },
    };
  }

  const pt = getTshwaneTownshipById(payload.pickupTownshipId);
  const dt = getTshwaneTownshipById(payload.deliveryTownshipId);
  const svcKey = payload.localServiceKey as LocalServiceKey | undefined;
  const svcLabel =
    svcKey === "small_parcel"
      ? "Small parcel"
      : svcKey === "food"
        ? "Food delivery"
        : svcKey === "medium_parcel"
          ? "Medium parcel"
          : svcKey === "large_parcel"
            ? "Large parcel"
            : "Local errand";
  const title = pt && dt ? `Local errand — ${pt.name} → ${dt.name}` : `Local errand — ${svcLabel}`;
  const description = [
    `${svcLabel}.`,
    pt && dt ? `${pt.name} → ${dt.name}.` : "",
    payload.pickup ? `Pickup detail: ${payload.pickup}` : "",
    payload.delivery ? `Delivery detail: ${payload.delivery}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  return {
    taskType: "general",
    title,
    description,
    pickupAddress: payload.pickup || pt?.name || "Not provided",
    deliveryAddress: payload.delivery || dt?.name || "Not provided",
    workflowMeta: {
      createdVia,
      errandFlow: "local",
      coverage: "city_of_tshwane",
      pickupTownshipId: payload.pickupTownshipId,
      deliveryTownshipId: payload.deliveryTownshipId,
      localServiceKey: svcKey,
      peakHours: Boolean(payload.peakHours),
      pricingVersion: ERRAND_PRICING_TSHWANE_VERSION,
      deliveryVerifiedPin: Boolean(payload.deliveryVerifiedPin),
      ...(Number.isFinite(Number(payload.deliveryLatitude)) && Number.isFinite(Number(payload.deliveryLongitude))
        ? {
            deliveryLatitude: Number(payload.deliveryLatitude),
            deliveryLongitude: Number(payload.deliveryLongitude),
          }
        : {}),
    },
  };
}

export async function createPostedTshwaneErrandTask(
  user: { _id: unknown },
  flowType: TshwanePostedFlow,
  payload: Record<string, any>
): Promise<{ task: InstanceType<typeof Task>; estimate: number }> {
  const channel = payload.createdVia === "mobile" ? "mobile" : "whatsapp";
  const draft = buildTshwanePostedFlowDraft(flowType, payload, channel);
  const estimate = estimateTshwanePostedFlowPrice(flowType, payload);

  const pt = getTshwaneTownshipById(payload.pickupTownshipId);
  const dt = getTshwaneTownshipById(payload.deliveryTownshipId);
  let pickupCoords: number[] = [0, 0];
  let deliveryCoords: number[] = [0, 0];
  if (pt && dt) {
    pickupCoords = [pt.lng, pt.lat];
    deliveryCoords = [dt.lng, dt.lat];
  }
  if (
    flowType === "local" &&
    Number.isFinite(Number(payload.deliveryLatitude)) &&
    Number.isFinite(Number(payload.deliveryLongitude))
  ) {
    deliveryCoords = [Number(payload.deliveryLongitude), Number(payload.deliveryLatitude)];
  }

  let pricingSnap: Record<string, unknown> = {};
  if (flowType === "transport") {
    const q = quoteTransportTshwane({
      loadKg: Number(payload.loadKg),
      pickupTownship: pt,
      deliveryTownship: dt,
      peak: Boolean(payload.peakHours),
    });
    if (q.ok) pricingSnap = { pricingTshwane: q };
  } else {
    const q = quoteLocalErrandTshwane({
      serviceKey: payload.localServiceKey as LocalServiceKey,
      pickupTownship: pt,
      deliveryTownship: dt,
      peak: Boolean(payload.peakHours),
    });
    if (q.ok) pricingSnap = { pricingTshwane: q };
  }

  const parcelDetails =
    flowType === "transport" && Number.isFinite(Number(payload.loadKg))
      ? { weightKg: Number(payload.loadKg) }
      : undefined;

  const task = await Task.create({
    taskType: normalizeErrandTaskTypeForDb(draft.taskType),
    title: draft.title,
    description: draft.description,
    budget: estimate,
    suggestedFee: estimate,
    pickupLocation: { type: "Point", coordinates: pickupCoords, address: draft.pickupAddress },
    deliveryLocation: { type: "Point", coordinates: deliveryCoords, address: draft.deliveryAddress },
    parcelDetails,
    status: "posted",
    client: user._id as any,
    escrowed: false,
    attachments: [],
    workflowMeta: { ...draft.workflowMeta, ...pricingSnap, errandHandoverV2: false },
  });

  try {
    const matches = await findMatchingRunners(String(task._id));
    for (const match of (matches || []).slice(0, 5)) {
      await sendNotification({
        userId: match.runnerId,
        type: "NEW_TASK",
        message: `New Errands task: ${task.title} — est. R${estimate}`,
      });
    }
  } catch (err) {
    logger.warn("Errands runner matching failed", { error: String((err as any)?.message || err) });
  }
  return { task, estimate };
}
