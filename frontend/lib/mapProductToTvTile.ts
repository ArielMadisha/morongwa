import type { TVGridItem } from '@/components/tv/TVGridTile';

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
  supplierId?: { storeName?: string; _id?: string } | string;
  storeName?: string;
  storeSlug?: string;
  allowResell?: boolean;
  stock?: number;
  outOfStock?: boolean;
  createdAt?: string;
}): TVGridItem {
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
    likeCount: 0,
    commentCount: 0,
    shareCount: 0,
    createdAt: p.createdAt ? String(p.createdAt) : undefined,
  };
}
