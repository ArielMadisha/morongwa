/**
 * 2-tier dropshipping pricing framework
 *
 * Layer 1: Supplier Cost (C) – what we pay CJ/Spocket/EPROLO
 * Layer 2: Platform Price (P) = C × (1 + platform margin) – what resellers pay us
 * Layer 3: Reseller Final Price (R) = P ÷ (1 - reseller margin) – what end customers pay
 *
 * Target: Platform 15–30%, Resellers 30–60%, Combined 50–70%
 */

export type PricingCategory =
  | "fashion"
  | "beauty"
  | "home"
  | "electronics"
  | "baby"
  | "pet"
  | "fitness"
  | "other";

export interface CategoryPricingRule {
  /** Platform markup multiplier (e.g. 1.35 = 35% margin) */
  platformMultiplier: number;
  /** Platform margin % (e.g. 25) */
  platformMarginPct: number;
  /** Reseller min margin % (e.g. 30) */
  resellerMinMarginPct: number;
  /** Reseller max margin % (e.g. 60) */
  resellerMaxMarginPct: number;
  /** Default reseller margin for auto-suggest */
  resellerDefaultMarginPct: number;
}

export const CATEGORY_PRICING: Record<PricingCategory, CategoryPricingRule> = {
  fashion: {
    platformMultiplier: 1.45, // 1.3–1.6×, ~31% margin
    platformMarginPct: 31,
    resellerMinMarginPct: 30,
    resellerMaxMarginPct: 60,
    resellerDefaultMarginPct: 45,
  },
  beauty: {
    platformMultiplier: 1.55, // 1.4–1.7×, ~35%
    platformMarginPct: 35,
    resellerMinMarginPct: 30,
    resellerMaxMarginPct: 60,
    resellerDefaultMarginPct: 50,
  },
  home: {
    platformMultiplier: 1.4, // 1.3–1.5×
    platformMarginPct: 29,
    resellerMinMarginPct: 30,
    resellerMaxMarginPct: 60,
    resellerDefaultMarginPct: 45,
  },
  electronics: {
    platformMultiplier: 1.22, // 1.15–1.3×, tight
    platformMarginPct: 18,
    resellerMinMarginPct: 25,
    resellerMaxMarginPct: 40,
    resellerDefaultMarginPct: 35,
  },
  baby: {
    platformMultiplier: 1.45,
    platformMarginPct: 31,
    resellerMinMarginPct: 30,
    resellerMaxMarginPct: 60,
    resellerDefaultMarginPct: 50,
  },
  pet: {
    platformMultiplier: 1.55,
    platformMarginPct: 35,
    resellerMinMarginPct: 30,
    resellerMaxMarginPct: 60,
    resellerDefaultMarginPct: 55,
  },
  fitness: {
    platformMultiplier: 1.45,
    platformMarginPct: 31,
    resellerMinMarginPct: 30,
    resellerMaxMarginPct: 60,
    resellerDefaultMarginPct: 50,
  },
  other: {
    platformMultiplier: 1.35,
    platformMarginPct: 26,
    resellerMinMarginPct: 30,
    resellerMaxMarginPct: 55,
    resellerDefaultMarginPct: 45,
  },
};

/** Map CJ/category names to our pricing category */
const CATEGORY_MAP: Record<string, PricingCategory> = {
  clothing: "fashion",
  fashion: "fashion",
  women: "fashion",
  men: "fashion",
  hoodies: "fashion",
  tops: "fashion",
  beauty: "beauty",
  personal: "beauty",
  skincare: "beauty",
  home: "home",
  kitchen: "home",
  garden: "home",
  furniture: "home",
  electronics: "electronics",
  gadgets: "electronics",
  baby: "baby",
  kids: "baby",
  toys: "baby",
  pet: "pet",
  pets: "pet",
  fitness: "fitness",
  health: "fitness",
  sports: "fitness",
};

export function getPricingCategory(categoryName?: string): PricingCategory {
  if (!categoryName) return "other";
  const key = categoryName.toLowerCase().replace(/[^a-z]/g, "");
  for (const [k, v] of Object.entries(CATEGORY_MAP)) {
    if (key.includes(k) || k.includes(key)) return v;
  }
  return "other";
}

export function getPricingRule(categoryName?: string): CategoryPricingRule {
  const cat = getPricingCategory(categoryName);
  return CATEGORY_PRICING[cat];
}

/**
 * Platform price: P = C × platformMultiplier
 */
export function platformPrice(supplierCost: number, categoryName?: string): number {
  const rule = getPricingRule(categoryName);
  return Math.round(supplierCost * rule.platformMultiplier * 100) / 100;
}

/**
 * Recommended reseller price: R = P ÷ (1 - resellerMargin)
 */
export function recommendedResellerPrice(platformPrice: number, resellerMarginPct?: number, categoryName?: string): number {
  const rule = getPricingRule(categoryName);
  const margin = resellerMarginPct ?? rule.resellerDefaultMarginPct;
  const clamped = Math.max(rule.resellerMinMarginPct, Math.min(rule.resellerMaxMarginPct, margin)) / 100;
  return Math.round((platformPrice / (1 - clamped)) * 100) / 100;
}

/**
 * Min resale price (MAP) – platform price + minimum reseller margin
 */
export function minResalePrice(platformPrice: number, categoryName?: string): number {
  const rule = getPricingRule(categoryName);
  const minMargin = rule.resellerMinMarginPct / 100;
  return Math.round((platformPrice / (1 - minMargin)) * 100) / 100;
}

/**
 * Platform margin % for a given category
 */
export function platformMarginPct(categoryName?: string): number {
  return getPricingRule(categoryName).platformMarginPct;
}
