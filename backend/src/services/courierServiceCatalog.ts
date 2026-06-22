import mongoose from "mongoose";
import CourierProvider from "../data/models/CourierProvider";
import CourierTariff from "../data/models/CourierTariff";
import {
  estimateCartWeightKg,
  listCourierQuotesForDestination,
  type CourierQuoteOption,
} from "./courierPricingService";
import {
  inferParcelBagTier,
  parcelTierMaxWeightKg,
  type ParcelBagTier,
  type ParcelSizingLine,
} from "./parcelSizingService";
import type { ShippingStoreGroup } from "./checkoutShipping";
import { ensureCourierCatalogSeed } from "./courierSeed";
import {
  groupNeedsCrossborderLane,
  resolveQuoteForStoreGroupLane,
  resolveStoreCourierLane,
} from "./storeGroupCourierLane";

/** Checkout-facing service types (bag size is chosen automatically for point-to-point). */
export type CourierServiceFamily =
  | "point_economy"
  | "point_speed"
  | "store_home_standard"
  | "store_home_large";

const PAXI_SLUG = "paxi";

export function parseCourierServiceFamily(
  serviceLabel: string,
  zone?: string
): CourierServiceFamily | null {
  const label = String(serviceLabel || "").toLowerCase();
  const z = String(zone || "").toLowerCase();
  if (label.includes("store to home")) {
    return label.includes("large") ? "store_home_large" : "store_home_standard";
  }
  if (z.includes("store to home")) {
    return label.includes("large") ? "store_home_large" : "store_home_standard";
  }
  if (label.includes("economy")) return "point_economy";
  if (label.includes("speed")) return "point_speed";
  return null;
}

function parcelTierFromZone(zone?: string): ParcelBagTier | null {
  const z = String(zone || "").toLowerCase();
  if (z.startsWith("large (") || (z.includes("large") && !z.includes("store to home"))) return "large";
  if (z.includes("standard")) return "standard";
  return null;
}

function familyNeedsParcelTier(family: CourierServiceFamily): boolean {
  return family === "point_economy" || family === "point_speed";
}

function displayLabelForFamily(family: CourierServiceFamily): string {
  switch (family) {
    case "point_economy":
      return "Economy (7–9 business days)";
    case "point_speed":
      return "Speed (7–9 business days)";
    case "store_home_standard":
      return "Store to Home — Standard (3–5 business days)";
    case "store_home_large":
      return "Store to Home — Large (3–5 business days)";
    default:
      return "Delivery";
  }
}

export function collectLinesForStoreGroup(
  group: ShippingStoreGroup,
  cartItems: Array<{ productId: unknown; qty?: number }>,
  productMap: Map<string, Record<string, unknown>>
): ParcelSizingLine[] {
  const supplierSet = new Set(group.supplierIds);
  const lines: ParcelSizingLine[] = [];
  for (const item of cartItems) {
    const product = productMap.get(String(item.productId ?? ""));
    if (!product) continue;
    if (String(product.supplierSource || "internal") !== "internal") continue;
    const sid = String(
      (product.supplierId as { _id?: unknown })?._id ?? product.supplierId ?? ""
    ).trim();
    if (supplierSet.size > 0 && !supplierSet.has(sid)) continue;
    lines.push({
      qty: Math.max(1, Number(item.qty) || 1),
      categories: Array.isArray(product.categories) ? (product.categories as string[]) : [],
      title: String(product.title || ""),
    });
  }
  return lines;
}

export function inferParcelTierForStoreGroup(
  group: ShippingStoreGroup,
  cartItems: Array<{ productId: unknown; qty?: number }>,
  productMap: Map<string, Record<string, unknown>>
): ParcelBagTier {
  const lines = collectLinesForStoreGroup(group, cartItems, productMap);
  const weightKg = estimateCartWeightKg(group.totalQty);
  return inferParcelBagTier({
    totalQty: group.totalQty,
    lineCount: group.lineCount,
    weightKg,
    lines,
  });
}

