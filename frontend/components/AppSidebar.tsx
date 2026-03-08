'use client';

import { usePathname } from 'next/navigation';
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
}

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
}: AppSidebarProps) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || (href !== '/' && pathname.startsWith(href));

  const navItems = [
    { href: '/marketplace', label: 'QwertyHub', icon: Package, showChevron: false, customIcon: '/qwertyhub-icon.png' },
    // MyStore only shown when user has a store (created when they resell a product)
    ...(hasStore ? [{ href: '/store', label: 'MyStore', icon: Store, showChevron: false, customIcon: '/mystore-icon.png' }] : []),
    { href: '/dashboard/client', label: 'Client Dashboard', icon: LayoutDashboard, showChevron: true, customIcon: '/client-icon.png' },
    { href: '/dashboard/runner', label: 'Runner Cockpit', icon: Box, showChevron: true, customIcon: '/runner-icon.png' },
    { href: '/cart', label: 'Cart', icon: ShoppingCart, badge: cartCount, showChevron: false, customIcon: '/cart-icon.png' },
    { href: '/wallet', label: 'ACBPayWallet', icon: Wallet, showChevron: false, customIcon: '/wallet-icon.png' },
    { href: '/morongwa-tv', label: 'QwertyTV', icon: Tv, showChevron: false, customIcon: '/qwertytv-icon.png' },
    { href: '/qwerty-music', label: 'QwertyMusic', icon: Music2, showChevron: false, customIcon: '/music-icon.png', transparentBg: 'light' },
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

      <nav className={`flex-1 p-3 space-y-0 min-h-0 overflow-y-auto ${hideLogo ? 'pt-4' : ''}`}>
        {navItems.map(({ href, label, icon: Icon, badge, showChevron, customIcon, transparentBg }) => (
          <Link
            key={href}
            href={href}
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
        ))}
      </nav>

      <div className="p-3 border-t border-slate-100 space-y-0">
        {footerNav.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
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
      {/* Desktop: always visible sidebar */}
      <aside className="hidden lg:flex">{sidebar}</aside>

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
