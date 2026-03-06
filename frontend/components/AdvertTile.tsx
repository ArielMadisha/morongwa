'use client';

import Link from 'next/link';

export interface AdvertTileProps {
  _id: string;
  title: string;
  imageUrl: string;
  linkUrl?: string;
}

/**
 * Renders as a post-like tile in the wall feed, interspersed between posts.
 * Same dimensions as posts (aspect-square, max-h-[min(580px,62vh)]).
 */
export function AdvertTile({ _id, title, imageUrl, linkUrl }: AdvertTileProps) {
  const href = linkUrl || '/marketplace';
  const isExternal = href.startsWith('http');

  const content = (
    <div className="rounded-lg overflow-hidden bg-white border border-slate-100 shadow-sm flex flex-col">
      <div className="relative aspect-square w-full mx-auto bg-slate-900 max-h-[min(580px,62vh)]">
        <img
          src={imageUrl}
          alt={title}
          className="w-full h-full object-cover"
        />
        <span className="absolute top-2 right-2 px-2 py-0.5 text-xs rounded-full bg-brand-50 text-brand-700 border border-brand-100">
          Sponsored
        </span>
      </div>
      <div className="p-3 border-t border-slate-100">
        <h3 className="font-semibold text-slate-800 line-clamp-1 text-sm">{title}</h3>
        <p className="text-xs text-slate-500 mt-0.5">Sponsored</p>
      </div>
    </div>
  );

  if (isExternal) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="block">
        {content}
      </a>
    );
  }
  return (
    <Link href={href} className="block">
      {content}
    </Link>
  );
}
