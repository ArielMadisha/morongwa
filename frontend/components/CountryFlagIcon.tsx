'use client';

/**
 * Small flag from ISO 3166-1 alpha-2 using regional-indicator emoji (no image CDN).
 * Falls back to nothing for invalid codes.
 */

export function iso2CountryFlagEmoji(iso: string): string | null {
  const c = iso.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return null;
  const base = 0x1f1e6;
  const chars = [...c].map((ch) => base + (ch.charCodeAt(0) - 65));
  return String.fromCodePoint(...chars);
}

function regionDisplayName(iso: string): string {
  try {
    const dn = new Intl.DisplayNames(['en'], { type: 'region' });
    return dn.of(iso) || iso;
  } catch {
    return iso;
  }
}

/** Prefer API countryCode; legacy SA school imports often use numeric-only usernames. */
export function effectiveUserCountryCode(u: {
  countryCode?: string | null;
  username?: string | null;
}): string | null {
  const cc = String(u.countryCode || '')
    .trim()
    .toUpperCase();
  if (/^[A-Z]{2}$/.test(cc)) return cc;
  const raw = String(u.username || '')
    .trim()
    .replace(/^@/, '');
  if (/^\d+$/.test(raw)) return 'ZA';
  return null;
}

export function CountryFlagIcon({
  code,
  className = '',
  sizeClass = 'text-base',
}: {
  code?: string | null;
  className?: string;
  /** Tailwind text size; emoji scales with font size */
  sizeClass?: string;
}) {
  const iso = String(code || '')
    .trim()
    .toUpperCase();
  const emoji = iso2CountryFlagEmoji(iso);
  if (!emoji) return null;
  const label = regionDisplayName(iso);
  return (
    <span
      className={`inline-block shrink-0 select-none ${sizeClass} leading-none ${className}`}
      title={label}
      role="img"
      aria-label={label}
    >
      {emoji}
    </span>
  );
}
