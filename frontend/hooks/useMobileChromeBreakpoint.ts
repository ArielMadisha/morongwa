'use client';

import { useEffect, useState } from 'react';

/** Phones use bottom nav + scroll-aware chrome; tablets (768px+) use sidebar — matches Tailwind `md`. */
export const MOBILE_CHROME_MAX_WIDTH_PX = 767;

export function useMobileChromeBreakpoint(): boolean {
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_CHROME_MAX_WIDTH_PX}px)`);
    const sync = () => setMobile(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  return mobile;
}
