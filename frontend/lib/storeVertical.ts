/** My Store catalog verticals — keep Restaurant / Grocery / Essentials goods separate. */

export type StoreVertical = 'restaurant' | 'grocery' | 'essentials';

export const STORE_VERTICAL_OPTIONS: { value: StoreVertical; label: string }[] = [
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'grocery', label: 'Grocery' },
  { value: 'essentials', label: 'Essentials' },
];

export const STORE_VERTICAL_STORAGE_KEY = 'qwertymates.myStore.vertical';

export function normalizeStoreVertical(raw?: string | null): StoreVertical {
  const v = String(raw || '')
    .trim()
    .toLowerCase();
  if (v === 'restaurant' || v === 'food') return 'restaurant';
  if (v === 'grocery' || v === 'groceries') return 'grocery';
  return 'essentials';
}

export function storeVerticalLabel(v: StoreVertical): string {
  return STORE_VERTICAL_OPTIONS.find((o) => o.value === v)?.label || 'Essentials';
}

function productTags(product: { tags?: string[] | null }): string[] {
  return Array.isArray(product.tags) ? product.tags.map((t) => String(t).toLowerCase()) : [];
}

export function productMatchesStoreVertical(
  product: { categories?: string[] | null; tags?: string[] | null },
  vertical: StoreVertical
): boolean {
  const cats = Array.isArray(product.categories) ? product.categories : [];
  const tags = productTags(product);
  const isFood =
    tags.includes('food-menu') ||
    tags.includes('food-extra') ||
    tags.includes('food-pickup') ||
    cats.some((c) => {
      const x = String(c).trim().toLowerCase();
      return x === 'food & restaurant' || x === 'kota / bunny chow' || x === 'extras';
    });
  const isGrocery =
    tags.includes('grocery-pickup') ||
    tags.includes('grocery') ||
    cats.some((c) => String(c).trim().toLowerCase() === 'groceries');

  if (vertical === 'restaurant') return isFood;
  if (vertical === 'grocery') return isGrocery;
  return !isFood && !isGrocery;
}

/** Prefer explicit store.vertical; else infer from product mix. */
export function inferStoreVertical(options: {
  vertical?: string | null;
  type?: string;
  products?: Array<{ categories?: string[] | null; tags?: string[] | null }>;
}): StoreVertical {
  if (options.type === 'reseller') return 'essentials';
  if (options.vertical) return normalizeStoreVertical(options.vertical);
  const products = options.products || [];
  if (!products.length) return 'essentials';
  const food = products.filter((p) => productMatchesStoreVertical(p, 'restaurant')).length;
  const grocery = products.filter((p) => productMatchesStoreVertical(p, 'grocery')).length;
  const essentials = products.length - food - grocery;
  if (food >= grocery && food >= essentials && food > 0) return 'restaurant';
  if (grocery >= food && grocery >= essentials && grocery > 0) return 'grocery';
  return 'essentials';
}
