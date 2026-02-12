'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useCartAndStores } from '@/lib/useCartAndStores';
import { Package, Home, ArrowRight, LayoutDashboard, ShoppingBag, ShoppingCart, LayoutGrid, Store } from 'lucide-react';

type SiteHeaderProps = {
  minimal?: boolean;
};

export default function SiteHeader({ minimal }: SiteHeaderProps) {
  const pathname = usePathname();
  const { user, isAuthenticated } = useAuth();
  const { hasStore } = useCartAndStores(!!isAuthenticated && !!user);

  return (
    <header className="bg-white/90 backdrop-blur-md border-b border-slate-100 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex justify-between items-center gap-4">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <Package className="h-8 w-8 text-blue-600" />
            <span className="text-xl font-bold text-slate-900">Morongwa</span>
          </Link>
          {!minimal && (
          <nav className="flex items-center gap-1 sm:gap-2">
            <Link
              href="/"
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                pathname === '/' ? 'bg-sky-100 text-sky-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Home className="h-4 w-4 hidden sm:block" />
              <span className="whitespace-nowrap">Home</span>
            </Link>
            <Link
              href="/marketplace"
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                pathname?.startsWith('/marketplace') ? 'bg-sky-100 text-sky-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <ShoppingBag className="h-4 w-4 hidden sm:block" />
              <span className="whitespace-nowrap">QwertyHub</span>
            </Link>
            {isAuthenticated && user ? (
              <Link
                href="/cart"
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  pathname === '/cart' ? 'bg-sky-100 text-sky-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <ShoppingCart className="h-4 w-4" />
                <span className="whitespace-nowrap hidden sm:inline">Cart</span>
              </Link>
            ) : null}
            {isAuthenticated && user ? (
              <>
                <Link
                  href={Array.isArray(user.role) && user.role.includes('client') ? '/dashboard/client' : '/dashboard/runner'}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                >
                  <LayoutDashboard className="h-4 w-4" />
                  <span className="whitespace-nowrap hidden sm:inline">Dashboard</span>
                </Link>
                <Link
                  href={`/resellers/${user._id ?? (user as { id?: string }).id ?? ''}`}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    pathname?.startsWith('/resellers') ? 'bg-sky-100 text-sky-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <LayoutGrid className="h-4 w-4 hidden sm:block" />
                  <span className="whitespace-nowrap hidden sm:inline">My wall</span>
                </Link>
                {hasStore && (
                  <Link
                    href="/store"
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      pathname === '/store' ? 'bg-sky-100 text-sky-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    <Store className="h-4 w-4 hidden sm:block" />
                    <span className="whitespace-nowrap hidden sm:inline">My store</span>
                  </Link>
                )}
              </>
            ) : null}
            <span className="w-px h-6 bg-slate-200 mx-1" aria-hidden />
            {isAuthenticated && user ? (
              <Link
                href="/profile"
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                <span className="w-7 h-7 rounded-full bg-sky-100 text-sky-700 flex items-center justify-center text-xs font-bold">
                  {user.name?.charAt(0)?.toUpperCase() || 'U'}
                </span>
                <span className="hidden sm:inline max-w-[100px] truncate">{user.name}</span>
              </Link>
            ) : (
              <>
                <Link
                  href="/?signin=1"
                  className="px-3 py-2 text-sm font-medium text-slate-600 hover:text-blue-600 transition-colors"
                >
                  Sign in
                </Link>
                <Link
                  href="/"
                  className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg text-sm font-semibold hover:from-blue-700 hover:to-indigo-700 transition-colors shadow-sm"
                >
                  Get Started
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </>
            )}
          </nav>
          )}
        </div>
      </div>
    </header>
  );
}
