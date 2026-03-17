'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Package, Tv, ShoppingCart, Wallet, Search } from 'lucide-react';

interface MobileBottomNavProps {
  cartCount?: number;
  hasStore?: boolean;
}

const tapTarget = 'min-h-[44px] min-w-[44px] inline-flex flex-col items-center justify-center gap-0.5';

export function MobileBottomNav({ cartCount = 0, hasStore }: MobileBottomNavProps) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    pathname === href || (href !== '/' && pathname.startsWith(href));

  // Order: QwertyHub, QwertyTV, ACBPayWallet, Cart, Ask MacGyver
  const baseItems = [
    { href: '/marketplace', label: 'QwertyHub', icon: Package },
    { href: '/morongwa-tv', label: 'QwertyTV', icon: Tv },
    { href: '/wallet', label: 'ACBPayWallet', icon: Wallet },
    { href: '/cart', label: 'Cart', icon: ShoppingCart, badge: cartCount },
    { href: '/search', label: 'Ask MacGyver', icon: Search, isAsk: true },
  ];
  const navItems = baseItems;

  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-slate-100 shadow-lg"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 8px)' }}
      aria-label="Bottom navigation"
    >
      <div className="flex items-stretch justify-between px-1.5 pt-1.5 gap-1">
        {navItems.map((item) => {
          const badge = 'badge' in item ? (item as any).badge : 0;
          const active = isActive(item.href);
          const Icon = (item as any).icon;
          const isAsk = !!(item as any).isAsk;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={
                isAsk
                  ? `min-h-[40px] inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-full border transition-colors whitespace-nowrap ${
                      active
                        ? 'border-brand-200 bg-brand-50 text-brand-700'
                        : 'border-slate-200 bg-white text-slate-500 hover:border-sky-300 hover:bg-sky-50/30'
                    }`
                  : `${tapTarget} px-1.5 py-1 rounded-lg transition-colors ${
                      active ? 'bg-brand-50 text-brand-600' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
                    }`
              }
              aria-current={active ? 'page' : undefined}
              aria-label={item.label}
            >
              <span className="relative">
                {Icon && <Icon className={isAsk ? 'h-4 w-4' : 'h-5 w-5'} />}
                {badge > 0 && (
                  <span className="absolute -top-1.5 -right-2 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-brand-500 text-white text-[10px] font-bold px-1">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </span>
              <span className={isAsk ? 'text-[11px] font-medium leading-none' : 'text-[10px] font-medium'}>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
