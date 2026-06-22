import mongoose from "mongoose";
import CourierProvider from "../data/models/CourierProvider";
import CourierTariff from "../data/models/CourierTariff";
import { getFxRates, convertUsdTo } from "./fxService";

export type CourierQuoteOption = {
  tariffId: string;
  providerId: string;
  providerSlug: string;
  providerName: string;
  serviceLabel: string;
  zone?: string;
  /** Checkout display/charge amount in `checkoutCurrency` (legacy name: often ZAR). */
  priceZar: number;
  originalPrice: number;
  originalCurrency: string;
  /** Currency for priceZar when shopper sees native checkout (e.g. BWP local courier). */
  checkoutCurrency?: string;
  minDeliveryDays: number;
  maxDeliveryDays: number;
  integrationType: string;
  coverage: string;
  /** Set on aggregated checkout rows (PAXI service family). */
  serviceFamily?: string;
};

/** Amount to add to checkout totals in the settlement currency. */
export function courierAmountForSettlement(
  opt: CourierQuoteOption,
  settlementCurrency: string
): number {
  const settle = String(settlementCurrency || "ZAR").toUpperCase();
  const checkoutCur = String(opt.checkoutCurrency || "ZAR").toUpperCase();
  if (settle === checkoutCur) return opt.priceZar;
  if (settle === "BWP" && String(opt.originalCurrency || "").toUpperCase() === "BWP") {
    return opt.originalPrice;
  }
  return opt.priceZar;
}

/** ~1 kg per unit (qty); minimum 0.5 kg. Checkout applies this per store group so heavier carts pick higher courier bands. */
export function estimateCartWeightKg(unitQty: number): number {
  const n = Math.max(1, unitQty || 1);
  return Math.max(0.5, n * 1);
}

export async function tariffPriceToZar(price: number, currency: string): Promise<number> {
  const c = (currency || "ZAR").toUpperCase();
  if (c === "ZAR") return Math.round(price * 100) / 100;
  if (c === "USD") {
    const { rates } = await getFxRates();
    return Math.round(convertUsdTo(price, "ZAR", rates));
  }
  if (c === "BWP") {
    const { rates } = await getFxRates();
    const bwpPerUsd = rates?.BWP;
    if (bwpPerUsd && bwpPerUsd > 0) {
      const usd = price / bwpPerUsd;
      return Math.round(convertUsdTo(usd, "ZAR", rates));
    }
    return Math.round(price * 1.35);
  }
  return Math.round(price);
}

export async function listCourierQuotesForDestination(
  countryCode: string,
  weightKg: number,
  opts?: { parcelTier?: "standard" | "large" }
): Promise<CourierQuoteOption[]> {
  const cc = String(countryCode || "ZA").trim().toUpperCase();
  const w = Math.max(0, Number(weightKg) || 1);

  const tariffs = await CourierTariff.find({
    active: true,
    countryCode: cc,
    minWeightKg: { $lte: w },
    maxWeightKg: { $gte: w },
  })
    .sort({ sortOrder: 1, price: 1 })
    .lean();

  const parcelTier = opts?.parcelTier;

  if (!tariffs.length) return [];

  const providerIds = [...new Set(tariffs.map((t) => String(t.providerId)))];
  const providers = await CourierProvider.find({
    _id: { $in: providerIds.map((id) => new mongoose.Types.ObjectId(id)) },
    active: true,
  }).lean();
  const providerMap = new Map(providers.map((p) => [String(p._id), p]));

  const options: CourierQuoteOption[] = [];
  for (const t of tariffs) {
    if (parcelTier) {
      const zone = String((t as { zone?: string }).zone || "").toLowerCase();
      const isStoreHome = zone.includes("store to home");
      const isLargeZone =
        !isStoreHome && (zone.startsWith("large") || zone.includes("large ("));
      const isStandardZone =
        !isStoreHome && (zone.startsWith("standard") || zone.includes("standard ("));
      if (parcelTier === "standard" && isLargeZone) continue;
      if (parcelTier === "large" && isStandardZone) continue;
    }
    const prov = providerMap.get(String(t.providerId));
    if (!prov) continue;
    const originalPrice = Number(t.price);
    const priceZar = await tariffPriceToZar(originalPrice, String(t.currency || "ZAR"));
    options.push({
      tariffId: String(t._id),
      providerId: String(t.providerId),
      providerSlug: String((prov as any).slug),
      providerName: String((prov as any).name),
      serviceLabel: String(t.serviceLabel),
      zone: (t as any).zone,
      priceZar,
      originalPrice,
      originalCurrency: String(t.currency || "ZAR"),
      minDeliveryDays: Number(t.minDeliveryDays),
      maxDeliveryDays: Number(t.maxDeliveryDays),
      integrationType: String((prov as any).integrationType),
      coverage: String((prov as any).coverage),
    });
  }

  options.sort((a, b) => a.priceZar - b.priceZar);
  return options;
}

export async function resolveCourierTariffQuote(
  tariffId: string,
  countryCode: string,
  weightKg: number
): Promise<CourierQuoteOption | null> {
  const quotes = await listCourierQuotesForDestination(countryCode, weightKg);
  return quotes.find((q) => q.tariffId === tariffId) ?? null;
}

export async function getCheapestCourierQuote(
  countryCode: string,
  weightKg: number
): Promise<CourierQuoteOption | null> {
  const quotes = await listCourierQuotesForDestination(countryCode, weightKg);
  return quotes[0] ?? null;
}
