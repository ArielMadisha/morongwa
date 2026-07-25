'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ChevronRight,
  Globe,
  Heart,
  MessageCircle,
  MoreHorizontal,
  Share2,
  ThumbsUp,
  X,
} from 'lucide-react';
import { advertsAPI, getImageUrl, getImageUrlFull, productsAPI } from '@/lib/api';
import type { FeedAd, FeedAdCarouselCard } from '@/lib/feedAd';
import { marketplaceProductToCarouselCards, shuffleArray } from '@/lib/randomProductFeedAds';
import toast from 'react-hot-toast';

export type AdvertTileProps = FeedAd;

const CAPTION_PREVIEW_LEN = 160;
const HAMMANSKRAAL_WAREHOUSE_CITY = 'hammanskraal';
const DEFAULT_WAREHOUSE_CAPTION =
  'Enjoy free delivery within Hammanskraal on eligible items. Fresh stock from our local warehouse.';

function resolveMediaUrl(url?: string): string {
  if (!url) return '';
  return getImageUrl(url) || getImageUrlFull(url) || url;
}

function AdMedia({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const [direct, setDirect] = useState(false);
  const primary = resolveMediaUrl(src);
  const fallback = getImageUrlFull(src);
  const display = direct && fallback ? fallback : primary;

  if (!display || failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-sky-100 via-white to-sky-50 text-slate-500 ${className || ''}`}
      >
        <img src="/qwertymates-q-mark-official.png" alt="" className="h-16 w-16 opacity-80 mb-2" />
        <span className="text-xs font-medium">Sponsored on Qwertymates</span>
      </div>
    );
  }

  return (
    <img
      src={display}
      alt={alt}
      className={className}
      referrerPolicy="no-referrer"
      onError={() => {
        if (!direct && fallback && display !== fallback) {
          setDirect(true);
          return;
        }
        setFailed(true);
      }}
    />
  );
}

/** Alibaba/FB-style product card: square image + title + Shop now. */
function ProductCarouselCard({
  card,
  defaultTitle,
  defaultHref,
  ctaLabel,
  onCtaClick,
  fullWidth = false,
}: {
  card: FeedAdCarouselCard;
  defaultTitle: string;
  defaultHref: string;
  ctaLabel: string;
  onCtaClick?: () => void;
  fullWidth?: boolean;
}) {
  const href = card.linkUrl || defaultHref;
  const isExternal = href.startsWith('http');
  const title = card.title || defaultTitle;

  const inner = (
    <>
      <div className={`relative w-full bg-[#f5f0e8] ${fullWidth ? 'aspect-[4/5] max-h-[min(480px,58vh)]' : 'aspect-square'}`}>
        <AdMedia src={card.imageUrl} alt={title} className="h-full w-full object-cover" />
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-slate-200 bg-white px-2.5 py-2.5">
        <p className="min-w-0 flex-1 line-clamp-2 text-[13px] font-semibold leading-snug text-slate-900">
          {title}
        </p>
        <span className="inline-flex shrink-0 items-center justify-center rounded-md bg-[#e4e6eb] px-2.5 py-1.5 text-[12px] font-semibold text-slate-900">
          {ctaLabel}
        </span>
      </div>
    </>
  );

  const className = fullWidth
    ? 'block w-full cursor-pointer overflow-hidden bg-white'
    : 'block w-[min(220px,72vw)] shrink-0 cursor-pointer overflow-hidden rounded-md border border-slate-200 bg-white snap-start';

  if (isExternal) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className} onClick={onCtaClick}>
        {inner}
      </a>
    );
  }
  return (
    <Link href={href} className={className} onClick={onCtaClick}>
      {inner}
    </Link>
  );
}

/**
 * Facebook / Alibaba-style sponsored post in the wall feed.
 * Prefer Qwertymates Hammanskraal warehouse products for product carousels.
 */
