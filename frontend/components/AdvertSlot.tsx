'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { advertsAPI } from '@/lib/api';

export interface Advert {
  _id: string;
  title: string;
  imageUrl: string;
  linkUrl?: string;
  slot: 'random' | 'promo';
  productId?: string;
  active: boolean;
  order?: number;
}

/**
 * Web: Right-hand advert column - top square (sponsored/random ads only).
 * Use on all app pages for consistent design.
 */
export function AdvertSlot() {
  const [randomAdverts, setRandomAdverts] = useState<Advert[]>([]);

  useEffect(() => {
    advertsAPI.getAdverts('random')
      .then((res) => {
        const r = res.data?.data ?? res.data ?? [];
        setRandomAdverts(Array.isArray(r) ? r : []);
      })
      .catch(() => setRandomAdverts([]));
  }, []);

  const randomAd = useMemo(() => {
    if (randomAdverts.length === 0) return null;
    return randomAdverts[Math.floor(Math.random() * randomAdverts.length)];
  }, [randomAdverts]);

  const renderAdBlock = (ad: Advert, square?: boolean) => {
    const href = ad.linkUrl || '/marketplace';
    const isExternal = href.startsWith('http');
    const content = (
      <div className={`relative overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm transition hover:shadow-md ${square ? 'aspect-square' : 'aspect-[4/3] min-h-[140px]'}`}>
        <img
          src={ad.imageUrl}
          alt={ad.title}
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
          <p className="text-white text-xs font-medium line-clamp-2">{ad.title}</p>
        </div>
      </div>
    );
    if (isExternal) {
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" className="block relative">
          {content}
        </a>
      );
    }
    return (
      <Link href={href} className="block relative">
        {content}
      </Link>
    );
  };

  return (
    <aside className="hidden lg:flex flex-col w-56 xl:w-64 shrink-0 gap-4 pt-8 pr-4 lg:pr-6">
      <div className="sticky top-24 space-y-4">
        {randomAd ? (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Sponsored</p>
            {renderAdBlock(randomAd, true)}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 aspect-square flex items-center justify-center">
            <span className="text-xs text-slate-400">Ad space</span>
          </div>
        )}
      </div>
    </aside>
  );
}
