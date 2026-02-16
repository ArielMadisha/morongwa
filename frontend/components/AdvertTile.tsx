'use client';

import Link from 'next/link';

export interface AdvertTileProps {
  _id: string;
  title: string;
  imageUrl: string;
  linkUrl?: string;
}

/**
 * Mobile: Renders as a post-like tile in the wall feed.
 * Use with lg:hidden so it only shows on mobile (desktop uses AdvertSlot in right column).
 */
export function AdvertTile({ _id, title, imageUrl, linkUrl }: AdvertTileProps) {
  const href = linkUrl || '/marketplace';
  const isExternal = href.startsWith('http');

  const content = (
    <div className="relative overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm aspect-square">
      <img
        src={imageUrl}
        alt={title}
        className="w-full h-full object-cover"
      />
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
        <span className="text-[10px] uppercase text-sky-200">Sponsored</span>
        <p className="text-white text-sm font-medium line-clamp-2">{title}</p>
      </div>
    </div>
  );

  if (isExternal) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="block lg:hidden">
        {content}
      </a>
    );
  }
  return (
    <Link href={href} className="block lg:hidden">
      {content}
    </Link>
  );
}
