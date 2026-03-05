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
    <div className="rounded-lg overflow-hidden bg-white shadow-xs hover:shadow-md transition cursor-pointer">
      <div className="relative">
        <img
          src={imageUrl}
          alt={title}
          className="h-56 w-full object-cover rounded-t-lg"
        />
        <span className="absolute top-2 right-2 px-2 py-0.5 text-xs rounded-full bg-brand-50 text-brand-700 border border-brand-100">
          Sponsored
        </span>
      </div>
      <div className="p-2">
        <h3 className="font-semibold text-slate-800 line-clamp-1 text-sm">{title}</h3>
        <p className="text-xs text-slate-500 mt-0.5">Tap to view more</p>
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
