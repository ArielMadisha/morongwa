import type { TVGridItem } from '@/components/tv/TVGridTile';
import type { StatusPost } from '@/components/tv/StatusesStrip';

/** Marketplace link when a status segment is a product (store strip or uploader product post). */
export function statusProductHref(
  statusPost: StatusPost | undefined,
  loaded: TVGridItem | null,
  creatorUserId?: string
): string | null {
  if (statusPost?.type === 'product') {
    const id = String(statusPost._id || '').trim();
    if (id && /^[a-f0-9]{24}$/i.test(id)) return `/marketplace/product/${id}`;
  }
  if (!loaded) return null;

  if (loaded.type === 'product_tile' && loaded._id) {
    return `/marketplace/product/${loaded._id}`;
  }

  if (loaded.type === 'product') {
    const fromProduct = loaded.productId
      ? String((loaded.productId as { _id?: string })._id ?? loaded.productId)
      : '';
    const pid = fromProduct || String(loaded._id || '');
    if (!pid) return null;
    if (loaded.productId && creatorUserId) {
      return `/marketplace/product/${pid}?resellerId=${encodeURIComponent(creatorUserId)}`;
    }
    return `/marketplace/product/${pid}`;
  }

  return null;
}

export function statusProductTitle(
  statusPost: StatusPost | undefined,
  loaded: TVGridItem | null
): string | undefined {
  if (loaded?.type === 'product_tile' && loaded.title) return loaded.title;
  if (loaded?.type === 'product' && loaded.productId) {
    return (loaded.productId as { title?: string }).title || loaded.caption;
  }
  if (loaded?.caption) return loaded.caption;
  if (statusPost?.type === 'product') return undefined;
  return undefined;
}
