import CourierProvider from "../data/models/CourierProvider";
import CourierTariff from "../data/models/CourierTariff";
import type { CourierQuoteOption } from "./courierPricingService";

export type SadcDeliveryScope = "local" | "crossborder";

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; rows: CourierQuoteOption[] }>();

function cacheKey(country: string, scope: SadcDeliveryScope): string {
  return `${country}::${scope}`;
}

/** Active tariffs for a SADC destination, filtered by local vs cross-border scope. */
export async function listSadcDeliveryCatalog(
  countryCode: string,
  scope: SadcDeliveryScope,
  opts?: { quoteInNativeCurrency?: boolean }
): Promise<CourierQuoteOption[]> {
  const cc = String(countryCode || "").trim().toUpperCase();
  if (!cc || cc === "ZA") return [];

  const key = cacheKey(cc, scope);
  const hit = cache.get(key);
  const now = Date.now();
  if (hit && now - hit.at < CACHE_TTL_MS) {
    return hit.rows;
  }

  const coverageFilter =
    scope === "local"
      ? { $regex: /^domestic_/ }
      : "cross_border_sadc";

  const providers = await CourierProvider.find({
    active: true,
    coverage: coverageFilter,
    countries: cc,
  })
    .select("_id name slug integrationType coverage sortOrder")
    .sort({ sortOrder: 1 })
    .lean();

  if (!providers.length) {
    cache.set(key, { at: now, rows: [] });
    return [];
  }

  const providerMap = new Map(providers.map((p) => [String(p._id), p]));
  const tariffs = await CourierTariff.find({
    providerId: { $in: providers.map((p) => p._id) },
    countryCode: cc,
    active: true,
    minWeightKg: { $lte: 5 },
    maxWeightKg: { $gte: 0.5 },
  })
    .sort({ sortOrder: 1, price: 1 })
    .lean();

  const { tariffPriceToZar } = await import("./courierPricingService");
  const options: CourierQuoteOption[] = [];
  const keepNative =
    !!opts?.quoteInNativeCurrency &&
    scope === "local" &&
    cc === "BW";

  for (const t of tariffs) {
    const prov = providerMap.get(String(t.providerId));
    if (!prov) continue;
    const originalPrice = Number(t.price);
    const originalCurrency = String(t.currency || "ZAR").toUpperCase();
    const useNative = keepNative && originalCurrency === "BWP";
    const priceZar = useNative
      ? Math.round(originalPrice * 100) / 100
      : await tariffPriceToZar(originalPrice, originalCurrency);
    options.push({
      tariffId: String(t._id),
      providerId: String(prov._id),
      providerSlug: String((prov as { slug?: string }).slug || ""),
      providerName: String((prov as { name?: string }).name || "Courier"),
      serviceLabel: String(t.serviceLabel),
      zone: (t as { zone?: string }).zone,
      priceZar,
      originalPrice,
      originalCurrency,
      checkoutCurrency: useNative ? "BWP" : "ZAR",
      minDeliveryDays: Number(t.minDeliveryDays),
      maxDeliveryDays: Number(t.maxDeliveryDays),
      integrationType: String((prov as { integrationType?: string }).integrationType || "tariff_table"),
      coverage: String((prov as { coverage?: string }).coverage || ""),
    });
  }

  options.sort((a, b) => a.priceZar - b.priceZar || a.providerName.localeCompare(b.providerName));
  cache.set(key, { at: now, rows: options });
  return options;
}

export function invalidateSadcDeliveryCatalogCache(): void {
  cache.clear();
}
