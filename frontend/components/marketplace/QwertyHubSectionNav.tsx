'use client';

import Link from 'next/link';
import { ShoppingBag, ShoppingCart } from 'lucide-react';

export type QwertyHubSection = 'hub' | 'food' | 'groceries';

const ITEMS: Array<{
  id: QwertyHubSection;
  href: string;
  label: string;
  shortLabel: string;
  icon: 'bag' | 'burger' | 'cart';
}> = [
  { id: 'hub', href: '/marketplace', label: 'QwertyHub', shortLabel: 'QwertyHub', icon: 'bag' },
  {
    id: 'food',
    href: '/marketplace/food',
    label: 'Order Food/Restaurant',
    shortLabel: 'Food',
    icon: 'burger',
  },
  {
    id: 'groceries',
    href: '/marketplace/groceries',
    label: 'Order Groceries',
    shortLabel: 'Groceries',
    icon: 'cart',
  },
];

function SectionIcon({ icon, active }: { icon: 'bag' | 'burger' | 'cart'; active: boolean }) {
  const tone = active ? 'text-brand-600' : 'text-slate-500';
  if (icon === 'burger') {
    return (
      <span className="text-base leading-none select-none" aria-hidden>
        🍔
      </span>
    );
  }
  if (icon === 'cart') {
    return <ShoppingCart className={`h-4 w-4 shrink-0 ${tone}`} aria-hidden />;
  }
  return <ShoppingBag className={`h-4 w-4 shrink-0 ${tone}`} aria-hidden />;
}

/**
 * Distinct button chips (not one cramped text line). Wraps on narrow screens.
 */
export function QwertyHubSectionNav({ active }: { active: QwertyHubSection }) {
  return (
    <nav
      className="flex w-full min-w-0 flex-wrap items-center gap-2"
      aria-label="QwertyHub sections"
    >
      {ITEMS.map((item) => {
        const isActive = item.id === active;
        return (
          <Link
            key={item.id}
            href={item.href}
            aria-current={isActive ? 'page' : undefined}
            title={item.label}
            className={`inline-flex max-w-full shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${
              isActive
                ? 'border-sky-300 bg-sky-50 text-sky-800 shadow-sm'
                : 'border-slate-200 bg-white text-slate-800 hover:border-sky-200 hover:bg-sky-50/60'
            }`}
          >
            <SectionIcon icon={item.icon} active={isActive} />
            <span className="sm:hidden">{item.shortLabel}</span>
            <span className="hidden sm:inline">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function BackToQwertyHubLink({ className = '' }: { className?: string }) {
  return (
    <Link
      href="/marketplace"
      className={`inline-flex items-center gap-1 text-sm font-medium text-sky-600 hover:text-sky-700 ${className}`}
    >
      ← Back to QwertyHub
    </Link>
  );
}
