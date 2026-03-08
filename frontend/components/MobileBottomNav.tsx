'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Package, Tv, ShoppingCart, User } from 'lucide-react';

interface MobileBottomNavProps {
  cartCount?: number;
  hasStore?: boolean;
}

const tapTarget = 'min-h-[44px] min-w-[44px] inline-flex flex-col items-center justify-center gap-0.5';

export function MobileBottomNav({ cartCount = 0, hasStore }: MobileBottomNavProps) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    pathname === href || (href !== '/' && pathname.startsWith(href));

  // Order: QwertyHub, QwertyTV, Me, Cart (only when items), Home (Q logo at bottom right)
  const baseItems = [
    { href: '/marketplace', label: 'QwertyHub', icon: Package },
    { href: '/morongwa-tv', label: 'QwertyTV', icon: Tv },
    { href: '/profile', label: 'Me', icon: User },
  ];
  const cartItem = cartCount > 0
    ? [{ href: '/cart', label: 'Cart', icon: ShoppingCart, badge: cartCount }]
    : [];
  const navItems = [...baseItems, ...cartItem, { href: '/wall', label: 'Home', isLogo: true }];

  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-slate-100 shadow-lg"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 8px)' }}
      aria-label="Bottom navigation"
    >
      <div className="flex items-stretch justify-around px-1 pt-2">
        {navItems.map((item) => {
          const badge = 'badge' in item ? (item as any).badge : 0;
          const active = isActive(item.href);
          const isLogo = 'isLogo' in item && (item as any).isLogo;
          const Icon = !isLogo ? (item as any).icon : null;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`${tapTarget} px-2 py-1 rounded-lg transition-colors ${
                active ? 'bg-brand-50 text-brand-600' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
              }`}
              aria-current={active ? 'page' : undefined}
              aria-label={isLogo ? 'Home' : item.label}
            >
              {isLogo ? (
                <span className="relative block w-8 h-8">
                  <Image
                    src="/qwerty-home-icon.png"
                    alt="Home"
                    width={32}
                    height={32}
                    className="object-contain"
                  />
                </span>
              ) : (
                <span className="relative">
                  {Icon && <Icon className="h-6 w-6" />}
                  {badge > 0 && (
                    <span className="absolute -top-1.5 -right-2 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-brand-500 text-white text-[10px] font-bold px-1">
                      {badge > 99 ? '99+' : badge}
                    </span>
                  )}
                </span>
              )}
              {!isLogo && <span className="text-[10px] font-medium">{item.label}</span>}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
