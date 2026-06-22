/**
 * Automatic PAXI bag tier (standard vs large) from cart contents.
 * Not shown to shoppers — checkout picks the matching tariff per store group.
 *
 * PAXI parcel limit (all service types): 45 cm × 37 cm, max 5 kg.
 * “Large” vs “Standard” at checkout is a rate tier for heavier/multi-item orders, not a bigger bag size.
 *
 * Heuristics align with common fashion marketplaces: volume + weight + item count,
 * because catalog products rarely store parcel dimensions.
 */

export type ParcelBagTier = "standard" | "large";

/** Usable fill volume inside each bag (cm³), conservative for soft packaging. */
export const STANDARD_BAG = {
  maxWidthCm: 45,
  maxHeightCm: 37,
  fillDepthCm: 18,
  maxWeightKg: 5,
  maxVolumeCm3: 45 * 37 * 18,
} as const;

/** Same physical limits as standard; higher PAXI tariff tier when the cart fills the parcel. */
export const LARGE_BAG = {
  maxWidthCm: 45,
  maxHeightCm: 37,
  fillDepthCm: 18,
  maxWeightKg: 5,
  maxVolumeCm3: 45 * 37 * 18,
} as const;

/** Default packed volume per unit when no product dimensions exist. */
const DEFAULT_UNIT_VOLUME_CM3 = 35 * 30 * 6;
const BULKY_UNIT_VOLUME_CM3 = 42 * 36 * 12;

const BULKY_CATEGORY_RE =
  /dress|gown|coat|jacket|hoodie|sweater|jersey|blanket|duvet|boot|shoe|sneaker|handbag|luggage|suitcase|tracksuit|parka/i;

export type ParcelSizingLine = {
  qty: number;
  categories?: string[];
  title?: string;
};

export type ParcelSizingInput = {
  totalQty: number;
  lineCount: number;
  weightKg: number;
  lines?: ParcelSizingLine[];
};

function lineVolumeCm3(line: ParcelSizingLine): number {
  const cats = (line.categories || []).join(" ");
  const title = String(line.title || "");
  const bulky = BULKY_CATEGORY_RE.test(`${cats} ${title}`);
  const perUnit = bulky ? BULKY_UNIT_VOLUME_CM3 : DEFAULT_UNIT_VOLUME_CM3;
  return perUnit * Math.max(1, line.qty || 1);
}

export function estimatePackedVolumeCm3(lines: ParcelSizingLine[]): number {
  if (!lines.length) return DEFAULT_UNIT_VOLUME_CM3;
  return lines.reduce((sum, line) => sum + lineVolumeCm3(line), 0);
}

/**
 * Decide standard vs large bag for one store group's shipment.
 */
export function inferParcelBagTier(input: ParcelSizingInput): ParcelBagTier {
  const totalQty = Math.max(1, input.totalQty || 1);
  const lineCount = Math.max(1, input.lineCount || 1);
  const weightKg = Math.max(0.25, Number(input.weightKg) || 0.5);
  const volumeCm3 = input.lines?.length
    ? estimatePackedVolumeCm3(input.lines)
    : DEFAULT_UNIT_VOLUME_CM3 * totalQty;

  if (weightKg > STANDARD_BAG.maxWeightKg) return "large";
  if (volumeCm3 > STANDARD_BAG.maxVolumeCm3 * 0.9) return "large";

  // Multi-item carts: typical fashion parcel thresholds (≈4–6 garments per standard bag).
  if (totalQty >= 8) return "large";
  if (totalQty >= 5 && volumeCm3 > STANDARD_BAG.maxVolumeCm3 * 0.65) return "large";
  if (lineCount >= 4 && totalQty >= 4 && volumeCm3 > STANDARD_BAG.maxVolumeCm3 * 0.55) return "large";

  if (totalQty >= 3 && weightKg >= 2.5) return "large";
  if (weightKg >= 4.25 && totalQty >= 3) return "large";
  if (totalQty >= 6 && volumeCm3 > STANDARD_BAG.maxVolumeCm3 * 0.5) return "large";

  return "standard";
}

export function parcelTierMaxWeightKg(tier: ParcelBagTier): number {
  return tier === "large" ? LARGE_BAG.maxWeightKg : STANDARD_BAG.maxWeightKg;
}
