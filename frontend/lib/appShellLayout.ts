/**
 * App shell responsive split: tablets (768px+) use desktop sidebar; phones use bottom nav.
 * Tailwind `md` = 768px — iPad portrait/landscape and Android tablets.
 */

/** Hide on tablet+ (sidebar visible). */
export const HIDE_TABLET_UP = 'md:hidden';

/** Show from tablet+ only. */
export const SHOW_TABLET_UP = 'hidden md:flex';

/** Show block from tablet+ only. */
export const SHOW_TABLET_UP_BLOCK = 'hidden md:block';

/** Bottom padding when mobile bottom nav is visible (phones only). */
export const PAGE_PAD_BOTTOM_MOBILE_NAV = 'pb-24 md:pb-6';
