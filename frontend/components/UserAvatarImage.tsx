'use client';

import { useMemo, useState } from 'react';
import { getImageUrl, getImageUrlFull } from '@/lib/api';

type Props = {
  avatar?: string | null;
  alt?: string;
  className?: string;
  fallbackLetter?: string;
};

function basenameFromAvatar(avatar: string): string {
  const s = avatar.trim();
  if (!s || s.includes('/')) return '';
  return s;
}

/** Profile / sidebar avatar with legacy path + API fallbacks when the primary src fails. */
export function UserAvatarImage({ avatar, alt = '', className = '', fallbackLetter = '?' }: Props) {
  const [srcIndex, setSrcIndex] = useState(0);

  const candidates = useMemo(() => {
    const raw = String(avatar || '').trim();
    if (!raw) return [] as string[];
    const urls: string[] = [];
    const primary = getImageUrl(raw);
    if (primary) urls.push(primary);
    const base = basenameFromAvatar(raw);
    if (base) {
      const profiles = getImageUrl(`/uploads/profiles/${base}`);
      const root = getImageUrl(`/uploads/${base}`);
      if (profiles && !urls.includes(profiles)) urls.push(profiles);
      if (root && !urls.includes(root)) urls.push(root);
    }
    const full = getImageUrlFull(raw);
    if (full && !urls.includes(full)) urls.push(full);
    return urls;
  }, [avatar]);

  const src = candidates[srcIndex];

  if (!src) {
    return (
      <span className={`flex h-full w-full items-center justify-center font-bold ${className}`}>
        {fallbackLetter.charAt(0).toUpperCase() || '?'}
      </span>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      referrerPolicy="no-referrer"
      onError={() => {
        setSrcIndex((i) => (i + 1 < candidates.length ? i + 1 : i));
      }}
    />
  );
}