/** Resolve a concrete PAXI tariff row for a service family + auto bag tier. */
export async function findPaxiTariff(
  countryCode: string,
  family: CourierServiceFamily,
  parcelTier: ParcelBagTier
): Promise<CourierQuoteOption | null> {
  const cc = String(countryCode || "ZA").trim().toUpperCase();
  const weightKg = parcelTierMaxWeightKg(parcelTier);
  const quotes = await listCourierQuotesForDestination(cc, weightKg, { parcelTier });
  const paxi = quotes.filter((q) => q.providerSlug === PAXI_SLUG);
  for (const q of paxi) {
    const f = parseCourierServiceFamily(q.serviceLabel, q.zone);
    if (f !== family) continue;
    if (familyNeedsParcelTier(family)) {
      const tier = parcelTierFromZone(q.zone);
      if (tier && tier !== parcelTier) continue;
    }
    return q;
  }
  return null;
}

export async function getServiceFamilyFromTariffId(
  tariffId: string
): Promise<{ family: CourierServiceFamily; providerSlug: string } | null> {
  if (!mongoose.Types.ObjectId.isValid(tariffId)) return null;
  const row = await CourierTariff.findById(tariffId).lean();
  if (!row) return null;
  const prov = await CourierProvider.findById(row.providerId).select("slug").lean();
  if (!prov) return null;
  const family = parseCourierServiceFamily(String(row.serviceLabel), (row as { zone?: string }).zone);
  if (!family) return null;
  return { family, providerSlug: String((prov as { slug?: string }).slug || "") };
}

/**
 * Resolve delivery quote for one store group from the shopper's selected checkout option.
 */
export async function resolveCourierQuoteForStoreGroup(
  countryCode: string,
  group: ShippingStoreGroup,
  selectedTariffId: string,
  cartItems: Array<{ productId: unknown; qty?: number }>,
  productMap: Map<string, Record<string, unknown>>
): Promise<CourierQuoteOption | null> {
  const meta = await getServiceFamilyFromTariffId(selectedTariffId);
  if (!meta) {
    const weightKg = estimateCartWeightKg(group.totalQty);
    const { resolveCourierTariffQuote } = await import("./courierPricingService");
    return resolveCourierTariffQuote(selectedTariffId, countryCode, weightKg);
  }

  if (meta.providerSlug === PAXI_SLUG) {
    const row = await CourierTariff.findById(selectedTariffId).lean();
    const selectedTier = parcelTierFromZone((row as { zone?: string })?.zone) ?? "standard";
    let parcelTier: ParcelBagTier = selectedTier === "large" ? "large" : "standard";
    if (familyNeedsParcelTier(meta.family)) {
      const needed = inferParcelTierForStoreGroup(group, cartItems, productMap);
      if (needed === "large") parcelTier = "large";
    }
    return findPaxiTariff(countryCode, meta.family, parcelTier);
  }

  const weightKg = estimateCartWeightKg(group.totalQty);
  const { resolveCourierTariffQuote } = await import("./courierPricingService");
  return resolveCourierTariffQuote(selectedTariffId, countryCode, weightKg);
}

/**
 * Build checkout choices: all six PAXI services with official dimensions;
 * total = per-store charge × number of stores (multi-store = separate origins).
 */
/** Fallback when cart lines lack supplierId but are internal ZA products. */
export function fallbackStoreGroupsFromCart(
  storeGroups: ShippingStoreGroup[],
  cartItems: Array<{ productId: unknown; qty?: number }>,
  productMap: Map<string, Record<string, unknown>>
): ShippingStoreGroup[] {
  if (storeGroups.length > 0) return storeGroups;
  let totalQty = 0;
  let lineCount = 0;
  for (const item of cartItems) {
    const product = productMap.get(String(item.productId ?? ""));
    if (!product) continue;
    const src = String(product.supplierSource || "internal");
    if (src !== "internal") continue;
    totalQty += Math.max(1, Number(item.qty) || 1);
    lineCount += 1;
  }
  if (lineCount === 0) return [];
  return [
    {
      groupKey: "cart:internal",
      storeName: "Your order",
      supplierIds: [],
      totalQty,
      lineCount,
    },
  ];
}

