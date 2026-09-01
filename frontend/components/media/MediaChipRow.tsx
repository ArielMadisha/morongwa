'use client';

import type { ReactNode } from 'react';
import { MEDIA_CHIP_ROW_CLASS, mediaChipClass } from './mediaChip';

export type MediaChipOption = { id: string; label: string; title?: string };

/**
 * Genre / category chip row shared by QwertyTV, QwertyMusic and QwertyPodcasts.
 * QwertyTV's genre row is the reference design; every section renders through this component.
 */
export function MediaChipRow({
  ariaLabel,
  options,
  selected,
  onSelect,
  allLabel = 'All',
  leading,
  className = '',
}: {
  ariaLabel: string;
  options: MediaChipOption[];
  selected?: string;
  onSelect?: (id: string) => void;
  allLabel?: string;
  /** Extra chips rendered right after "All" (e.g. QwertyTV's Live TV link). */
  leading?: ReactNode;
  className?: string;
}) {
  const active = selected && selected !== '' ? selected : 'all';
  return (
    <div role="group" aria-label={ariaLabel} className={`${MEDIA_CHIP_ROW_CLASS} ${className}`}>
      <button type="button" onClick={() => onSelect?.('all')} className={mediaChipClass(active === 'all')}>
        {allLabel}
      </button>
      {leading}
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onSelect?.(o.id)}
          className={mediaChipClass(active === o.id)}
          title={o.title}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
