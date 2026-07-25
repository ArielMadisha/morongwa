'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppSidebar } from '@/components/AppSidebar';
import { AppShellHeader } from '@/components/AppShellHeader';
import { ProfileHeaderButton } from '@/components/ProfileHeaderButton';
import { AdvertSlot } from '@/components/AdvertSlot';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { useAuth } from '@/contexts/AuthContext';
import { useCartAndStores } from '@/lib/useCartAndStores';
import {
  BackToQwertyHubLink,
  QwertyHubSectionNav,
  type QwertyHubSection,
} from '@/components/marketplace/QwertyHubSectionNav';
import Link from 'next/link';
import { HelpCircle } from 'lucide-react';

type Props = {
  section: Exclude<QwertyHubSection, 'hub'>;
  title: string;
  description: string;
  children?: React.ReactNode;
};

/**
 * Same app-shell layout as /marketplace (header + sidebar + ads rail + mobile nav).
 */
export function QwertyHubSectionShell({ section, title, description, children }: Props) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const { cartCount, hasStore } = useCartAndStores(!!user);
  const isGuest = !user;
  const homeLink = isGuest ? '/' : '/wall';

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-gradient-to-br from-sky-50 via-blue-50 to-white text-slate-900">
      <AppShellHeader
        homeHref={homeLink}
        showMenuButton={!isGuest}
        onMenuClick={isGuest ? undefined : () => setMenuOpen((v) => !v)}
        center={
          <div className="flex w-full min-w-0 items-center justify-end gap-2 sm:gap-3">
            {isGuest ? (
              <Link
                href="/support"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-sky-600 shadow-sm transition-colors hover:bg-sky-50"
                title="Help & support"
                aria-label="Help and support"
              >
                <HelpCircle className="h-5 w-5" />
              </Link>
            ) : (
              <ProfileHeaderButton className="shrink-0" />
            )}
          </div>
        }
        actions={
          isGuest ? (
            <>
              <Link
                href="/login"
                className="shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Sign in
              </Link>
              <Link
                href="/register"
                className="shrink-0 rounded-lg bg-brand-500 px-2.5 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-semibold text-white hover:bg-brand-600 transition-colors"
              >
                Register
              </Link>
            </>
          ) : null
        }
        bottom={<QwertyHubSectionNav active={section} />}
      />
      <div className="flex min-h-0 min-w-0 w-full flex-1 overflow-hidden">
        {!isGuest && (
          <AppSidebar
            variant="wall"
            userName={user?.name}
            userAvatar={(user as any)?.avatar}
            userId={user?._id || user?.id}
            cartCount={cartCount}
            hasStore={hasStore}
            onLogout={handleLogout}
            menuOpen={menuOpen}
            setMenuOpen={setMenuOpen}
            hideLogo
            belowHeader
          />
        )}
        <div className="flex min-h-0 min-w-0 w-full flex-1 flex-col gap-0 overflow-y-auto overflow-x-hidden overscroll-contain lg:flex-row">
          <main className="order-2 box-border min-h-0 w-full min-w-0 max-w-full flex-1 px-3 sm:px-6 lg:px-8 py-5 sm:py-6 pb-24 md:pb-6 lg:order-none">
            <BackToQwertyHubLink className="mb-4" />
            {isGuest && (
              <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50/80 px-4 py-3 text-sm text-slate-700">
                Browse freely.{' '}
                <Link href="/register" className="font-medium text-brand-600 hover:text-brand-700">
                  Sign up
                </Link>{' '}
                or{' '}
                <Link href="/login" className="font-medium text-brand-600 hover:text-brand-700">
                  sign in
                </Link>{' '}
                to add to cart or checkout.
              </div>
            )}
            <h2 className="font-semibold text-slate-900 text-base sm:text-lg mb-2">{title}</h2>
            <p className="mb-6 w-full max-w-full text-left text-pretty text-base leading-relaxed text-slate-600 break-words">
              {description}
            </p>
            {children}
          </main>
          <AdvertSlot belowHeader />
        </div>
      </div>
      {!isGuest && <MobileBottomNav cartCount={cartCount} hasStore={hasStore} />}
    </div>
  );
}
