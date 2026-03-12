'use client';

import { useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
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
  /** Use page-level scrolling instead of sidebar scroll capture */
  allowPageScroll?: boolean;
}

const errandsSubItems = [
  { href: '/dashboard/client', label: 'Clients', customIcon: '/client-icon.png' },
  { href: '/dashboard/runner', label: 'Runners', customIcon: '/runner-icon.png' },
];

const qwertyMusicSubItems = [
  { href: '/qwerty-music?filter=songs', label: 'Songs' },
  { href: '/qwerty-music?filter=albums', label: 'Albums' },
];

export function AppSidebar({
  variant,
  userId,
  cartCount = 0,
  hasStore = false,
  onLogout,
  menuOpen = false,
  setMenuOpen,
  hideLogo = false,
  belowHeader = false,
  allowPageScroll = true,
}: AppSidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [errandsExpanded, setErrandsExpanded] = useState(false);
  const [qwertyMusicExpanded, setQwertyMusicExpanded] = useState(false);
  const isActive = (href: string) => pathname === href || (href !== '/' && pathname.startsWith(href));
  const isMusicPage = pathname === '/qwerty-music' || pathname.startsWith('/qwerty-music');
  const musicFilter = searchParams?.get('filter') || 'songs';
  const isErrandsActive = errandsSubItems.some((s) => isActive(s.href));
  const isQwertyMusicActive = isMusicPage;
  const isMusicSubActive = (subHref: string) => {
    if (!isMusicPage) return false;
    const match = subHref.match(/\?filter=(\w+)/);
    const subFilter = match?.[1] || 'songs';
    return subFilter === musicFilter;
  };

  const navItems: Array<
    | { href: string; label: string; icon: any; showChevron: boolean; customIcon?: string; badge?: number; transparentBg?: string }
    | { type: 'errands' }
    | { type: 'qwertyMusic' }
  > = [
    { href: '/marketplace', label: 'QwertyHub', icon: Package, showChevron: false, customIcon: '/qwertyhub-icon.png' },
    ...(hasStore ? [{ href: '/store', label: 'MyStore', icon: Store, showChevron: false, customIcon: '/mystore-icon.png' }] : []),
    { type: 'errands' },
    { href: '/cart', label: 'Cart', icon: ShoppingCart, badge: cartCount, showChevron: false, customIcon: '/cart-icon.png' },
    { href: '/wallet', label: 'ACBPayWallet', icon: Wallet, showChevron: false, customIcon: '/wallet-icon.png' },
    { href: '/morongwa-tv', label: 'QwertyTV', icon: Tv, showChevron: false, customIcon: '/qwertytv-icon.png' },
    { href: '/messages', label: 'Morongwa', icon: HelpCircle, showChevron: false, customIcon: '/messages-icon.png' },
    { type: 'qwertyMusic' },
  ];

  const footerNav = [
    { href: '/pricing', label: 'Pricing', icon: Receipt },
    { href: '/support', label: 'Support', icon: HelpCircle },
  ];

  const sidebar = (
    <div className={`sticky self-start flex flex-col bg-white border-r border-slate-100 w-64 shrink-0 shadow-xs ${belowHeader ? 'top-14 h-[calc(100vh-3.5rem)]' : 'top-0 h-screen'}`}>
      <div className="p-4 border-b border-slate-100 flex items-center justify-center gap-3">
        {!hideLogo && (
          <Link href="/wall" className="block shrink-0" onClick={() => setMenuOpen?.(false)}>
            <img src="/qwertymates-logo.png" alt="Qwertymates" className="h-9 w-auto max-w-full object-contain" />
          </Link>
        )}
        {hideLogo && null}
      </div>

      <nav className={`flex-1 p-3 space-y-0 min-h-0 ${allowPageScroll ? 'overflow-visible' : 'overflow-y-auto'} ${hideLogo ? 'pt-4' : ''}`}>
        {navItems.map((item, idx) => {
          if ('type' in item && item.type === 'errands') {
            return (
              <div key="errands" className="relative group/errands">
                <button
                  type="button"
                  onClick={() => setErrandsExpanded((v) => !v)}
                  className={`lg:pointer-events-none lg:cursor-default w-full flex items-center gap-3 px-3 py-1.5 rounded-md text-sm font-medium transition-colors text-left ${
                    isErrandsActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
                  }`}
                  aria-expanded={errandsExpanded}
                  aria-haspopup="true"
                >
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <div className="flex items-center justify-center w-11 h-11 rounded-lg bg-transparent overflow-hidden flex-shrink-0">
                      <img src="/errands-icon.png" alt="" className="h-8 w-8 object-contain" />
                    </div>
                    <span className={`font-bold truncate ${isErrandsActive ? 'text-brand-700' : 'text-slate-800'}`}>Errands</span>
                  </div>
                  <ChevronRight className={`h-4 w-4 text-slate-400 flex-shrink-0 transition-transform lg:rotate-0 ${errandsExpanded ? 'rotate-90' : ''}`} />
                </button>
                {/* Mobile: inline sub-items when expanded */}
                <div className={`lg:hidden ${errandsExpanded ? 'block' : 'hidden'}`}>
                  {errandsSubItems.map((sub) => (
                    <Link
                      key={sub.href}
                      href={sub.href}
                      onClick={() => { setMenuOpen?.(false); setErrandsExpanded(false); }}
                      className={`flex items-center gap-2.5 pl-12 pr-3 py-2 rounded-md text-sm font-medium transition-colors ${
                        isActive(sub.href) ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-transparent overflow-hidden flex-shrink-0">
                        <img src={sub.customIcon} alt="" className="h-6 w-6 object-contain" />
                      </div>
                      <span>{sub.label}</span>
                    </Link>
                  ))}
                </div>
                {/* Desktop: dropdown linked to Errands, opens to the right - z-[9999] so it appears above posts, product cards, and right sidebar */}
                <div className="hidden lg:block absolute left-full top-0 ml-0.5 w-[140px] py-1.5 bg-white rounded-lg border border-slate-200 shadow-xl z-[9999] opacity-0 invisible group-hover/errands:opacity-100 group-hover/errands:visible transition-all duration-150 [&:hover]:opacity-100 [&:hover]:visible">
                  {errandsSubItems.map((sub) => (
                    <Link
                      key={sub.href}
                      href={sub.href}
                      onClick={() => setMenuOpen?.(false)}
                      className={`flex items-center gap-2.5 px-3 py-2 mx-1 rounded-md text-sm font-medium transition-colors ${
                        isActive(sub.href) ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
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
          if ('type' in item && item.type === 'qwertyMusic') {
            return (
              <div key="qwertyMusic" className="relative group/qwertyMusic">
                <button
                  type="button"
                  onClick={() => setQwertyMusicExpanded((v) => !v)}
                  className={`lg:pointer-events-none lg:cursor-default w-full flex items-center gap-3 px-3 py-1.5 rounded-md text-sm font-medium transition-colors text-left ${
                    isQwertyMusicActive ? 'bg-sky-50 text-sky-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
                  }`}
                  aria-expanded={qwertyMusicExpanded}
                  aria-haspopup="true"
                >
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <div className="flex items-center justify-center w-11 h-11 rounded-lg bg-transparent overflow-hidden flex-shrink-0">
                      <img src="/music-icon.png" alt="" className="h-8 w-8 object-contain mix-blend-darken" />
                    </div>
                    <span className={`font-bold truncate ${isQwertyMusicActive ? 'text-sky-700' : 'text-slate-800'}`}>QwertyMusic</span>
                  </div>
                  <ChevronRight className={`h-4 w-4 text-slate-400 flex-shrink-0 transition-transform lg:rotate-0 ${qwertyMusicExpanded ? 'rotate-90' : ''}`} />
                </button>
                {/* Mobile: inline sub-items when expanded */}
                <div className={`lg:hidden ${qwertyMusicExpanded ? 'block' : 'hidden'}`}>
                  {qwertyMusicSubItems.map((sub) => (
                    <Link
                      key={sub.href}
                      href={sub.href}
                      onClick={() => { setMenuOpen?.(false); setQwertyMusicExpanded(false); }}
                      className={`flex items-center gap-2.5 pl-12 pr-3 py-2 rounded-md text-sm font-medium transition-colors ${
                        isMusicSubActive(sub.href) ? 'bg-sky-50 text-sky-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
                      }`}
                    >
                      <span>{sub.label}</span>
                    </Link>
                  ))}
                </div>
                {/* Desktop: dropdown linked to QwertyMusic, opens to the right */}
                <div className="hidden lg:block absolute left-full top-0 ml-0.5 w-[120px] py-1.5 bg-white rounded-lg border border-slate-200 shadow-xl z-[9999] opacity-0 invisible group-hover/qwertyMusic:opacity-100 group-hover/qwertyMusic:visible transition-all duration-150 [&:hover]:opacity-100 [&:hover]:visible">
                  {qwertyMusicSubItems.map((sub) => (
                    <Link
                      key={sub.href}
                      href={sub.href}
                      onClick={() => setMenuOpen?.(false)}
                      className={`flex items-center gap-2.5 px-3 py-2 mx-1 rounded-md text-sm font-medium transition-colors ${
                        isMusicSubActive(sub.href) ? 'bg-sky-50 text-sky-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
                      }`}
                    >
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
              key={href || `nav-${idx}`}
              href={href || '#'}
              onClick={() => setMenuOpen?.(false)}
              className={`flex items-center gap-3 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                isActive(href) ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
              }`}
            >
              {customIcon ? (
                <div className="flex items-center gap-2.5 flex-1 min-w-0">
                  <div className="flex items-center justify-center w-11 h-11 rounded-lg bg-transparent overflow-hidden flex-shrink-0">
                    <img src={customIcon} alt="" className={`h-8 w-8 object-contain ${transparentBg ? 'mix-blend-darken' : ''}`} />
                  </div>
                  <span className={`font-bold truncate ${isActive(href) ? 'text-brand-700' : 'text-slate-800'}`}>{label}</span>
                </div>
              ) : (
                <>
                  <Icon className="h-5 w-5 flex-shrink-0" />
                  <span className="flex-1">{label}</span>
                </>
              )}
              {showChevron && <ChevronRight className="h-4 w-4 text-slate-400 flex-shrink-0" />}
              {badge != null && badge > 0 && (
                <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-700">
                  {badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-slate-100 space-y-0">
        <div className="px-3 py-2">
          <LanguageSelector />
        </div>
        {footerNav.map(({ href, label, icon: Icon }) => (
          <Link
            key={href || label}
            href={href || '#'}
            onClick={() => setMenuOpen?.(false)}
            className="flex items-center gap-3 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors"
          >
            <Icon className="h-4 w-4 flex-shrink-0" />
            {label}
          </Link>
        ))}
        <p className="px-3 py-2 text-xs text-slate-500">© 2026 Qwertymates.com All rights reserved</p>
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
