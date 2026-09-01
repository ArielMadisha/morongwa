'use client';

import Link from 'next/link';
import { TransparentIcon } from '@/components/TransparentIcon';
import { MEDIA_CHIP_ROW_CLASS, mediaChipClass } from './mediaChip';

export type MediaSection = 'hub' | 'tv' | 'music' | 'podcasts' | 'images' | 'posts';

type SectionDef = {
  id: MediaSection;
  label: string;
  href: string;
  iconSrc?: string;
  transparentIcon?: boolean;
};

/** Top-level sections inside QwertyMedia — brand PNG icons (128×128, displayed at h-6 w-6). */
export const MEDIA_SECTIONS: SectionDef[] = [
  { id: 'hub', label: 'QwertyMedia', href: '/qwerty-media', iconSrc: '/qwertymedia-icon.png', transparentIcon: true },
  { id: 'tv', label: 'QwertyTV', href: '/morongwa-tv', iconSrc: '/qwertytv-icon.png', transparentIcon: true },
  { id: 'music', label: 'QwertyMusic', href: '/qwerty-music', iconSrc: '/music-icon.png' },
  { id: 'podcasts', label: 'QwertyPodcasts', href: '/qwerty-media/podcasts', iconSrc: '/qwertypodcasts-icon.png' },
  { id: 'images', label: 'QwertyImages', href: '/qwerty-media/images', iconSrc: '/qwertyimages-icon.png' },
  { id: 'posts', label: 'QwertyPosts', href: '/qwerty-media/posts', iconSrc: '/qwertyposts-icon.png' },
];

function SectionIcon({ section }: { section: SectionDef }) {
  if (!section.iconSrc) return null;
  if (section.transparentIcon) {
    return (
      <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md">
        <TransparentIcon src={section.iconSrc} alt="" className="h-6 w-6 object-contain" />
      </span>
    );
  }
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={section.iconSrc} alt="" className="h-6 w-6 object-contain" aria-hidden />
    </span>
  );
}

export function MediaSectionTabs({ active, className = '' }: { active: MediaSection; className?: string }) {
  return (
    <nav aria-label="QwertyMedia sections" className={`${MEDIA_CHIP_ROW_CLASS} ${className}`}>
      {MEDIA_SECTIONS.map((section) => {
        const on = section.id === active;
        return (
          <Link
            key={section.id}
            href={section.href}
            aria-current={on ? 'page' : undefined}
            className={mediaChipClass(on)}
          >
            <SectionIcon section={section} />
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}
