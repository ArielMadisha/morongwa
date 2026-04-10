'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { LayoutGrid, Package, Search, ShoppingCart, Tv, Wallet } from 'lucide-react';
import { TransparentIcon } from '@/components/TransparentIcon';

interface MobileBottomNavProps {
  cartCount?: number;
  hasStore?: boolean;
}

const tapTarget = 'min-h-[44px] min-w-[44px] inline-flex flex-col items-center justify-center gap-0.5';

export function MobileBottomNav({ cartCount = 0, hasStore }: MobileBottomNavProps) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    pathname === href || (href !== '/' && pathname.startsWith(href));

  // Same brand icons as AppSidebar (public/*.png)
  const baseItems = [
    { href: '/marketplace', label: 'QwertyHub', iconSrc: '/qwertyhub-icon.png' as const, fallbackIcon: Package },
    { href: '/morongwa-tv', label: 'QwertyTV', iconSrc: '/qwertytv-icon.png' as const, fallbackIcon: Tv },
    {
      href: '/qwerty-world',
      label: 'QwertyWorld',
      iconSrc: '/qwertyworld-icon.png' as const,
      transparentIcon: true as const,
      fallbackIcon: LayoutGrid,
    },
    { href: '/wallet', label: 'ACBPayWallet', iconSrc: '/wallet-icon.png' as const, fallbackIcon: Wallet },
    { href: '/cart', label: 'Cart', iconSrc: '/cart-icon.png' as const, badge: cartCount, fallbackIcon: ShoppingCart },
    { href: '/search', label: 'Ask MacGyver', icon: Search, isAsk: true },
  ];
  const navItems = baseItems;
  const askItem = navItems.find((i) => (i as any).isAsk) as
    | { href: string; label: string; icon: any; isAsk: true }
    | undefined;
  const normalItems = navItems.filter((i) => !(i as any).isAsk);

  // If an icon PNG is missing/unavailable on the server, show a consistent fallback
  // so the nav never looks “empty”.
  const [imageFailures, setImageFailures] = useState<Record<string, boolean>>({});

  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-slate-100 shadow-lg"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 8px)' }}
      aria-label="Bottom navigation"
    >
      <div className="relative">
        <div className="flex items-stretch justify-between px-1.5 pt-1.5 gap-1">
          {normalItems.map((item) => {
            const badge = 'badge' in item ? (item as any).badge : 0;
            const active = isActive(item.href);
            const iconSrc = (item as any).iconSrc as string | undefined;
            const transparentIcon = (item as any).transparentIcon as boolean | undefined;
            const failed = imageFailures[item.href] === true;
            const FallbackIcon = (item as any).fallbackIcon as any | undefined;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`${tapTarget} flex-1 min-w-0 px-0.5 sm:px-1.5 py-1 rounded-lg transition-colors ${
                  active ? 'bg-brand-50 text-brand-600' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
                }`}
                aria-current={active ? 'page' : undefined}
                aria-label={item.label}
              >
                <span className="relative flex items-center justify-center">
                  {iconSrc ? (
                    <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-transparent overflow-hidden">
                      {transparentIcon ? (
                        <TransparentIcon
                          src={iconSrc}
                          alt=""
                          className="h-8 w-8 object-contain mix-blend-darken"
                        />
                      ) : failed ? (
                        FallbackIcon ? <FallbackIcon className="h-6 w-6 text-slate-700" aria-hidden /> : null
                      ) : (
                        <img
                          src={iconSrc}
                          alt=""
                          className="h-8 w-8 object-contain"
                          aria-hidden
                          onError={() => {
                            setImageFailures((prev) => ({ ...prev, [item.href]: true }));
                          }}
                        />
                      )}
                    </span>
                  ) : null}
                  {badge > 0 && (
                    <span className="absolute -top-1.5 -right-2 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-brand-500 text-white text-[10px] font-bold px-1">
                      {badge > 99 ? '99+' : badge}
                    </span>
                  )}
                </span>
                <span className="text-[9px] sm:text-[10px] font-medium text-center leading-tight line-clamp-2 max-w-full px-0.5">
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>

        {askItem && (
          <Link
            href={askItem.href}
            aria-label={askItem.label}
            aria-current={isActive(askItem.href) ? 'page' : undefined}
            className={`absolute right-1.5 bottom-14 z-50 group w-[44px] h-[44px] inline-flex items-center justify-center gap-0 px-0 py-0 rounded-full border transition-colors whitespace-nowrap ${
              isActive(askItem.href)
                ? 'border-brand-200 bg-brand-50 text-brand-700'
                : 'border-slate-200 bg-white text-slate-500 hover:border-sky-300 hover:bg-sky-50/30'
            } group-hover:w-auto group-hover:px-2.5 group-hover:py-1.5 group-focus:w-auto group-focus:px-2.5 group-focus:py-1.5`}
          >
            {(() => {
              const Icon = (askItem as any).icon;
              return (
                <>
                  {Icon && <Icon className="h-5 w-5" />}
                  <span className="hidden group-hover:inline-block group-focus:inline-block ml-2 text-[11px] font-medium leading-none whitespace-nowrap">
                    {askItem.label}
                  </span>
                </>
              );
            })()}
          </Link>
        )}
      </div>
    </nav>
  );
}
