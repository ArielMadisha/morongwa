'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import {
  Package,
  LayoutDashboard,
  LayoutGrid,
  ShoppingCart,
  Tv,
  Music2,
  Wallet,
  Menu,
  X,
  Box,
  ChevronRight,
  Receipt,
  HelpCircle,
  Store,
  User,
  BookOpen,
} from 'lucide-react';
import { LanguageSelector } from '@/components/LanguageSelector';
import { getImageUrl } from '@/lib/api';
import { TransparentIcon } from '@/components/TransparentIcon';

export type SidebarVariant = 'wall' | 'client' | 'runner';

interface AppSidebarProps {
  variant: SidebarVariant;
  userName?: string;
  userAvatar?: string;
  userId?: string;
  cartCount?: number;
  hasStore?: boolean;
  onLogout?: () => void;
  menuOpen?: boolean;
  setMenuOpen?: (v: boolean) => void;
  /** Hide logo when header already shows it (e.g. wall page) */
  hideLogo?: boolean;
  /** Sidebar is below a fixed header - stick below it */
  belowHeader?: boolean;
  /** Hide Cart link (e.g. when marketplace header shows cart) */
  hideCart?: boolean;
}

const errandsSubItems = [
  { href: '/dashboard/client', label: 'Clients', customIcon: '/client-icon.png' },
  { href: '/dashboard/runner', label: 'Runners', customIcon: '/runner-icon.png' },
];

