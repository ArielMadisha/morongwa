'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useMessengerUnread } from '@/contexts/MessengerUnreadContext';
import { useMobileChromeBreakpoint } from '@/hooks/useMobileChromeBreakpoint';
import { useScrollAwareChromeBroadcast } from '@/hooks/useScrollAwareChromeBroadcast';

/** Global Morongwa shortcut — hidden on admin, auth-only, embed, and messages (already there). */
const FAB_TRANSITION = 'transform 180ms ease-out, opacity 180ms ease-out';

export function MorongwaChatButton() {
  const pathname = usePathname() || '';
  const { unreadCount } = useMessengerUnread();
  const mobileChrome = useMobileChromeBreakpoint();
  const { hidden, progress } = useScrollAwareChromeBroadcast();

  if (pathname.startsWith('/admin')) return null;
  if (pathname.startsWith('/pay/embed')) return null;
  if (['/login', '/register', '/messages'].includes(pathname)) return null;

  const badgeLabel =
    unreadCount > 99 ? '99+' : unreadCount > 0 ? String(unreadCount) : null;

  const chromeShift = mobileChrome && hidden ? 88 : 0;
  const chromeOpacity = mobileChrome
    ? progress <= 0
      ? 0
      : progress <= 0.6
        ? 0.35 + (progress / 0.6) * 0.65
        : 1
    : 1;

  return (
    <Link
      href="/messages"
      className="fixed right-1.5 bottom-[8.25rem] sm:right-4 sm:bottom-36 lg:bottom-10 z-40 flex cursor-pointer items-center justify-center gap-0 sm:gap-2 w-11 h-11 sm:w-auto sm:h-auto px-0 sm:px-4 py-0 sm:py-3 rounded-full bg-white border border-slate-200 text-sky-600 shadow-lg hover:bg-slate-50 hover:border-slate-300 font-semibold"
      style={{
        transform: chromeShift > 0 ? `translateY(${chromeShift}px)` : undefined,
        opacity: chromeOpacity,
        transition: FAB_TRANSITION,
        pointerEvents: mobileChrome && hidden ? 'none' : undefined,
      }}
      aria-label={
        badgeLabel
          ? `Open Morongwa, ${badgeLabel} unread messages`
          : 'Open Morongwa'
      }
      aria-hidden={mobileChrome && hidden ? true : undefined}
    >
      <span className="relative shrink-0">
        <Image
          src="/messages-icon.png"
          alt=""
          width={24}
          height={24}
          className="h-4 w-4 sm:h-6 sm:w-6 object-contain"
        />
        {badgeLabel && (
          <span
            className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1 border-2 border-white"
            aria-hidden
          >
            {badgeLabel}
          </span>
        )}
      </span>
      <span className="hidden sm:inline text-xs sm:text-base text-sky-600">Morongwa</span>
    </Link>
  );
}
