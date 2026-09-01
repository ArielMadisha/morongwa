'use client';

import Link from 'next/link';
import { GENRES } from './GenresDropdown';
import { MediaChipRow } from '@/components/media/MediaChipRow';
import { mediaChipClass } from '@/components/media/mediaChip';

/** Genre chips for the QwertyTV catalog — the reference chip pattern for all QwertyMedia sections. */
export function TvGenreChips({
  selectedGenre,
  onSelect,
  className = '',
}: {
  selectedGenre?: string;
  onSelect?: (genreId: string) => void;
  className?: string;
}) {
  return (
    <MediaChipRow
      ariaLabel="TV genres"
      className={className}
      selected={selectedGenre}
      onSelect={onSelect}
      options={GENRES.map((g) => ({ id: g.id, label: g.label, title: g.desc }))}
      leading={
        <Link
          href="/morongwa-tv/live"
          className={mediaChipClass(selectedGenre === 'live')}
          title="Live channels and streaming right now"
        >
          Live TV
        </Link>
      }
    />
  );
}
