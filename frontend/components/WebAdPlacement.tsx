'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { advertsAPI } from '@/lib/api';

type Audience = 'generic' | 'wallet' | 'runner' | 'merchant' | 'shopper';

type SponsoredAd = {
  id: string;
  title: string;
  caption?: string;
  videoUrl?: string;
  ctaLabel?: string;
  ctaUrl?: string;
};

export function WebAdPlacement({
  placement,
  audience = 'generic',
  className = '',
  variant = 'video',
}: {
  placement: string;
  audience?: Audience;
  className?: string;
  variant?: 'video' | 'offer' | 'banner';
}) {
  const [ad, setAd] = useState<SponsoredAd | null>(null);
  const [showSkip, setShowSkip] = useState(false);
  const [hidden, setHidden] = useState(false);
  const trackedImpression = useRef(false);

  useEffect(() => {
    let cancelled = false;
    advertsAPI
      .getSponsored({ placement, audience, platform: 'web', limit: 1 })
      .then((res) => {
        const first = (res.data?.data || [])[0];
        if (!cancelled) setAd(first || null);
      })
      .catch(() => {
        if (!cancelled) setAd(null);
      });
    return () => {
      cancelled = true;
    };
  }, [placement, audience]);

  useEffect(() => {
    if (!ad || trackedImpression.current) return;
    trackedImpression.current = true;
    void advertsAPI.trackImpression({
      adId: ad.id,
      placementKey: placement,
      audience,
      platform: 'web',
    });
  }, [ad, placement, audience]);

  useEffect(() => {
    if (variant !== 'video' || !ad) return;
    const t = setTimeout(() => setShowSkip(true), 3000);
    return () => clearTimeout(t);
  }, [variant, ad]);

  const href = useMemo(() => String(ad?.ctaUrl || '/marketplace'), [ad]);
  const external = href.startsWith('http');
  if (!ad || hidden) return null;

  const onClick = () => {
    void advertsAPI.trackClick({
      adId: ad.id,
      placementKey: placement,
      audience,
      platform: 'web',
    });
  };

  const card = (
    <div className={`rounded-xl border border-emerald-100 bg-white shadow-sm ${className}`}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-emerald-50">
        <p className="text-[10px] uppercase tracking-wider text-emerald-600 font-semibold">Sponsored</p>
        {variant === 'video' && showSkip ? (
          <button
            type="button"
            onClick={() => setHidden(true)}
            className="text-[11px] text-slate-500 hover:text-slate-700"
          >
            Skip
          </button>
        ) : null}
      </div>
      <div className="p-3">
        {ad.videoUrl ? (
          <video
            src={ad.videoUrl}
            autoPlay={variant === 'video'}
            muted
            loop={variant !== 'offer'}
            playsInline
            preload="metadata"
            className="w-full rounded-lg bg-slate-100 max-h-56 object-cover"
          />
        ) : null}
        <p className="mt-2 text-sm font-semibold text-slate-900">{ad.title}</p>
        {ad.caption ? <p className="mt-1 text-xs text-slate-600">{ad.caption}</p> : null}
      </div>
    </div>
  );

  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" onClick={onClick}>
        {card}
      </a>
    );
  }
  return (
    <Link href={href} onClick={onClick}>
      {card}
    </Link>
  );
}

