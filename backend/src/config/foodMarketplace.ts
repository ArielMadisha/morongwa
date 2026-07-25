/** Food & Restaurant marketplace vertical (pickup kota / bunny chow). */
export const FOOD_CATEGORY = "Food & Restaurant";
export const FOOD_SUBCATEGORY_MENU = "Kota / Bunny Chow";
export const FOOD_SUBCATEGORY_EXTRAS = "Extras";
export const FOOD_TAG_MENU = "food-menu";
export const FOOD_TAG_EXTRA = "food-extra";
export const FOOD_TAG_PICKUP = "food-pickup";
/** Order Groceries — in-store collection (same checkout rules as food). */
export const GROCERY_CATEGORY = "Groceries";
export const GROCERY_TAG_PICKUP = "grocery-pickup";
/**
 * Flat platform service fee (ZAR) per qualifying food line unit.
 * - Menu items: always charged
 * - Extras alone (no menu item in the same cart): charged
 * - Extras alongside one or more menu items: waived
 */
export const FOOD_ORDER_SERVICE_FEE_ZAR = 3.5;
/** Shared product image for kota menu tiles (legacy SVG). */
export const FOOD_KOTA_IMAGE_PATH = "/uploads/food/kota-icon.svg";
/** Real photo set for Caliba's / food menu tiles — assign randomly. */
export const FOOD_KOTA_PHOTO_PATHS = [
  "/uploads/food/calibas-kota-1.png",
  "/uploads/food/calibas-kota-2.png",
  "/uploads/food/calibas-kota-3.png",
  "/uploads/food/calibas-kota-4.png",
] as const;
/** Categories that belong only under Order Food/Restaurant — never QwertyHub feed. */
export const FOOD_HUB_EXCLUDED_CATEGORIES = [
  FOOD_CATEGORY,
  FOOD_SUBCATEGORY_MENU,
  FOOD_SUBCATEGORY_EXTRAS,
] as const;

export function isFoodMarketplaceCategory(category?: string | null): boolean {
  const c = String(category || "").trim().toLowerCase();
  if (!c) return false;
  return FOOD_HUB_EXCLUDED_CATEGORIES.some((x) => x.toLowerCase() === c);
}

export function isGroceryMarketplaceCategory(category?: string | null): boolean {
  const c = String(category || "").trim().toLowerCase();
  return c === GROCERY_CATEGORY.toLowerCase();
}

export function pickRandomFoodPhoto(seed?: string | number): string {
  const list = FOOD_KOTA_PHOTO_PATHS;
  if (!list.length) return FOOD_KOTA_IMAGE_PATH;
  if (seed === undefined || seed === null || seed === "") {
    return list[Math.floor(Math.random() * list.length)];
  }
  const s = String(seed);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return list[h % list.length];
}

function productTags(product: { tags?: string[] | null }): string[] {
  return Array.isArray(product.tags) ? product.tags.map((t) => String(t).toLowerCase()) : [];
}

export function productIsFoodExtra(product: {
  categories?: string[] | null;
  tags?: string[] | null;
}): boolean {
  return productTags(product).includes(FOOD_TAG_EXTRA);
}

export function productIsFoodMenu(product: {
  categories?: string[] | null;
  tags?: string[] | null;
}): boolean {
  if (productIsFoodExtra(product)) return false;
  const tags = productTags(product);
  if (tags.includes(FOOD_TAG_MENU)) return true;
  const cats = Array.isArray(product.categories) ? product.categories : [];
  return cats.some((c) => String(c).trim().toLowerCase() === FOOD_CATEGORY.toLowerCase());
}

export function productIsFoodPickup(product: {
  categories?: string[] | null;
  tags?: string[] | null;
}): boolean {
  const cats = Array.isArray(product.categories) ? product.categories : [];
  const tags = productTags(product);
  if (tags.includes(FOOD_TAG_PICKUP) || tags.includes(FOOD_TAG_MENU) || tags.includes(FOOD_TAG_EXTRA)) {
    return true;
  }
  return cats.some((c) => String(c).trim().toLowerCase() === FOOD_CATEGORY.toLowerCase());
}

export function productIsGroceryPickup(product: {
  categories?: string[] | null;
  tags?: string[] | null;
}): boolean {
  const tags = productTags(product);
  if (tags.includes(GROCERY_TAG_PICKUP) || tags.includes("grocery")) return true;
  const cats = Array.isArray(product.categories) ? product.categories : [];
  return cats.some((c) => isGroceryMarketplaceCategory(c));
}

/** Food or groceries — customer collects in store (no courier). */
export function productIsInstorePickup(product: {
  categories?: string[] | null;
  tags?: string[] | null;
}): boolean {
  return productIsFoodPickup(product) || productIsGroceryPickup(product);
}

export function cartProductsAreInstorePickupOnly(
  products: Array<{ categories?: string[] | null; tags?: string[] | null }>
): boolean {
  if (!products.length) return false;
  return products.every((p) => productIsInstorePickup(p));
}

/** Alias — food + groceries pickup carts. */
export function cartProductsAreFoodPickupOnly(
  products: Array<{ categories?: string[] | null; tags?: string[] | null }>
): boolean {
  return cartProductsAreInstorePickupOnly(products);
}

export function cartHasFoodMenuItem(
  products: Array<{ categories?: string[] | null; tags?: string[] | null }>
): boolean {
  return products.some((p) => productIsFoodMenu(p));
}

/**
 * Per-unit food service fee in ZAR (0 when not applicable).
 * Pass `cartHasMenuItem` from the full cart product set so extras waive correctly.
 */
export function foodOrderServiceFeeZarPerUnit(
  product: { categories?: string[] | null; tags?: string[] | null },
  opts: { cartHasMenuItem: boolean }
): number {
  if (!productIsFoodPickup(product)) return 0;
  if (productIsFoodMenu(product)) return FOOD_ORDER_SERVICE_FEE_ZAR;
  if (productIsFoodExtra(product)) {
    return opts.cartHasMenuItem ? 0 : FOOD_ORDER_SERVICE_FEE_ZAR;
  }
  // Other food pickup lines: treat like menu (fee applies).
  return FOOD_ORDER_SERVICE_FEE_ZAR;
}

/** Catalog unit + service fee (rounded to cents). */
export function withFoodOrderServiceFee(
  catalogUnitPrice: number,
  product: { categories?: string[] | null; tags?: string[] | null },
  opts: { cartHasMenuItem: boolean }
): { unitPrice: number; serviceFeeZar: number } {
  const fee = foodOrderServiceFeeZarPerUnit(product, opts);
  const base = Number(catalogUnitPrice) || 0;
  return {
    serviceFeeZar: fee,
    unitPrice: Math.round((base + fee) * 100) / 100,
  };
}
