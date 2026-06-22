import mongoose from "mongoose";
import CourierProvider from "../data/models/CourierProvider";
import CourierTariff from "../data/models/CourierTariff";
import type { CourierQuoteOption } from "./courierPricingService";

const CACHE_TTL_MS = 5 * 60 * 1000;
let cachedAt = 0;
let cachedOptions: CourierQuoteOption[] | null = null;

function paxiSortKey(serviceLabel: string): string {
  const s = serviceLabel.toLowerCase();
  if (s.includes("store to home") && s.includes("large")) return "store-home-large";
  if (s.includes("store to home")) return "store-home-standard";
  if (s.includes("large") && s.includes("economy")) return "large-economy";
  if (s.includes("large") && s.includes("speed")) return "large-speed";
  if (s.includes("economy")) return "standard-economy";
  if (s.includes("speed")) return "standard-speed";
  return s;
}

const PAXI_ORDER = [
  "standard-economy",
  "standard-speed",
  "large-economy",
  "large-speed",
  "store-home-standard",
  "store-home-large",
];

/** Fast read of active ZA PAXI tariffs — no catalog seed, no cart. Cached 5 min. */
export async function listPaxiCatalogZa(): Promise<CourierQuoteOption[]> {
  const now = Date.now();
  if (cachedOptions && now - cachedAt < CACHE_TTL_MS) {
    return cachedOptions;
  }

  const prov = await CourierProvider.findOne({ slug: "paxi", active: true }).select("_id name slug integrationType coverage").lean();
  if (!prov) {
    cachedOptions = [];
    cachedAt = now;
    return [];
  }

  const tariffs = await CourierTariff.find({
    providerId: prov._id,
    countryCode: "ZA",
    active: true,
    minWeightKg: { $lte: 5 },
    maxWeightKg: { $gte: 0.5 },
  })
    .sort({ sortOrder: 1 })
    .lean();

  const options: CourierQuoteOption[] = tariffs.map((t) => ({
    tariffId: String(t._id),
    providerId: String(prov._id),
    providerSlug: "paxi",
    providerName: String((prov as { name?: string }).name || "PAXI"),
    serviceLabel: String(t.serviceLabel),
    zone: (t as { zone?: string }).zone,
    priceZar: Math.round(Number(t.price) * 100) / 100,
    originalPrice: Number(t.price),
    originalCurrency: String(t.currency || "ZAR"),
    minDeliveryDays: Number(t.minDeliveryDays),
    maxDeliveryDays: Number(t.maxDeliveryDays),
    integrationType: String((prov as { integrationType?: string }).integrationType || "portal"),
    coverage: String((prov as { coverage?: string }).coverage || "domestic_za"),
  }));

  options.sort((a, b) => {
    const ia = PAXI_ORDER.indexOf(paxiSortKey(a.serviceLabel));
    const ib = PAXI_ORDER.indexOf(paxiSortKey(b.serviceLabel));
    return (ia >= 0 ? ia : 99) - (ib >= 0 ? ib : 99);
  });

  cachedOptions = options;
  cachedAt = now;
  return options;
}

const TCG_CACHE_TTL_MS = 5 * 60 * 1000;
let tcgCachedAt = 0;
let tcgCachedOptions: CourierQuoteOption[] | null = null;

/** Fast read of The Courier Guy + Pudo ZA tariffs. */
export async function listCourierGuyCatalogZa(): Promise<CourierQuoteOption[]> {
  const now = Date.now();
  if (tcgCachedOptions && now - tcgCachedAt < TCG_CACHE_TTL_MS) {
    return tcgCachedOptions;
  }

  const providers = await CourierProvider.find({
    slug: { $in: ["courier-guy", "pudo"] },
    active: true,
  })
    .select("_id name slug integrationType coverage sortOrder")
    .sort({ sortOrder: 1 })
    .lean();

  if (!providers.length) {
    tcgCachedOptions = [];
    tcgCachedAt = now;
    return [];
  }

  const providerMap = new Map(providers.map((p) => [String(p._id), p]));
  const tariffs = await CourierTariff.find({
    providerId: { $in: providers.map((p) => p._id) },
    countryCode: "ZA",
    active: true,
    minWeightKg: { $lte: 5 },
    maxWeightKg: { $gte: 0.5 },
  })
    .sort({ sortOrder: 1, price: 1 })
    .lean();

  const options: CourierQuoteOption[] = [];
  for (const t of tariffs) {
    const prov = providerMap.get(String(t.providerId));
    if (!prov) continue;
    options.push({
      tariffId: String(t._id),
      providerId: String(prov._id),
      providerSlug: String((prov as { slug?: string }).slug || ""),
      providerName: String((prov as { name?: string }).name || "The Courier Guy"),
      serviceLabel: String(t.serviceLabel),
      zone: (t as { zone?: string }).zone,
      priceZar: Math.round(Number(t.price) * 100) / 100,
      originalPrice: Number(t.price),
      originalCurrency: String(t.currency || "ZAR"),
      minDeliveryDays: Number(t.minDeliveryDays),
      maxDeliveryDays: Number(t.maxDeliveryDays),
      integrationType: String((prov as { integrationType?: string }).integrationType || "tariff_table"),
      coverage: String((prov as { coverage?: string }).coverage || "domestic_za"),
    });
  }

  options.sort((a, b) => a.priceZar - b.priceZar);
  tcgCachedOptions = options;
  tcgCachedAt = now;
  return options;
}

export function invalidatePaxiCatalogCache(): void {
  cachedAt = 0;
  cachedOptions = null;
  tcgCachedAt = 0;
  tcgCachedOptions = null;
}
