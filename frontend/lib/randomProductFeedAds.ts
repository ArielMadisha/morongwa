import { getEffectivePrice, getImageUrl } from '@/lib/api';
import { formatCurrencyAmount } from '@/lib/formatCurrency';
import type { FeedAdCarouselCard } from '@/lib/feedAd';

type MarketplaceProductForAd = {
  _id: string;
  title?: string;
  images?: string[];
  price?: number;
  discountPrice?: number;
  currency?: string;
  storeName?: string;
  supplierId?: { storeName?: string } | string;
  colors?: Array<{ name?: string; hex?: string; imageIndex?: number }>;
};

function productPriceMeta(p: MarketplaceProductForAd): { description: string; linkUrl: string } {
  const price = getEffectivePrice(p);
  const currency = p.currency || 'ZAR';
  const priceLabel = formatCurrencyAmount(price, currency);
  const storeName =
    p.storeName ||
    (typeof p.supplierId === 'object' && p.supplierId?.storeName ? p.supplierId.storeName : undefined);
  return {
    description: storeName ? `${storeName} · ${priceLabel}` : priceLabel,
    linkUrl: `/marketplace/product/${p._id}`,
  };
}

/** One card for the first image (legacy callers). Prefer marketplaceProductToCarouselCards for ads. */
export function marketplaceProductToCarouselCard(p: MarketplaceProductForAd): FeedAdCarouselCard | null {
  const cards = marketplaceProductToCarouselCards(p);
  return cards[0] || null;
}

/**
 * Expand a product into one carousel card per color / image so every colourway shows in the ad.
 */
export function marketplaceProductToCarouselCards(p: MarketplaceProductForAd): FeedAdCarouselCard[] {
  const images = (Array.isArray(p.images) ? p.images : [])
    .map((u) => String(u || '').trim())
    .filter(Boolean);
  if (!images.length) return [];

  const meta = productPriceMeta(p);
  const baseTitle = p.title || 'Product';
  const colors = Array.isArray(p.colors) ? p.colors : [];
  const cards: FeedAdCarouselCard[] = [];
  const seenImages = new Set<string>();

  const pushCard = (imageUrl: string, title: string) => {
    const key = imageUrl.toLowerCase();
    if (seenImages.has(key)) return;
    seenImages.add(key);
    cards.push({
      imageUrl: getImageUrl(imageUrl) || imageUrl,
      title,
      description: meta.description,
      linkUrl: meta.linkUrl,
    });
  };

  if (colors.length > 0) {
    for (const c of colors) {
      const idx = Number.isFinite(Number(c?.imageIndex)) ? Math.max(0, Number(c.imageIndex)) : 0;
      const imageUrl = images[idx] || images[0];
      const colorName = String(c?.name || '').trim();
      const title = colorName ? `${baseTitle} — ${colorName}` : baseTitle;
      pushCard(imageUrl, title);
    }
  }

  // Always include any remaining gallery images not covered by colors.
  for (const imageUrl of images) {
    pushCard(imageUrl, baseTitle);
  }

  return cards;
}

export function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
