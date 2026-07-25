/** Shared helpers for Order Food / Order Groceries (in-store collection carts). */

export const FOOD_CATEGORY = 'Food & Restaurant';
export const GROCERY_CATEGORY = 'Groceries';

export function productIsInstorePickup(product: {
  categories?: string[] | null;
  tags?: string[] | null;
}): boolean {
  const tags = Array.isArray(product.tags)
    ? product.tags.map((t) => String(t).toLowerCase())
    : [];
  if (
    tags.includes('food-pickup') ||
    tags.includes('food-menu') ||
    tags.includes('food-extra') ||
    tags.includes('grocery-pickup') ||
    tags.includes('grocery')
  ) {
    return true;
  }
  const cats = Array.isArray(product.categories) ? product.categories : [];
  return cats.some((c) => {
    const n = String(c || '').trim().toLowerCase();
    return (
      n === FOOD_CATEGORY.toLowerCase() ||
      n === 'kota / bunny chow' ||
      n === 'extras' ||
      n === GROCERY_CATEGORY.toLowerCase()
    );
  });
}

export function cartIsInstorePickupOnly(
  items: Array<{ product?: { categories?: string[] | null; tags?: string[] | null } | null }>
): boolean {
  if (!items.length) return false;
  return items.every((i) => productIsInstorePickup(i.product || {}));
}
