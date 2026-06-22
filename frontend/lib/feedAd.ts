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

export function legacyAdvertToFeedAd(row: LegacyAdvertRow): FeedAd {
  const cards =
    Array.isArray(row.carouselCards) && row.carouselCards.length > 0
      ? row.carouselCards.filter((c) => c?.imageUrl?.trim())
      : undefined;

  return {
    _id: `ad-${row._id}`,
    title: row.title,
    imageUrl: row.imageUrl,
    linkUrl: row.linkUrl,
    advertiserName: row.advertiserName || row.title,
    advertiserAvatar: row.advertiserAvatar,
    caption: row.caption,
    description: row.description,
    ctaLabel: row.ctaLabel || 'Learn more',
    videoUrl: row.videoUrl,
    carouselCards: cards,
  };
}

export function sponsoredAdToFeedAd(row: SponsoredAdRow): FeedAd {
  return {
    _id: `sponsored-${row.id}`,
    title: row.title,
    imageUrl: row.imageUrl || '',
    linkUrl: row.ctaUrl,
    advertiserName: row.advertiserName || row.title,
    caption: row.caption,
    description: row.caption,
    ctaLabel: row.ctaLabel || 'Learn more',
    videoUrl: row.videoUrl,
    sponsoredAdId: row.id,
  };
}

export function pickFeedAd(pool: FeedAd[]): FeedAd | null {
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)] ?? null;
}
