'use client';

import type { ReactNode } from 'react';
import { useCallback, useState } from 'react';
import { AdvertSlot } from '@/components/AdvertSlot';
import { AppSidebar } from '@/components/AppSidebar';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import {
  CollapsibleBottomChrome,
  CollapsibleChrome,
  ScrollAwareChromeProvider,
  useScrollAwareScrollAttachRef,
} from '@/components/ScrollAwareChrome';

/** Card grid geometry shared by QwertyTV, QwertyMusic, QwertyPodcasts and the QwertyMedia hub. */
export const MEDIA_GRID_CLASS = 'grid w-full grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3';

type Props = {
  /** Page header (AppShellHeader or a page-specific header element). */
  header: ReactNode;
  /** Main content. Receives the scroll container so feeds can drive IntersectionObserver paging. */
  children: (scrollRoot: HTMLDivElement | null) => ReactNode;
  menuOpen: boolean;
  setMenuOpen: (open: boolean | ((v: boolean) => boolean)) => void;
  user?: { _id?: string; id?: string; name?: string; avatar?: string } | null;
  cartCount?: number;
  hasStore?: boolean;
  onLogout: () => void;
  /** Extra widgets appended under the right rail (e.g. QwertyMusic artist verification). */
  railBottomContent?: ReactNode;
  /** Notified when the scroll container mounts, for pages that own their paging observer. */
  onScrollRootChange?: (el: HTMLDivElement | null) => void;
};

/**
 * One page shell for every QwertyMedia surface: sidebar, left-aligned full-width content
 * column, and the standard right rail (Trending now, Qwerty Users, Sponsored, Birthdays).
 */
export function MediaPageShell(props: Props) {
  return (
    <ScrollAwareChromeProvider>
      <MediaPageShellInner {...props} />
    </ScrollAwareChromeProvider>
  );
}

function MediaPageShellInner({
  header,
  children,
  menuOpen,
  setMenuOpen,
  user,
  cartCount,
  hasStore,
  onLogout,
  railBottomContent,
  onScrollRootChange,
}: Props) {
  const [scrollRoot, setScrollRootState] = useState<HTMLDivElement | null>(null);
  const setScrollRootBase = useCallback(
    (el: HTMLDivElement | null) => {
      setScrollRootState(el);
      onScrollRootChange?.(el);
    },
    [onScrollRootChange]
  );
  const setScrollRoot = useScrollAwareScrollAttachRef(setScrollRootBase);

  const handleMainWheelCapture: React.WheelEventHandler<HTMLElement> = (e) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (!scrollRoot) return;
    if (scrollRoot.scrollHeight <= scrollRoot.clientHeight) return;
    scrollRoot.scrollTop += e.deltaY;
    e.preventDefault();
  };

  return (
    <div className="flex h-[100dvh] min-h-screen flex-col overflow-hidden bg-gradient-to-br from-sky-50 via-blue-50 to-white text-slate-900">
        <CollapsibleChrome edge="top">{header}</CollapsibleChrome>
        <div className="flex min-h-0 min-w-0 w-full flex-1">
          <AppSidebar
            variant="wall"
            userName={user?.name}
            userAvatar={user?.avatar}
            userId={user?._id || user?.id}
            cartCount={cartCount}
            hasStore={hasStore}
            onLogout={onLogout}
            menuOpen={menuOpen}
            setMenuOpen={setMenuOpen}
            hideLogo
            belowHeader
          />
          <div
            ref={setScrollRoot}
            className="flex min-h-0 min-w-0 w-full flex-1 flex-col gap-0 overflow-y-auto overflow-x-hidden overscroll-contain touch-pan-y lg:flex-row"
          >
            <main
              onWheelCapture={handleMainWheelCapture}
              className="order-2 box-border w-full min-w-0 flex-1 px-3 pb-24 pt-0 sm:px-6 md:pb-6 lg:order-none lg:px-8"
            >
              {children(scrollRoot)}
            </main>
            <AdvertSlot belowHeader scrollWithPage bottomContent={railBottomContent} />
          </div>
        </div>
      <CollapsibleBottomChrome>
        <MobileBottomNav cartCount={cartCount} hasStore={hasStore} embedded />
      </CollapsibleBottomChrome>
    </div>
  );
}