export function AppSidebar({
  variant,
  userName,
  userAvatar,
  userId,
  cartCount = 0,
  hasStore = false,
  onLogout,
  menuOpen = false,
  setMenuOpen,
  hideLogo = false,
  belowHeader = false,
  hideCart = false,
}: AppSidebarProps) {
  const pathname = usePathname();
  const { user } = useAuth();
  const [errandsExpanded, setErrandsExpanded] = useState(false);
  const isActive = (href: string) => pathname === href || (href !== '/' && pathname.startsWith(href));
  const isErrandsActive = errandsSubItems.some((s) => isActive(s.href));

  useEffect(() => {
    if (isErrandsActive) setErrandsExpanded(true);
  }, [isErrandsActive]);

  const uid = user?._id || userId || (user as { id?: string } | undefined)?.id;
  const profileHref = uid ? `/user/${uid}` : '/profile';
  const avatarUrl = (user as { avatar?: string } | undefined)?.avatar || userAvatar;

  type NavItem =
    | { href: string; label: string; icon: any; showChevron: boolean; customIcon?: string; badge?: number; transparentBg?: boolean }
    | { type: 'errands' };

  // Desktop order: QwertyWorld (top) → QwertyHub → ... (existing order)
  const navItemsDesktop: NavItem[] = [
    {
      href: '/qwerty-world',
      label: 'QwertyWorld',
      icon: LayoutGrid,
      showChevron: false,
      customIcon: '/qwertyworld-icon.png',
      transparentBg: true,
    },
    { href: '/marketplace', label: 'QwertyHub', icon: Package, showChevron: false, customIcon: '/qwertyhub-icon.png' },
    ...(hasStore ? [{ href: '/store', label: 'MyStore', icon: Store, showChevron: false, customIcon: '/mystore-icon.png' }] : []),
    { type: 'errands' },
    ...(!hideCart
      ? ([{ href: '/cart', label: 'Cart', icon: ShoppingCart, badge: cartCount, showChevron: false, customIcon: '/cart-icon.png' }] as const)
      : []),
    { href: '/wallet', label: 'ACBPayWallet', icon: Wallet, showChevron: false, customIcon: '/wallet-icon.png' },
    { href: '/morongwa-tv', label: 'QwertyTV', icon: Tv, showChevron: false, customIcon: '/qwertytv-icon.png' },
    { href: '/messages', label: 'Morongwa', icon: HelpCircle, showChevron: false, customIcon: '/messages-icon.png' },
    { href: '/qwerty-music', label: 'QwertyMusic', icon: Music2, showChevron: false, customIcon: '/music-icon.png' },
  ];

  // Mobile overlay order: QwertyTV → QwertyWorld → ACBPayWallet (as requested)
  const navItemsMobile: NavItem[] = [
    { href: '/marketplace', label: 'QwertyHub', icon: Package, showChevron: false, customIcon: '/qwertyhub-icon.png' },
    ...(hasStore ? [{ href: '/store', label: 'MyStore', icon: Store, showChevron: false, customIcon: '/mystore-icon.png' }] : []),
    { type: 'errands' },
    ...(!hideCart
      ? ([{ href: '/cart', label: 'Cart', icon: ShoppingCart, badge: cartCount, showChevron: false, customIcon: '/cart-icon.png' }] as const)
      : []),
    { href: '/morongwa-tv', label: 'QwertyTV', icon: Tv, showChevron: false, customIcon: '/qwertytv-icon.png' },
    { href: '/qwerty-world', label: 'QwertyWorld', icon: LayoutGrid, showChevron: false, customIcon: '/qwertyworld-icon.png', transparentBg: true },
    { href: '/wallet', label: 'ACBPayWallet', icon: Wallet, showChevron: false, customIcon: '/wallet-icon.png' },
    { href: '/messages', label: 'Morongwa', icon: HelpCircle, showChevron: false, customIcon: '/messages-icon.png' },
    { href: '/qwerty-music', label: 'QwertyMusic', icon: Music2, showChevron: false, customIcon: '/music-icon.png' },
  ];

  const footerNav = [
    { href: '/about', label: 'About', icon: BookOpen },
    { href: '/pricing', label: 'Pricing', icon: Receipt },
    { href: '/support', label: 'Support', icon: HelpCircle },
  ];

  const sidebar = (
    <div
      className={`sticky self-start flex flex-col min-h-0 bg-white border-r border-slate-100 w-64 shrink-0 shadow-xs top-0 ${
        belowHeader ? 'max-h-[calc(100vh-2.5rem)] h-[calc(100vh-2.5rem)]' : 'h-screen max-h-screen'
      }`}
    >
      {!hideLogo && (
        <div className="p-4 border-b border-slate-100 flex items-center justify-center gap-3 shrink-0">
          <Link href="/wall" className="block shrink-0" onClick={() => setMenuOpen?.(false)}>
            <img src="/qwertymates-logo.png" alt="Qwertymates" className="h-9 w-auto max-w-full object-contain" />
          </Link>
        </div>
      )}

      {/* Single flowing column (matches right-hand AdvertSlot: one scroll, no split panes) */}
      <div className="flex-1 min-h-0 flex flex-col overflow-y-auto overscroll-contain px-3 pb-4 pt-1 min-w-0 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
      <nav className="space-y-0 shrink-0">
        <div className="hidden lg:block">
          {navItemsDesktop.map((item, idx) => {
            if ('type' in item && item.type === 'errands') {
              return (
                <div key={`errands-desktop-${idx}`} className="relative">
                  <button
                    type="button"
                    onClick={() => setErrandsExpanded((v) => !v)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-r-lg text-sm font-medium transition-colors text-left border-l-[4px] ${
                      isErrandsActive
                        ? 'border-sky-500 bg-sky-50 text-sky-900'
                        : 'border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-800'
                    }`}
                    aria-expanded={errandsExpanded}
                    aria-haspopup="true"
                  >
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                      <div className="flex items-center justify-center w-11 h-11 rounded-lg bg-transparent overflow-hidden flex-shrink-0">
                        <img src="/errands-icon.png" alt="" className="h-8 w-8 object-contain" />
                      </div>
                      <span className={`font-bold truncate min-w-0 ${isErrandsActive ? 'text-sky-900' : 'text-slate-800'}`}>Errands</span>
                    </div>
                    <ChevronRight
                      className={`h-4 w-4 text-slate-400 flex-shrink-0 transition-transform ${errandsExpanded ? 'rotate-90' : ''}`}
                      aria-hidden
                    />
                  </button>
                  {/* Inline sub-items (all breakpoints): flyout to the right was clipped by sidebar overflow; expand in place instead */}
                  <div className={errandsExpanded ? 'block' : 'hidden'}>
                    {errandsSubItems.map((sub) => (
                      <Link
                        key={sub.href}
                        href={sub.href}
                        onClick={() => {
                          setMenuOpen?.(false);
                          setErrandsExpanded(false);
                        }}
                        className={`flex items-center gap-2.5 pl-12 pr-3 py-2 rounded-md text-sm font-medium transition-colors border-l-[4px] ${
                          isActive(sub.href)
                            ? 'border-sky-500 bg-sky-50 text-sky-900'
                            : 'border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-800'
                        }`}
                      >
                        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-transparent overflow-hidden flex-shrink-0">
                          <img src={sub.customIcon} alt="" className="h-6 w-6 object-contain" />
                        </div>
                        <span>{sub.label}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              );
            }
            const { href, label, icon: Icon, badge, showChevron, customIcon, transparentBg } = item;
            return (
              <Link
                key={href || `nav-desktop-${idx}`}
                href={href || '#'}
                onClick={() => setMenuOpen?.(false)}
                className={`flex items-center gap-3 px-3 py-2 rounded-r-lg text-sm font-medium transition-colors border-l-[4px] ${
                  isActive(href)
                    ? 'border-sky-500 bg-sky-50 text-sky-900'
                    : 'border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-800'
                }`}
              >
                {customIcon ? (
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <div className="flex items-center justify-center w-11 h-11 rounded-lg bg-transparent overflow-hidden flex-shrink-0">
                    {transparentBg ? (
                      <TransparentIcon
                        src={customIcon}
                        alt={label}
                        className={`h-8 w-8 object-contain`}
                      />
                    ) : (
                      <img src={customIcon} alt="" className="h-8 w-8 object-contain" />
                    )}
                    </div>
                    <span className={`font-bold truncate min-w-0 ${isActive(href) ? 'text-sky-900' : 'text-slate-800'}`}>{label}</span>
                  </div>
                ) : (
                  <>
                    <Icon className="h-5 w-5 flex-shrink-0" />
                    <span className="flex-1">{label}</span>
                  </>
                )}
                {showChevron && <ChevronRight className="h-4 w-4 text-slate-400 flex-shrink-0" />}
                {badge != null && badge > 0 && (
                  <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-800">
                    {badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
        <div className="lg:hidden">
          {navItemsMobile.map((item, idx) => {
            if ('type' in item && item.type === 'errands') {
              return (
                <div key={`errands-mobile-${idx}`} className="relative">
                  <button
                    type="button"
                    onClick={() => setErrandsExpanded((v) => !v)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-r-lg text-sm font-medium transition-colors text-left border-l-[4px] ${
                      isErrandsActive
                        ? 'border-sky-500 bg-sky-50 text-sky-900'
                        : 'border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-800'
                    }`}
                    aria-expanded={errandsExpanded}
                    aria-haspopup="true"
                  >
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                      <div className="flex items-center justify-center w-11 h-11 rounded-lg bg-transparent overflow-hidden flex-shrink-0">
                        <img src="/errands-icon.png" alt="" className="h-8 w-8 object-contain" />
                      </div>
                      <span className={`font-bold truncate min-w-0 ${isErrandsActive ? 'text-sky-900' : 'text-slate-800'}`}>Errands</span>
                    </div>
                    <ChevronRight
                      className={`h-4 w-4 text-slate-400 flex-shrink-0 transition-transform ${errandsExpanded ? 'rotate-90' : ''}`}
                      aria-hidden
                    />
                  </button>
                  {/* Inline sub-items (all breakpoints): flyout to the right was clipped by sidebar overflow; expand in place instead */}
                  <div className={errandsExpanded ? 'block' : 'hidden'}>
                    {errandsSubItems.map((sub) => (
                      <Link
                        key={sub.href}
                        href={sub.href}
                        onClick={() => {
                          setMenuOpen?.(false);
                          setErrandsExpanded(false);
                        }}
                        className={`flex items-center gap-2.5 pl-12 pr-3 py-2 rounded-md text-sm font-medium transition-colors border-l-[4px] ${
                          isActive(sub.href)
                            ? 'border-sky-500 bg-sky-50 text-sky-900'
                            : 'border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-800'
                        }`}
                      >
                        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-transparent overflow-hidden flex-shrink-0">
                          <img src={sub.customIcon} alt="" className="h-6 w-6 object-contain" />
                        </div>
                        <span>{sub.label}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              );
            }
            const { href, label, icon: Icon, badge, showChevron, customIcon, transparentBg } = item;
            return (
              <Link
                key={href || `nav-mobile-${idx}`}
                href={href || '#'}
                onClick={() => setMenuOpen?.(false)}
                className={`flex items-center gap-3 px-3 py-2 rounded-r-lg text-sm font-medium transition-colors border-l-[4px] ${
                  isActive(href)
                    ? 'border-sky-500 bg-sky-50 text-sky-900'
                    : 'border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-800'
                }`}
              >
                {customIcon ? (
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <div className="flex items-center justify-center w-11 h-11 rounded-lg bg-transparent overflow-hidden flex-shrink-0">
                      <img src={customIcon} alt="" className={`h-8 w-8 object-contain ${transparentBg ? 'mix-blend-darken' : ''}`} />
                    </div>
                    <span className={`font-bold truncate min-w-0 ${isActive(href) ? 'text-sky-900' : 'text-slate-800'}`}>{label}</span>
                  </div>
                ) : (
                  <>
                    <Icon className="h-5 w-5 flex-shrink-0" />
                    <span className="flex-1">{label}</span>
                  </>
                )}
                {showChevron && <ChevronRight className="h-4 w-4 text-slate-400 flex-shrink-0" />}
                {badge != null && badge > 0 && (
                  <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-800">
                    {badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </nav>

      {user && (
        <div className="mt-6 shrink-0">
          <Link
            href={profileHref}
            onClick={() => setMenuOpen?.(false)}
            className="flex items-center gap-3 rounded-lg px-2 py-2 -mx-1 hover:bg-slate-50 transition-colors min-w-0"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-50 text-sm font-bold text-brand-700 ring-1 ring-slate-200">
              {avatarUrl ? (
                <img src={getImageUrl(avatarUrl)} alt="" className="h-full w-full object-cover" />
              ) : (
                (user.name || 'U').charAt(0).toUpperCase()
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-slate-900 truncate" title={user.name || ''}>
                {user.name || 'User'}
              </p>
              <p
                className="text-sm text-slate-500 truncate"
                title={(user as { username?: string }).username ? `@${(user as { username?: string }).username}` : ''}
              >
                {(user as { username?: string }).username
                  ? `@${(user as { username?: string }).username}`
                  : '—'}
              </p>
            </div>
          </Link>
        </div>
      )}

      <div className="mt-6 shrink-0 space-y-2 pb-1">
        <LanguageSelector compact />
        {footerNav.map(({ href, label, icon: Icon }) => (
          <Link
            key={href || label}
            href={href || '#'}
            onClick={() => setMenuOpen?.(false)}
            className={`flex items-center gap-3 px-3 py-2 rounded-r-lg text-sm font-medium transition-colors border-l-[4px] ${
              isActive(href)
                ? 'border-sky-500 bg-sky-50 text-sky-900'
                : 'border-transparent text-slate-700 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Icon className="h-4 w-4 flex-shrink-0" />
            {label}
          </Link>
        ))}
        <p className="px-3 pt-3 text-xs text-slate-500 leading-relaxed">© 2026 Qwertymates.com All rights reserved</p>
      </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop: always visible sidebar - relative z-10 so Errands dropdown appears above main content */}
      <aside className="hidden lg:flex relative z-10">{sidebar}</aside>

      {/* Mobile: overlay when open */}
      {menuOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-40 lg:hidden"
          onClick={() => setMenuOpen?.(false)}
          aria-hidden="true"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 lg:hidden transform transition-transform duration-200 ease-out ${
          menuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="relative h-full">
          {sidebar}
          <button
            type="button"
            onClick={() => setMenuOpen?.(false)}
            className="absolute top-4 right-4 p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </aside>
    </>
  );
}

export function AppSidebarMenuButton({ onClick }: { onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="lg:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      aria-label="Open menu"
    >
      <Menu className="h-6 w-6" />
    </button>
  );
}
