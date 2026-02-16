'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  Package,
  LayoutDashboard,
  LayoutGrid,
  ShoppingCart,
  Tv,
  MessageSquare,
  Menu,
  X,
  Box,
  ChevronRight,
  Receipt,
  HelpCircle,
  LogOut,
  Store,
} from 'lucide-react';

export type SidebarVariant = 'wall' | 'client' | 'runner';

interface AppSidebarProps {
  variant: SidebarVariant;
  userName?: string;
  cartCount?: number;
  hasStore?: boolean;
  onLogout?: () => void;
  menuOpen?: boolean;
  setMenuOpen?: (v: boolean) => void;
}

export function AppSidebar({
  variant,
  userName = '',
  cartCount = 0,
  hasStore = false,
  onLogout,
  menuOpen = false,
  setMenuOpen,
}: AppSidebarProps) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || (href !== '/' && pathname.startsWith(href));

  const navItems = [
    { href: '/wall', label: 'Home', icon: LayoutGrid, showChevron: false },
    { href: '/marketplace', label: 'QwertyHub', icon: Package, showChevron: false },
    // MyStore only shown when user has a store (created when they resell a product)
    ...(hasStore ? [{ href: '/store', label: 'MyStore', icon: Store, showChevron: false }] : []),
    { href: '/dashboard/client', label: 'Client Dashboard', icon: LayoutDashboard, showChevron: true },
    { href: '/dashboard/runner', label: 'Runner Cockpit', icon: Box, showChevron: true },
    { href: '/cart', label: 'Cart', icon: ShoppingCart, badge: cartCount, showChevron: false },
    { href: '/morongwa-tv', label: 'MorongwaTV', icon: Tv, showChevron: false },
    { href: '/messages', label: 'Messages', icon: MessageSquare, showChevron: false },
  ];

  const footerNav = [
    { href: '/pricing', label: 'Pricing', icon: Receipt },
    { href: '/support', label: 'Support', icon: HelpCircle },
  ];

  const sidebar = (
    <div className="flex flex-col h-full bg-white/95 backdrop-blur-md border-r border-slate-100 w-64 shrink-0">
      <div className="p-4 border-b border-slate-100">
        <Link href="/wall" className="flex items-center gap-2">
          <Package className="h-8 w-8 text-blue-600" />
          <span className="text-xl font-bold text-slate-900">Morongwa</span>
        </Link>
        {userName && <p className="text-xs text-slate-500 mt-1 truncate">{userName}</p>}
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navItems.map(({ href, label, icon: Icon, badge, showChevron }) => (
          <Link
            key={href}
            href={href}
            onClick={() => setMenuOpen?.(false)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              isActive(href) ? 'bg-blue-100 text-blue-700' : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Icon className="h-5 w-5 flex-shrink-0" />
            <span className="flex-1">{label}</span>
            {showChevron && <ChevronRight className="h-4 w-4 text-slate-400" />}
            {badge != null && badge > 0 && (
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">
                {badge}
              </span>
            )}
          </Link>
        ))}
      </nav>

      <div className="p-3 border-t border-slate-100 space-y-1">
        {footerNav.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            onClick={() => setMenuOpen?.(false)}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors"
          >
            <Icon className="h-4 w-4 flex-shrink-0" />
            {label}
          </Link>
        ))}
        {onLogout && (
          <button
            type="button"
            onClick={() => {
              setMenuOpen?.(false);
              onLogout();
            }}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors text-left"
          >
            <LogOut className="h-4 w-4 flex-shrink-0" />
            Logout
          </button>
        )}
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
