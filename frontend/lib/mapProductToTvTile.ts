import type { TVGridItem } from '@/components/tv/TVGridTile';

function resolveSupplierOwnerUserId(
  supplierId?: { userId?: string | { _id?: string }; storeName?: string; _id?: string } | string
): string | undefined {
  if (!supplierId || typeof supplierId !== 'object') return undefined;
  const uid = supplierId.userId;
  if (!uid) return undefined;
  if (typeof uid === 'object' && uid !== null && uid._id) return String(uid._id);
  return String(uid);
}

/** QwertyHub catalog row → wall/TV product tile (includes store name + bulk tiers for pricing UI). */
export function mapProductToTvTile(p: {
  _id: string;
  title?: string;
  description?: string;
  images?: string[];
  price?: number;
  discountPrice?: number;
  bulkTiers?: Array<{ minQty: number; maxQty: number; price: number }>;
  currency?: string;
  supplierId?: { storeName?: string; _id?: string; userId?: string | { _id?: string } } | string;
  storeName?: string;
  storeSlug?: string;
  allowResell?: boolean;
  stock?: number;
  outOfStock?: boolean;
  colors?: Array<{ name: string; hex?: string; imageIndex?: number }>;
  sizes?: string[];
  freeShippingEnabled?: boolean;
  freeShippingAreas?: Array<{ countryCode: string; locality: string }>;
  createdAt?: string;
}): TVGridItem {
  const ownerUserId = resolveSupplierOwnerUserId(p.supplierId);
  const storeLabel =
    (p.storeName && String(p.storeName).trim()) ||
    (typeof p.supplierId === 'object' && p.supplierId?.storeName
      ? String(p.supplierId.storeName).trim()
      : '') ||
    undefined;

  return {
    _id: p._id,
    type: 'product_tile',
    title: p.title,
    description: p.description,
    images: p.images,
    price: p.price,
    discountPrice: p.discountPrice,
    bulkTiers: p.bulkTiers,
    currency: p.currency,
    supplierId: p.supplierId,
    storeName: p.storeName,
    storeSlug: p.storeSlug,
    allowResell: p.allowResell ?? false,
    stock: p.stock,
    outOfStock: p.outOfStock,
    colors: Array.isArray(p.colors) ? p.colors : undefined,
    sizes: Array.isArray(p.sizes) ? p.sizes : undefined,
    freeShippingEnabled: p.freeShippingEnabled,
    freeShippingAreas: Array.isArray(p.freeShippingAreas) ? p.freeShippingAreas : undefined,
    // Enables store profile hover (same card as school/creator posts) on QwertyHub tiles.
    ...(ownerUserId
      ? {
          creatorId: {
            _id: ownerUserId,
            name: storeLabel,
            storeSlug: p.storeSlug,
          },
        }
      : {}),
    likeCount: 0,
    commentCount: 0,
    shareCount: 0,
    createdAt: p.createdAt ? String(p.createdAt) : undefined,
  };
}
