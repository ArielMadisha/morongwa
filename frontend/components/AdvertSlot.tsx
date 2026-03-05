'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { advertsAPI, tvAPI } from '@/lib/api';
import { TrendingUp } from 'lucide-react';

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

interface AdvertSlotProps {
  /** When true, slot sticks below fixed header */
  belowHeader?: boolean;
}

/**
 * Web: Right-hand advert column - top square (sponsored/random ads only).
 * Use on all app pages for consistent design.
 */
export function AdvertSlot({ belowHeader }: AdvertSlotProps = {}) {
  const [randomAdverts, setRandomAdverts] = useState<Advert[]>([]);
  const [trendingHashtags, setTrendingHashtags] = useState<{ tag: string; count: number }[]>([]);

  useEffect(() => {
    advertsAPI.getAdverts('random')
      .then((res) => {
        const r = res.data?.data ?? res.data ?? [];
        setRandomAdverts(Array.isArray(r) ? r : []);
      })
      .catch(() => setRandomAdverts([]));
  }, []);

  useEffect(() => {
    tvAPI.getTrendingHashtags(10)
      .then((res) => {
        const d = res.data?.data ?? res.data ?? [];
        setTrendingHashtags(Array.isArray(d) ? d : []);
      })
      .catch(() => setTrendingHashtags([]));
  }, []);

  const randomAd = useMemo(() => {
    if (randomAdverts.length === 0) return null;
    return randomAdverts[Math.floor(Math.random() * randomAdverts.length)];
  }, [randomAdverts]);

  const renderAdBlock = (ad: Advert, square?: boolean) => {
    const href = ad.linkUrl || '/marketplace';
    const isExternal = href.startsWith('http');
    const content = (
      <div className="rounded-xl overflow-hidden shadow-sm border border-slate-200 bg-white hover:shadow-md transition">
        <img
          src={ad.imageUrl}
          alt={ad.title}
          className={`w-full object-cover ${square ? 'aspect-square' : 'aspect-[4/3] min-h-[100px]'}`}
        />
        <div className="p-3">
          <h4 className="font-semibold text-slate-900 line-clamp-1">{ad.title}</h4>
          <span className="text-xs text-brand-600 font-medium">Sponsored</span>
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

  const headerOffset = belowHeader ? 'top-14' : 'top-0';
  const asideHeight = belowHeader ? 'h-[calc(100vh-3.5rem)]' : 'h-screen';
  return (
    <>
    {/* Mobile: horizontal trending strip - appears above feed when container is flex-col */}
    {trendingHashtags.length > 0 && (
      <div className="lg:hidden flex-shrink-0 px-4 py-2 overflow-x-auto scrollbar-thin order-1">
        <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-2 font-semibold">Trending now</p>
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
          {trendingHashtags.map((h) => (
            <Link
              key={h.tag}
              href={`/wall?q=%23${encodeURIComponent(h.tag)}`}
              className="flex items-center gap-1.5 shrink-0 px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm text-slate-800 hover:bg-sky-50 hover:border-sky-200 transition-colors"
            >
              <TrendingUp className="h-4 w-4 text-sky-500 shrink-0" />
              <span className="font-medium">#{h.tag}</span>
              <span className="text-slate-500 text-xs">{h.count} post{h.count !== 1 ? 's' : ''}</span>
            </Link>
          ))}
        </div>
      </div>
    )}
    <aside className={`sticky ${headerOffset} self-start hidden lg:flex flex-col w-56 xl:w-64 shrink-0 gap-2 pt-2 pr-2 lg:pr-4 ${asideHeight} order-3`}>
      <div className="space-y-2">
        {trendingHashtags.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-3 font-semibold">Trending now</p>
            <ul className="space-y-2">
              {trendingHashtags.map((h) => (
                <li key={h.tag}>
                  <Link
                    href={`/wall?q=%23${encodeURIComponent(h.tag)}`}
                    className="flex items-center gap-2 text-sm text-slate-800 hover:text-sky-600 transition-colors"
                  >
                    <TrendingUp className="h-4 w-4 text-sky-500 shrink-0" />
                    <span className="font-medium">#{h.tag}</span>
                    <span className="text-slate-500 text-xs">{h.count} public post{h.count !== 1 ? 's' : ''}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
        {randomAd ? (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Sponsored</p>
            {renderAdBlock(randomAd, true)}
          </div>
        ) : (
          <div className="rounded-xl h-48 border border-dashed border-slate-300 grid place-items-center text-slate-400 text-sm">
            Ad Space
          </div>
        )}
      </div>
    </aside>
    </>
  );
}
