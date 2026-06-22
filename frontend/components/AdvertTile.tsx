'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ChevronLeft,
  ChevronRight,
  Globe,
  Heart,
  MessageCircle,
  MoreHorizontal,
  Share2,
  X,
} from 'lucide-react';
import { advertsAPI, getImageUrl, getImageUrlFull } from '@/lib/api';
import type { FeedAd, FeedAdCarouselCard } from '@/lib/feedAd';
import toast from 'react-hot-toast';

export type AdvertTileProps = FeedAd;

const CAPTION_PREVIEW_LEN = 125;

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

function CarouselCard({
  card,
  defaultTitle,
  defaultDescription,
  defaultHref,
  ctaLabel,
  onCtaClick,
}: {
  card: FeedAdCarouselCard;
  defaultTitle: string;
  defaultDescription?: string;
  defaultHref: string;
  ctaLabel: string;
  onCtaClick?: () => void;
}) {
  const href = card.linkUrl || defaultHref;
  const isExternal = href.startsWith('http');
  const title = card.title || defaultTitle;
  const description = card.description || defaultDescription;

  const cta = (
    <span className="inline-flex shrink-0 items-center justify-center rounded-md border border-slate-300 bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-200">
      {ctaLabel}
    </span>
  );

  const footer = (
    <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-900">{title}</p>
        {description ? <p className="truncate text-xs text-slate-500 mt-0.5">{description}</p> : null}
      </div>
      {cta}
    </div>
  );

  const inner = (
    <>
      <div className="relative aspect-[4/5] max-h-[min(520px,62vh)] w-full bg-slate-100">
        <AdMedia src={card.imageUrl} alt={title} className="h-full w-full object-cover" />
      </div>
      {footer}
    </>
  );

  if (isExternal) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="block" onClick={onCtaClick}>
        {inner}
      </a>
    );
  }
  return (
    <Link href={href} className="block" onClick={onCtaClick}>
      {inner}
    </Link>
  );
}

/**
 * Facebook-style sponsored post in the wall feed.
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
    ctaLabel = 'Learn more',
    videoUrl,
    carouselCards,
    sponsoredAdId,
  } = ad;

  const [dismissed, setDismissed] = useState(false);
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const trackedImpression = useRef(false);

  const defaultHref = linkUrl || '/marketplace';
  const brandName = advertiserName || title || 'Sponsored';
  const avatarSrc = resolveMediaUrl(advertiserAvatar);
  const cards = useMemo(() => {
    if (carouselCards?.length) return carouselCards;
    if (imageUrl?.trim()) {
      return [{ imageUrl, title, description, linkUrl: defaultHref }];
    }
    return [];
  }, [carouselCards, imageUrl, title, description, defaultHref]);

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

  const captionText = (caption || '').trim();
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

  const activeCard = cards[carouselIndex] ?? cards[0];

  return (
    <article
      className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"
      aria-label={`Sponsored ad from ${brandName}`}
      data-ad-id={_id}
    >
      <div className="flex items-start gap-2 px-3 py-2.5">
        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-slate-200 ring-1 ring-slate-200">
          {avatarSrc ? (
            <img src={avatarSrc} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <img src="/qwertymates-q-mark-official.png" alt="" className="h-full w-full object-cover p-1" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900 leading-tight">{brandName}</p>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
            <span className="font-medium">Ad</span>
            <span aria-hidden>·</span>
            <Globe className="h-3 w-3" aria-label="Public" />
          </p>
        </div>
        <button
          type="button"
          className="shrink-0 rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          aria-label="More options"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="shrink-0 rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          aria-label="Hide ad"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {captionText ? (
        <div className="px-3 pb-2 text-sm text-slate-800 leading-snug">
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
        </div>
      ) : cards.length > 0 ? (
        <div className="relative border-y border-slate-100">
          {cards.length > 1 ? (
            <>
              {carouselIndex > 0 ? (
                <button
                  type="button"
                  onClick={() => setCarouselIndex((i) => Math.max(0, i - 1))}
                  className="absolute left-2 top-[38%] z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/95 shadow-md text-slate-700 hover:bg-white"
                  aria-label="Previous slide"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
              ) : null}
              {carouselIndex < cards.length - 1 ? (
                <button
                  type="button"
                  onClick={() => setCarouselIndex((i) => Math.min(cards.length - 1, i + 1))}
                  className="absolute right-2 top-[38%] z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/95 shadow-md text-slate-700 hover:bg-white"
                  aria-label="Next slide"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              ) : null}
              <div className="absolute bottom-[4.5rem] left-0 right-0 flex justify-center gap-1.5 z-10 pointer-events-none">
                {cards.map((_, i) => (
                  <span
                    key={i}
                    className={`h-1.5 w-1.5 rounded-full ${i === carouselIndex ? 'bg-sky-500' : 'bg-white/70'}`}
                  />
                ))}
              </div>
            </>
          ) : null}
          {activeCard ? (
            <CarouselCard
              card={activeCard}
              defaultTitle={title}
              defaultDescription={description}
              defaultHref={defaultHref}
              ctaLabel={ctaLabel}
              onCtaClick={trackClick}
            />
          ) : null}
        </div>
      ) : (
        <div className="border-y border-slate-100 px-3 py-6 text-center text-sm text-slate-500">
          Ad creative unavailable
        </div>
      )}

      {videoUrl?.trim() || cards.length === 0 ? (
        <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-3 py-2.5">
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
              className="inline-flex shrink-0 items-center justify-center rounded-md border border-slate-300 bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-200"
            >
              {ctaLabel}
            </a>
          ) : (
            <Link
              href={defaultHref}
              onClick={trackClick}
              className="inline-flex shrink-0 items-center justify-center rounded-md border border-slate-300 bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-200"
            >
              {ctaLabel}
            </Link>
          )}
        </div>
      ) : null}

      <div className="flex items-center justify-between border-t border-slate-100 px-2 py-1 text-slate-600">
        <button
          type="button"
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium hover:bg-slate-50"
          onClick={() => toast.success('Thanks for your interest!')}
        >
          <Heart className="h-4 w-4" />
          Like
        </button>
        <button
          type="button"
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium hover:bg-slate-50"
          onClick={trackClick}
        >
          <MessageCircle className="h-4 w-4" />
          Learn more
        </button>
        <button
          type="button"
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium hover:bg-slate-50"
          onClick={shareAd}
        >
          <Share2 className="h-4 w-4" />
          Share
        </button>
      </div>
    </article>
  );
}
