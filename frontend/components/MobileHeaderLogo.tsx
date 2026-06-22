'use client';

import Link from 'next/link';
import type { MouseEvent } from 'react';
import { MOBILE_HEADER_LOGO_SRC, MOBILE_Q_LOGO_SIZE_CLASS } from '@/lib/mobileHeaderLogo';

export type MobileHeaderLogoProps = {
  href?: string;
  /** When sidebar or desktop wordmark replaces this icon */
  hideWhen?: 'lg' | 'md';
  onLogoClick?: (e: MouseEvent<HTMLAnchorElement>) => void;
  className?: string;
};

/**
 * Q mark home link for mobile headers. Hidden at `lg` (app shell + sidebar wordmark)
 * or `md` (marketing SiteHeader wordmark).
 */
export function MobileHeaderLogo({
  href = '/wall',
  hideWhen = 'md',
  onLogoClick,
  className = '',
}: MobileHeaderLogoProps) {
  const hideCls = hideWhen === 'md' ? 'md:hidden' : 'lg:hidden';
  return (
    <Link
      href={href}
      onClick={onLogoClick}
      className={`shrink-0 flex items-center ${className}`}
      aria-label="Qwertymates home"
    >
      <img
        src={MOBILE_HEADER_LOGO_SRC}
        alt="Qwertymates"
        className={`${MOBILE_Q_LOGO_SIZE_CLASS} ${hideCls}`}
        width={40}
        height={40}
      />
    </Link>
  );
}