export function AdvertTile(ad: AdvertTileProps) {
  const {
    _id,
    title,
    imageUrl,
    linkUrl,
    advertiserName,
    advertiserAvatar,
    caption,
    description,
    ctaLabel = 'Shop now',
    videoUrl,
    carouselCards,
    sponsoredAdId,
  } = ad;

  const [dismissed, setDismissed] = useState(false);
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const [warehouseCards, setWarehouseCards] = useState<FeedAdCarouselCard[]>([]);
  const [loadingProductCards, setLoadingProductCards] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const trackedImpression = useRef(false);

  const isHammanskraalWarehouseAd = /hammanskraal/i.test(`${advertiserName || ''} ${title || ''}`);
  const defaultHref = linkUrl || (isHammanskraalWarehouseAd ? '/marketplace?q=Hammanskraal' : '/marketplace');
  const brandName = isHammanskraalWarehouseAd
    ? advertiserName || 'Qwertymates - Hammanskraal warehouse'
    : advertiserName || title || 'Sponsored';
  const avatarSrc = resolveMediaUrl(advertiserAvatar);

  const seededCards = useMemo(
    () => (carouselCards || []).filter((c) => Boolean(c?.imageUrl?.trim())),
    [carouselCards]
  );

  const staticCards = useMemo(() => {
    // Hammanskraal ads always use product carousel (seeded + live refresh).
    if (isHammanskraalWarehouseAd) return [];
    if (seededCards.length) return seededCards;
    if (imageUrl?.trim() && !/placehold\.co|172\.\d+\.\d+\.\d+|\/marketplace\/?$/i.test(imageUrl)) {
      return [{ imageUrl, title, description, linkUrl: defaultHref }];
    }
    return [];
  }, [seededCards, imageUrl, title, description, defaultHref, isHammanskraalWarehouseAd]);

  // Show seeded warehouse cards immediately so we never flash the Q placeholder.
  const cards =
    staticCards.length > 0
      ? staticCards
      : warehouseCards.length > 0
        ? warehouseCards
        : isHammanskraalWarehouseAd
          ? seededCards
          : [];
  const shopCta = 'Shop now';
  const isMultiProductCarousel = cards.length > 1 && !videoUrl?.trim();
  const needsProductFetch =
    !videoUrl?.trim() && (isHammanskraalWarehouseAd || staticCards.length === 0);

  useEffect(() => {
    if (!needsProductFetch) return;
    let cancelled = false;
    // Keep showing seeded cards while refreshing; only show loader if nothing to show yet.
    if (cards.length === 0) setLoadingProductCards(true);
    void (async () => {
      try {
        const warehouseRes = await productsAPI.list({
          random: true,
          limit: isHammanskraalWarehouseAd ? 24 : 12,
          warehouseCity: HAMMANSKRAAL_WAREHOUSE_CITY,
        });
        if (cancelled) return;
        const warehouseRows = warehouseRes.data?.data ?? warehouseRes.data ?? [];
        const warehouseList = Array.isArray(warehouseRows) ? warehouseRows : [];
        // Expand every colour / gallery image so variants appear in the carousel.
        let built = shuffleArray(warehouseList).flatMap((p) => marketplaceProductToCarouselCards(p));
        // Deduplicate identical image URLs across products while keeping colourways.
        {
          const seenImg = new Set<string>();
          built = built.filter((c) => {
            const key = String(c.imageUrl || '').toLowerCase();
            if (!key || seenImg.has(key)) return false;
            seenImg.add(key);
            return true;
          });
        }
        if (built.length > 24) built = built.slice(0, 24);

        if (built.length < 2 && seededCards.length) {
          built = [...seededCards];
        }

        if (built.length < 3 && !isHammanskraalWarehouseAd) {
          const fallbackRes = await productsAPI.list({ random: true, limit: 8 });
          if (cancelled) return;
          const rows = fallbackRes.data?.data ?? fallbackRes.data ?? [];
          const list = Array.isArray(rows) ? rows : [];
          const extra = shuffleArray(list).flatMap((p) => marketplaceProductToCarouselCards(p));
          const seen = new Set(built.map((c) => String(c.imageUrl || '').toLowerCase()));
          for (const card of extra) {
            const key = String(card.imageUrl || '').toLowerCase();
            if (!key || seen.has(key)) continue;
            seen.add(key);
            built.push(card);
            if (built.length >= 12) break;
          }
        }

        if (built.length) setWarehouseCards(built);
        else if (seededCards.length) setWarehouseCards(seededCards);
      } catch {
        if (!cancelled && seededCards.length) setWarehouseCards(seededCards);
      } finally {
        if (!cancelled) setLoadingProductCards(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh when ad identity / seed changes
  }, [needsProductFetch, isHammanskraalWarehouseAd, seededCards, _id]);

  const trackClick = useCallback(() => {
    if (!sponsoredAdId) return;
    void advertsAPI.trackClick({
      adId: sponsoredAdId,
      placementKey: 'web_wall',
      platform: 'web',
    });
  }, [sponsoredAdId]);

  useEffect(() => {
    if (!sponsoredAdId || trackedImpression.current || dismissed) return;
    trackedImpression.current = true;
    void advertsAPI.trackImpression({
      adId: sponsoredAdId,
      placementKey: 'web_wall',
      platform: 'web',
    });
  }, [sponsoredAdId, dismissed]);

  if (dismissed) return null;

  const captionText = (
    caption ||
    (isHammanskraalWarehouseAd || staticCards.length === 0 ? DEFAULT_WAREHOUSE_CAPTION : '')
  ).trim();
  const showSeeMore = captionText.length > CAPTION_PREVIEW_LEN && !captionExpanded;
  const captionDisplay = showSeeMore
    ? `${captionText.slice(0, CAPTION_PREVIEW_LEN).trim()}…`
    : captionText;

  const shareAd = () => {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    if (navigator.share) {
      void navigator.share({ title: brandName, text: captionText || title, url }).catch(() => {});
      return;
    }
    if (url) {
      void navigator.clipboard.writeText(url);
      toast.success('Link copied');
    }
  };

  const scrollNext = () => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: Math.min(240, el.clientWidth * 0.75), behavior: 'smooth' });
  };

  return (
    <article
      className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"
      aria-label={`Sponsored ad from ${brandName}`}
      data-ad-id={_id}
    >
      {/* Header — Alibaba/FB style */}
      <div className="flex items-start gap-2.5 px-3 py-2.5">
        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200">
          {avatarSrc ? (
            <img src={avatarSrc} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <img src="/qwertymates-q-mark-official.png" alt="" className="h-full w-full object-cover" />
          )}
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="truncate text-[15px] font-bold text-slate-900 leading-tight">{brandName}</p>
          <p className="mt-0.5 flex items-center gap-1 text-[12px] text-slate-500">
            <span>Sponsored</span>
            <Globe className="h-3 w-3" aria-label="Public" />
          </p>
        </div>
        <button
          type="button"
          className="shrink-0 rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          aria-label="More options"
        >
          <MoreHorizontal className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="shrink-0 rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          aria-label="Hide ad"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {captionText ? (
        <div className="px-3 pb-3 text-[15px] text-slate-900 leading-snug">
          <span>{captionDisplay}</span>
          {showSeeMore ? (
            <button
              type="button"
              onClick={() => setCaptionExpanded(true)}
              className="ml-1 font-semibold text-slate-500 hover:text-slate-700"
            >
              See more
            </button>
          ) : null}
        </div>
      ) : null}

      {videoUrl?.trim() ? (
        <div className="relative bg-black">
          <video
            src={resolveMediaUrl(videoUrl) || videoUrl}
            className="w-full max-h-[min(520px,62vh)] object-contain"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
          />
          <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-white px-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">{title}</p>
              {description ? <p className="truncate text-xs text-slate-500 mt-0.5">{description}</p> : null}
            </div>
            {defaultHref.startsWith('http') ? (
              <a
                href={defaultHref}
                target="_blank"
                rel="noopener noreferrer"
                onClick={trackClick}
                className="inline-flex shrink-0 items-center justify-center rounded-md bg-[#e4e6eb] px-3 py-1.5 text-xs font-semibold text-slate-900"
              >
                {shopCta}
              </a>
            ) : (
              <Link
                href={defaultHref}
                onClick={trackClick}
                className="inline-flex shrink-0 items-center justify-center rounded-md bg-[#e4e6eb] px-3 py-1.5 text-xs font-semibold text-slate-900"
              >
                {shopCta}
              </Link>
            )}
          </div>
        </div>
      ) : isMultiProductCarousel ? (
        <div className="relative pb-1">
          <div
            ref={scrollRef}
            className="flex gap-2 overflow-x-auto px-3 pb-2 scroll-smooth snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {cards.map((card, i) => (
              <ProductCarouselCard
                key={`${card.linkUrl || card.imageUrl}-${i}`}
                card={card}
                defaultTitle={title}
                defaultHref={defaultHref}
                ctaLabel={shopCta}
                onCtaClick={trackClick}
              />
            ))}
          </div>
          {cards.length > 1 ? (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                scrollNext();
              }}
              className="absolute right-2 top-[42%] z-20 flex h-10 w-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-white shadow-md ring-1 ring-black/5 text-slate-700 hover:bg-slate-50 pointer-events-auto"
              aria-label="Next products"
              title="See more products"
            >
              <ChevronRight className="h-5 w-5 pointer-events-none" />
            </button>
          ) : null}
        </div>
      ) : cards.length === 1 ? (
        <div className="border-y border-slate-100">
          <ProductCarouselCard
            card={cards[0]}
            defaultTitle={title}
            defaultHref={defaultHref}
            ctaLabel={shopCta}
            onCtaClick={trackClick}
            fullWidth
          />
        </div>
      ) : loadingProductCards ? (
        <div className="border-y border-slate-100 px-3 py-16 text-center text-sm text-slate-500">
          Loading Hammanskraal warehouse picks…
        </div>
      ) : (
        <div className="border-y border-slate-100 px-3 py-6 text-center text-sm text-slate-500">
          Ad creative unavailable
        </div>
      )}

      {/* Engagement row — FB-style */}
      <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-3 py-2 text-slate-500">
        <div className="flex items-center gap-3 text-[13px]">
          <span className="inline-flex items-center gap-1">
            <ThumbsUp className="h-3.5 w-3.5" />
            <span>Shop local</span>
          </span>
          {isHammanskraalWarehouseAd || cards.length > 0 ? (
            <span className="inline-flex items-center gap-1">
              <MessageCircle className="h-3.5 w-3.5" />
              <span>Free in Hammanskraal</span>
            </span>
          ) : null}
        </div>
        <Share2 className="h-4 w-4 opacity-70" aria-hidden />
      </div>

      <div className="flex items-center justify-between border-t border-slate-100 px-1 py-0.5 text-slate-600">
        <button
          type="button"
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-medium hover:bg-slate-50"
          onClick={() => toast.success('Thanks for your interest!')}
        >
          <Heart className="h-4 w-4" />
          Like
        </button>
        <Link
          href={defaultHref}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-medium hover:bg-slate-50"
          onClick={trackClick}
        >
          <MessageCircle className="h-4 w-4" />
          Shop now
        </Link>
        <button
          type="button"
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-medium hover:bg-slate-50"
          onClick={shareAd}
        >
          <Share2 className="h-4 w-4" />
          Share
        </button>
      </div>
    </article>
  );
}
