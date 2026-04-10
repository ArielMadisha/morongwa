'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';

/** Global Morongwa shortcut — hidden on admin, auth-only, embed, and messages (already there). */
export function MorongwaChatButton() {
  const pathname = usePathname() || '';

  if (pathname.startsWith('/admin')) return null;
  if (pathname.startsWith('/pay/embed')) return null;
  if (['/login', '/register', '/messages'].includes(pathname)) return null;

  return (
    <Link
      href="/messages"
      className="fixed right-1.5 bottom-[8.25rem] sm:right-4 sm:bottom-36 lg:bottom-10 z-40 flex items-center justify-center gap-0 sm:gap-2 w-11 h-11 sm:w-auto sm:h-auto px-0 sm:px-4 py-0 sm:py-3 rounded-full bg-white border border-slate-200 text-sky-600 shadow-lg hover:bg-slate-50 hover:border-slate-300 transition-all font-semibold"
      aria-label="Open Morongwa"
    >
      <Image
        src="/messages-icon.png"
        alt=""
        width={24}
        height={24}
        className="h-4 w-4 sm:h-6 sm:w-6 shrink-0 object-contain"
      />
      <span className="hidden sm:inline text-xs sm:text-base text-sky-600">Morongwa</span>
    </Link>
  );
}
