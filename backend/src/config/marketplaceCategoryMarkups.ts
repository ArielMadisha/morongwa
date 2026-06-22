/**
 * Marketplace top-category pricing (Qwertymates admin markup + reseller allowed range).
 *
 * - **Admin markup**: fixed % added on supplier “base” amount → catalog list price.
 * - **Reseller range**: when `allowResell` is true, resellers may add markup within min–max on that list price.
 * - When the supplier disables resell, only the admin markup applies (no reseller layer).
 *
 * Category names must match `MARKETPLACE_TOP_CATEGORIES` / admin category picker values.
 */
export type MarketplaceCategoryMarkupRule = {
  adminMarkupPct: number;
  resellerMinPct: number;
  resellerMaxPct: number;
};

export const MARKETPLACE_CATEGORY_MARKUPS: Record<string, MarketplaceCategoryMarkupRule> = {
  "Women's Clothing": { adminMarkupPct: 35, resellerMinPct: 30, resellerMaxPct: 50 },
  "Men's Clothing": { adminMarkupPct: 30, resellerMinPct: 25, resellerMaxPct: 40 },
  "Jewelry & Watches": { adminMarkupPct: 50, resellerMinPct: 40, resellerMaxPct: 50 },
  "Phones & Accessories": { adminMarkupPct: 25, resellerMinPct: 15, resellerMaxPct: 30 },
  "Automobiles & Motorcycles": { adminMarkupPct: 30, resellerMinPct: 20, resellerMaxPct: 35 },
  "Home, Garden & Furniture": { adminMarkupPct: 40, resellerMinPct: 25, resellerMaxPct: 45 },
  "Bags & Shoes": { adminMarkupPct: 35, resellerMinPct: 30, resellerMaxPct: 50 },
  "Women's Shoes": { adminMarkupPct: 35, resellerMinPct: 30, resellerMaxPct: 50 },
  "Men's Shoes": { adminMarkupPct: 35, resellerMinPct: 30, resellerMaxPct: 50 },
  "Camping Equipment": { adminMarkupPct: 30, resellerMinPct: 20, resellerMaxPct: 40 },
  Agriculture: { adminMarkupPct: 25, resellerMinPct: 15, resellerMaxPct: 35 },
  "Sports & Outdoors": { adminMarkupPct: 30, resellerMinPct: 20, resellerMaxPct: 40 },
  "Home Improvement": { adminMarkupPct: 25, resellerMinPct: 15, resellerMaxPct: 30 },
  "Consumer Electronics": { adminMarkupPct: 20, resellerMinPct: 15, resellerMaxPct: 25 },
  "Pet Supplies": { adminMarkupPct: 45, resellerMinPct: 30, resellerMaxPct: 50 },
  "Toys, Kids & Babies": { adminMarkupPct: 30, resellerMinPct: 20, resellerMaxPct: 35 },
  "Computer & Office": { adminMarkupPct: 20, resellerMinPct: 15, resellerMaxPct: 25 },
  "Health, Beauty & Hair": { adminMarkupPct: 50, resellerMinPct: 40, resellerMaxPct: 50 },
};

/** When category is missing or unknown, align with default marketplace category. */
export const DEFAULT_MARKETPLACE_ADMIN_MARKUP_PCT =
  MARKETPLACE_CATEGORY_MARKUPS["Home, Garden & Furniture"]?.adminMarkupPct ?? 40;

export function resolveMarketplaceCategoryKey(raw: string): string | null {
  const t = String(raw || "").trim();
  if (!t) return null;
  const found = Object.keys(MARKETPLACE_CATEGORY_MARKUPS).find((k) => k.toLowerCase() === t.toLowerCase());
  return found ?? null;
}

export function getMarketplaceCategoryMarkup(
  topCategoryName: string | null | undefined
): MarketplaceCategoryMarkupRule | null {
  const key = resolveMarketplaceCategoryKey(String(topCategoryName || ""));
  return key ? MARKETPLACE_CATEGORY_MARKUPS[key] : null;
}

/** Admin markup % to use for pricing (integer or half where needed). */
export function adminMarkupPctForCategory(topCategoryName: string | null | undefined): number {
  return getMarketplaceCategoryMarkup(topCategoryName)?.adminMarkupPct ?? DEFAULT_MARKETPLACE_ADMIN_MARKUP_PCT;
}

/** Catalog list ZAR from supplier-entered base ZAR × (1 + category admin %). */
export function catalogListPriceFromSupplierBaseZar(
  baseZar: number,
  topCategoryName: string | null | undefined
): number {
  if (!Number.isFinite(baseZar) || baseZar < 0) return 0;
  const pct = adminMarkupPctForCategory(topCategoryName);
  return Math.round(baseZar * (1 + pct / 100) * 100) / 100;
}

/** Reseller markup % bounds from the product's category list (first matching top category), else default category. */
export function resellerMarkupBoundsForProductCategories(
  categories: string[] | null | undefined
): { minPct: number; maxPct: number; defaultPct: number } {
  const list = Array.isArray(categories) ? categories : [];
  let rule: MarketplaceCategoryMarkupRule | null = null;
  for (const raw of list) {
    const mk = getMarketplaceCategoryMarkup(raw);
    if (mk) {
      rule = mk;
      break;
    }
  }
  if (!rule) {
    rule =
      MARKETPLACE_CATEGORY_MARKUPS["Home, Garden & Furniture"] ??
      Object.values(MARKETPLACE_CATEGORY_MARKUPS)[0] ?? {
        adminMarkupPct: DEFAULT_MARKETPLACE_ADMIN_MARKUP_PCT,
        resellerMinPct: 15,
        resellerMaxPct: 45,
      };
  }
  const minPct = Math.round(rule.resellerMinPct);
  const maxPct = Math.round(rule.resellerMaxPct);
  const mid = Math.round((rule.resellerMinPct + rule.resellerMaxPct) / 2);
  const defaultPct = Math.min(maxPct, Math.max(minPct, mid));
  return { minPct, maxPct, defaultPct };
}

/** Wall % from DB, clamped to category bounds; missing wall % uses category default. */
export function effectiveResellerMarkupPctFromWall(
  wallPct: number | null | undefined,
  categories: string[] | null | undefined
): number {
  const { minPct, maxPct, defaultPct } = resellerMarkupBoundsForProductCategories(categories);
  if (wallPct == null || !Number.isFinite(Number(wallPct))) return defaultPct;
  const r = Math.round(Number(wallPct));
  return Math.min(maxPct, Math.max(minPct, r));
}
