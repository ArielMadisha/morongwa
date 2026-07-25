export type FeedAdCarouselCard = {
  imageUrl: string;
  title?: string;
  description?: string;
  linkUrl?: string;
};

/** Unified Facebook-style feed ad (legacy Advert + sponsored video). */
export type FeedAd = {
  _id: string;
  title: string;
  imageUrl: string;
  linkUrl?: string;
  advertiserName?: string;
  advertiserAvatar?: string;
  caption?: string;
  description?: string;
  ctaLabel?: string;
  videoUrl?: string;
  carouselCards?: FeedAdCarouselCard[];
  /** Sponsored video ad id for impression/click tracking */
  sponsoredAdId?: string;
};

export type LegacyAdvertRow = {
  _id: string;
  title: string;
  imageUrl: string;
  linkUrl?: string;
  advertiserName?: string;
  advertiserAvatar?: string;
  caption?: string;
  description?: string;
  ctaLabel?: string;
  videoUrl?: string;
  carouselCards?: FeedAdCarouselCard[];
};

export type SponsoredAdRow = {
  id: string;
  title: string;
  caption?: string;
  videoUrl?: string;
  imageUrl?: string;
  advertiserName?: string;
  ctaLabel?: string;
  ctaUrl?: string;
};

/** True if URL looks like a real image creative (not marketplace HTML / private IP / placeholder). */
export function isUsableAdImageUrl(url?: string | null): boolean {
  const u = String(url || '').trim();
  if (!u) return false;
  if (/placehold\.co/i.test(u)) return false;
  if (/172\.\d+\.\d+\.\d+/i.test(u)) return false;
  if (/^https?:\/\/[^/]+\/marketplace\/?$/i.test(u)) return false;
  // Relative upload / public asset paths are fine
  if (u.startsWith('/')) return true;
  if (/^https?:\/\//i.test(u)) {
    // Reject bare page URLs without image extension or uploads path
    if (/\/marketplace(\/|$|\?)/i.test(u) && !/\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(u)) {
      return false;
    }
    return true;
  }
  return false;
}

export function isBrokenLegacyAdvert(row: LegacyAdvertRow): boolean {
  const title = `${row.title || ''} ${row.advertiserName || ''}`.toLowerCase();
  if (/^buy local$/.test(String(row.title || '').trim().toLowerCase())) return true;
  if (/shop local on qwertyhub/.test(title)) return true;
  if (/handwoven baskets/.test(title)) return true;
  const cards = Array.isArray(row.carouselCards) ? row.carouselCards : [];
  const hasGoodCards = cards.some((c) => isUsableAdImageUrl(c?.imageUrl));
  const hasVideo = Boolean(String(row.videoUrl || '').trim());
  if (hasGoodCards || hasVideo) return false;
  return !isUsableAdImageUrl(row.imageUrl);
}

export function isHammanskraalWarehouseFeedAd(ad: Pick<FeedAd, 'title' | 'advertiserName'>): boolean {
  return /hammanskraal/i.test(`${ad.advertiserName || ''} ${ad.title || ''}`);
}

export function legacyAdvertToFeedAd(row: LegacyAdvertRow): FeedAd {
  const cards =
    Array.isArray(row.carouselCards) && row.carouselCards.length > 0
      ? row.carouselCards.filter((c) => isUsableAdImageUrl(c?.imageUrl))
      : undefined;

  return {
    _id: `ad-${row._id}`,
    title: row.title,
    imageUrl: isUsableAdImageUrl(row.imageUrl) ? row.imageUrl : '',
    linkUrl: row.linkUrl,
    advertiserName: row.advertiserName || row.title,
    advertiserAvatar: row.advertiserAvatar,
    caption: row.caption,
    description: row.description,
    ctaLabel: row.ctaLabel || 'Shop now',
    videoUrl: row.videoUrl,
    carouselCards: cards?.length ? cards : undefined,
  };
}

export function sponsoredAdToFeedAd(row: SponsoredAdRow): FeedAd {
  return {
    _id: `sponsored-${row.id}`,
    title: row.title,
    imageUrl: isUsableAdImageUrl(row.imageUrl) ? row.imageUrl || '' : '',
    linkUrl: row.ctaUrl,
    advertiserName: row.advertiserName || row.title,
    caption: row.caption,
    description: row.caption,
    ctaLabel: row.ctaLabel || 'Shop now',
    videoUrl: row.videoUrl,
    sponsoredAdId: row.id,
  };
}

/** Prefer Hammanskraal warehouse product carousel ads over legacy placeholders. */
export function pickFeedAd(pool: FeedAd[]): FeedAd | null {
  if (!pool.length) return null;
  const warehouse = pool.filter(isHammanskraalWarehouseFeedAd);
  const preferred = warehouse.length ? warehouse : pool;
  return preferred[Math.floor(Math.random() * preferred.length)] ?? null;
}
