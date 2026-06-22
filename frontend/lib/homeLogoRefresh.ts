import type { MouseEvent } from 'react';

/**
 * When the logo links to the same path as the current page (e.g. already on /wall or /),
 * do a full browser reload instead of a no-op client navigation.
 */
export function onHomeLogoClick(e: MouseEvent<HTMLAnchorElement>, href: string): void {
  if (typeof window === 'undefined') return;
  try {
    const cur = window.location.pathname.replace(/\/$/, '') || '/';
    const next = new URL(href, window.location.origin).pathname.replace(/\/$/, '') || '/';
    if (cur === next) {
      e.preventDefault();
      window.location.reload();
    }
  } catch {
    /* ignore */
  }
}
