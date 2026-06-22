'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { AppSidebarMenuButton } from '@/components/AppSidebar';

/** Official round Q mark — hidden from tablet+ when sidebar/wordmark shows. */
export const APP_SHELL_MOBILE_LOGO_CLASS =
  'h-11 w-11 sm:h-12 sm:w-12 object-contain md:hidden shrink-0 rounded-full';

/** Same asset/size; `md:hidden` where desktop layout starts at `md` (e.g. SiteHeader). */
export const APP_SHELL_MOBILE_LOGO_MD_HIDDEN_CLASS =
  'h-11 w-11 sm:h-12 sm:w-12 object-contain md:hidden shrink-0 rounded-full';

export type AppShellHeaderProps = {
  homeHref?: string;
  onMenuClick?: () => void;
  /** Set false for public pages without drawer (e.g. guest marketplace). */
  showMenuButton?: boolean;
  /** Icon + title row between logo and actions */
  center: ReactNode;
  /** Search, profile, cart, etc. */
  actions: ReactNode;
  /** Optional second row full width below the first (e.g. QwertyTV live strip) */
  bottom?: ReactNode;
  className?: string;
};

/**
 * Consistent sticky header for app-shell pages (mobile web): wrap layout, large Q mark, menu, actions.
 */
export function AppShellHeader({
  homeHref = '/wall',
  onMenuClick,
  showMenuButton = true,
  center,
  actions,
  bottom,
  className = '',
}: AppShellHeaderProps) {
  return (
    <header
      className={`sticky top-0 z-50 w-full flex-shrink-0 bg-white/95 backdrop-blur-md border-b border-slate-100 shadow-sm ${className}`}
    >
      <div className="px-3 sm:px-6 lg:px-8 py-2.5 sm:py-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2 sm:gap-4 min-w-0">
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            <Link href={homeHref} className="shrink-0 flex items-center" aria-label="Home">
              <img
                src="/qwertymates-q-mark-official.png"
                alt=""
                className={APP_SHELL_MOBILE_LOGO_CLASS}
                width={48}
                height={48}
                aria-hidden
              />
              <img
                src="/qwertymates-logo.png"
                alt="Qwertymates"
                className="h-8 sm:h-9 w-auto max-w-[min(100%,220px)] object-contain hidden md:block"
              />
            </Link>
            {showMenuButton && onMenuClick ? <AppSidebarMenuButton onClick={onMenuClick} /> : null}
          </div>
          <div className="flex items-center gap-2 min-w-0 flex-1 basis-[min(100%,12rem)] sm:basis-auto">{center}</div>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0 ml-auto flex-wrap justify-end">{actions}</div>
        </div>
        {bottom ? <div className="mt-2 min-w-0 w-full">{bottom}</div> : null}
      </div>
    </header>
  );
}
