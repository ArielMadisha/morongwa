import type { ShippingStoreGroup } from "./checkoutShipping";
import {
  estimateCartWeightKg,
  resolveCourierTariffQuote,
  type CourierQuoteOption,
} from "./courierPricingService";
import { listSadcDeliveryCatalog, type SadcDeliveryScope } from "./sadcDeliveryCatalogService";
import {
  inferParcelTierForStoreGroup,
  resolveCourierQuoteForStoreGroup,
} from "./courierServiceCatalog";

export type StoreCourierLaneKind = "domestic_za" | "domestic_bw" | "domestic_sadc" | "crossborder_export";

export function normStoreCountry(code?: string): string {
  return String(code || "ZA").trim().toUpperCase();
}

export function resolveStoreCourierLane(
  originCountryCode: string | undefined,
  deliveryCountry: string
): { kind: StoreCourierLaneKind; catalogCountry: string } {
  const origin = normStoreCountry(originCountryCode);
  const dest = normStoreCountry(deliveryCountry);
  if (origin === dest) {
    if (origin === "ZA") return { kind: "domestic_za", catalogCountry: "ZA" };
    if (origin === "BW") return { kind: "domestic_bw", catalogCountry: "BW" };
    return { kind: "domestic_sadc", catalogCountry: origin };
  }
  return { kind: "crossborder_export", catalogCountry: origin };
}

export function groupNeedsCrossborderLane(
  group: ShippingStoreGroup,
  deliveryCountry: string
): boolean {
  return resolveStoreCourierLane(group.originCountryCode, deliveryCountry).kind === "crossborder_export";
}

export function cartHasMixedDomesticOrigins(
  groups: ShippingStoreGroup[],
  deliveryCountry: string
): boolean {
  const lanes = new Set(
    groups.map((g) => resolveStoreCourierLane(g.originCountryCode, deliveryCountry).kind)
  );
  return lanes.has("domestic_za") && lanes.has("crossborder_export");
}

/** Crossborder export tariffs for each foreign-origin store group (deduped). */
export async function listCrossborderCourierOptionsForGroups(
  groups: ShippingStoreGroup[],
  deliveryCountry: string
): Promise<CourierQuoteOption[]> {
  const seen = new Set<string>();
  const options: CourierQuoteOption[] = [];
  for (const group of groups) {
    if (!groupNeedsCrossborderLane(group, deliveryCountry)) continue;
    const lane = resolveStoreCourierLane(group.originCountryCode, deliveryCountry);
    const rows = await listSadcDeliveryCatalog(lane.catalogCountry, "crossborder");
    for (const row of rows) {
      if (seen.has(row.tariffId)) continue;
      seen.add(row.tariffId);
      options.push(row);
    }
  }
  options.sort((a, b) => a.priceZar - b.priceZar || a.providerName.localeCompare(b.providerName));
  return options;
}

export type ResolveStoreGroupQuoteParams = {
  deliveryCountry: string;
  domesticTariffId?: string;
  crossborderTariffId?: string;
  cartItems: Array<{ productId: unknown; qty?: number }>;
  productMap: Map<string, Record<string, unknown>>;
  deliveryScope?: SadcDeliveryScope;
  quoteInNativeCurrency?: boolean;
};

export async function resolveQuoteForStoreGroupLane(
  group: ShippingStoreGroup,
  params: ResolveStoreGroupQuoteParams
): Promise<CourierQuoteOption | null> {
  const lane = resolveStoreCourierLane(group.originCountryCode, params.deliveryCountry);
  const weightKg = estimateCartWeightKg(group.totalQty);

  if (lane.kind === "domestic_za") {
    if (!params.domesticTariffId) return null;
    return resolveCourierQuoteForStoreGroup(
      params.deliveryCountry,
      group,
      params.domesticTariffId,
      params.cartItems,
      params.productMap
    );
  }

  if (lane.kind === "domestic_bw") {
    const catalog = await listSadcDeliveryCatalog("BW", "local", {
      quoteInNativeCurrency: params.quoteInNativeCurrency,
    });
    const tariffId = params.crossborderTariffId || params.domesticTariffId;
    if (tariffId) {
      const match = catalog.find((o) => o.tariffId === tariffId);
      if (match) return match;
      return resolveCourierTariffQuote(tariffId, "BW", weightKg);
    }
    return catalog[0] ?? null;
  }

  if (lane.kind === "domestic_sadc") {
    const catalog = await listSadcDeliveryCatalog(lane.catalogCountry, "local");
    const tariffId = params.crossborderTariffId || params.domesticTariffId;
    if (tariffId) {
      const match = catalog.find((o) => o.tariffId === tariffId);
      if (match) return match;
      return resolveCourierTariffQuote(tariffId, lane.catalogCountry, weightKg);
    }
    return catalog[0] ?? null;
  }

  // crossborder_export — ship from origin country (e.g. BW store → ZA customer)
  const catalog = await listSadcDeliveryCatalog(lane.catalogCountry, "crossborder");
  const tariffId = params.crossborderTariffId;
  if (tariffId) {
    const match = catalog.find((o) => o.tariffId === tariffId);
    if (match) return match;
    return resolveCourierTariffQuote(tariffId, lane.catalogCountry, weightKg);
  }
  return catalog[0] ?? null;
}

export async function cheapestCrossborderForGroup(
  group: ShippingStoreGroup,
  deliveryCountry: string
): Promise<CourierQuoteOption | null> {
  return resolveQuoteForStoreGroupLane(group, {
    deliveryCountry,
    cartItems: [],
    productMap: new Map(),
  });
}

export function inferParcelTierForGroup(
  group: ShippingStoreGroup,
  cartItems: Array<{ productId: unknown; qty?: number }>,
  productMap: Map<string, Record<string, unknown>>
) {
  return inferParcelTierForStoreGroup(group, cartItems, productMap);
}