export async function buildAggregatedCheckoutCourierOptions(
  countryCode: string,
  storeGroups: ShippingStoreGroup[],
  cartItems: Array<{ productId: unknown; qty?: number }>,
  productMap: Map<string, Record<string, unknown>>,
  opts?: { crossborderCourierTariffId?: string }
): Promise<CourierQuoteOption[]> {
  const groups = fallbackStoreGroupsFromCart(storeGroups, cartItems, productMap);
  if (!groups.length) return [];

  const cc = String(countryCode || "ZA").trim().toUpperCase();
  const rawQuotes = await listCourierQuotesForDestination(cc, 5);
  const domesticZaGroups = groups.filter(
    (g) => resolveStoreCourierLane(g.originCountryCode, cc).kind === "domestic_za"
  );
  const crossborderGroups = groups.filter((g) => groupNeedsCrossborderLane(g, cc));

  const crossborderAddon = async (): Promise<number> => {
    let sum = 0;
    for (const group of crossborderGroups) {
      const q = await resolveQuoteForStoreGroupLane(group, {
        deliveryCountry: cc,
        crossborderTariffId: opts?.crossborderCourierTariffId,
        cartItems,
        productMap,
      });
      if (!q) return -1;
      sum += q.priceZar;
    }
    return Math.round(sum * 100) / 100;
  };

  const aggregated: CourierQuoteOption[] = [];
  const paxiQuotes = rawQuotes.filter((q) => q.providerSlug === PAXI_SLUG);
  const seenPaxi = new Set<string>();
  for (const q of paxiQuotes) {
    if (seenPaxi.has(q.tariffId)) continue;
    seenPaxi.add(q.tariffId);
    let totalZar = 0;
    if (domesticZaGroups.length > 0) {
      for (const group of domesticZaGroups) {
        const gq = await resolveCourierQuoteForStoreGroup(
          cc,
          group,
          q.tariffId,
          cartItems,
          productMap
        );
        if (!gq) {
          totalZar = -1;
          break;
        }
        totalZar += gq.priceZar;
      }
    }
    if (totalZar < 0) continue;
    const cb = await crossborderAddon();
    if (cb < 0) continue;
    aggregated.push({
      ...q,
      priceZar: Math.round((totalZar + cb) * 100) / 100,
    });
  }

  const nonPaxi = rawQuotes.filter((q) => q.providerSlug !== PAXI_SLUG);
  const seen = new Set<string>();
  for (const q of nonPaxi) {
    if (seen.has(q.tariffId)) continue;
    seen.add(q.tariffId);
    let totalZar = 0;
    let ok = true;
    for (const group of domesticZaGroups) {
      const { resolveCourierTariffQuote } = await import("./courierPricingService");
      const gq = await resolveCourierTariffQuote(q.tariffId, cc, estimateCartWeightKg(group.totalQty));
      if (!gq) {
        ok = false;
        break;
      }
      totalZar += gq.priceZar;
    }
    if (!ok) continue;
    const cb = await crossborderAddon();
    if (cb < 0) continue;
    aggregated.push({
      ...q,
      priceZar: Math.round((totalZar + cb) * 100) / 100,
    });
  }

  aggregated.sort((a, b) => a.priceZar - b.priceZar);
  return aggregated;
}

/** Load courier choices for checkout; seeds catalog and applies store-group fallback. */
export async function ensureCheckoutCourierOptions(
  deliveryCountry: string,
  storeGroups: ShippingStoreGroup[],
  cartItems: Array<{ productId: unknown; qty?: number }>,
  productMap: Map<string, Record<string, unknown>>,
  opts?: {
    deliveryScope?: "local" | "crossborder";
    quoteInNativeCurrency?: boolean;
    crossborderCourierTariffId?: string;
  }
): Promise<CourierQuoteOption[]> {
  const groups = fallbackStoreGroupsFromCart(storeGroups, cartItems, productMap);
  if (!groups.length) return [];
  const cc = String(deliveryCountry || "ZA").trim().toUpperCase();
  if (cc !== "ZA") {
    const { listSadcDeliveryCatalog } = await import("./sadcDeliveryCatalogService");
    const scope = opts?.deliveryScope === "local" ? "local" : "crossborder";
    return listSadcDeliveryCatalog(cc, scope, {
      quoteInNativeCurrency: opts?.quoteInNativeCurrency,
    });
  }
  const options = await buildAggregatedCheckoutCourierOptions(
    deliveryCountry,
    groups,
    cartItems,
    productMap,
    { crossborderCourierTariffId: opts?.crossborderCourierTariffId }
  );
  return options.filter((o) =>
    ["paxi", "courier-guy", "pudo"].includes(String(o.providerSlug || ""))
  );
}
