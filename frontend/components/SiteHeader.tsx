'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useCartAndStores } from '@/lib/useCartAndStores';
import { getImageUrl } from '@/lib/api';
import { Package, Home, ArrowRight, LayoutDashboard, ShoppingBag, ShoppingCart, Store, Menu, X } from 'lucide-react';
import { SearchButton } from '@/components/SearchButton';
import { ProfileHeaderButton } from '@/components/ProfileHeaderButton';

type SiteHeaderProps = {
  minimal?: boolean;
};

const tapTarget = 'min-h-[44px] min-w-[44px] inline-flex items-center justify-center';

export default function SiteHeader({ minimal }: SiteHeaderProps) {
  const pathname = usePathname();
  const { user, isAuthenticated } = useAuth();
  const { hasStore } = useCartAndStores(!!isAuthenticated && !!user);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="bg-white/90 backdrop-blur-md border-b border-slate-100 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex justify-between items-center gap-4">
          <Link href="/" className={`flex items-center shrink-0 ${tapTarget}`}>
            <img src="/qwertymates-logo-icon-transparent.svg" alt="Qwertymates" className="h-16 w-16 sm:h-[4.25rem] sm:w-[4.25rem] object-contain md:hidden shrink-0" />
            <img src="/qwertymates-logo.png" alt="Qwertymates" className="h-9 w-auto object-contain hidden md:block" />
          </Link>
          {minimal ? (
            <>
              <div className="flex-1 min-w-0" />
              {/* Mobile: remove top "Ask MacGyver"; keep only bottom nav */}
              <SearchButton className="hidden md:flex" />
            </>
          ) : (
          <>
          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1 sm:gap-2">
            <Link
              href={isAuthenticated ? '/wall' : '/'}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                (pathname === '/' || pathname === '/wall') ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Home className="h-4 w-4 hidden sm:block" />
              <span className="whitespace-nowrap">Home</span>
            </Link>
            <Link
              href="/marketplace"
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                pathname?.startsWith('/marketplace') ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <ShoppingBag className="h-4 w-4 hidden sm:block" />
              <span className="whitespace-nowrap">QwertyHub</span>
            </Link>
            {isAuthenticated && user ? (
              <Link
                href="/cart"
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  pathname === '/cart' ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
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
{hasStore && (
                  <Link
                    href="/store"
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      pathname === '/store' ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    <Store className="h-4 w-4 hidden sm:block" />
                    <span className="whitespace-nowrap hidden sm:inline">My store</span>
                  </Link>
                )}
              </>
            ) : null}
            <span className="w-px h-6 bg-slate-200 mx-1" aria-hidden />
            <SearchButton className="hidden md:flex" />
            {isAuthenticated && user ? (
              <ProfileHeaderButton />
            ) : (
              <>
                <Link
                  href="/login"
                  className="px-3 py-2 text-sm font-medium text-slate-600 hover:text-brand-600 transition-colors"
                >
                  Sign in
                </Link>
                <Link
                  href="/register"
                  className={`flex items-center gap-1.5 px-4 py-2 bg-brand-500 text-white rounded-lg text-sm font-semibold hover:bg-brand-600 transition-colors shadow-sm ${tapTarget}`}
                >
                  Get Started
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </>
            )}
          </nav>

          {/* Mobile: profile + hamburger */}
          <div className="md:hidden flex items-center gap-1">
            {isAuthenticated && user ? (
              <ProfileHeaderButton className="shrink-0" />
            ) : null}
            <button
              type="button"
              onClick={() => setMobileMenuOpen((o) => !o)}
              className={`${tapTarget} p-2 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900`}
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>

          {/* Mobile menu panel */}
          {mobileMenuOpen && (
            <>
              <div
                className="fixed inset-0 bg-black/20 z-40 md:hidden"
                onClick={() => setMobileMenuOpen(false)}
                aria-hidden
              />
              <nav className="fixed top-[57px] left-0 right-0 z-50 md:hidden bg-white border-b border-slate-100 shadow-lg flex flex-col py-2 max-h-[calc(100vh-57px)] overflow-y-auto">
                <Link href={isAuthenticated ? '/wall' : '/'} onClick={() => setMobileMenuOpen(false)} className={`flex items-center gap-3 px-4 py-3 text-slate-700 hover:bg-slate-50 ${tapTarget} justify-start`}>
                  <Home className="h-5 w-5" /><span>Home</span>
                </Link>
                <Link href="/marketplace" onClick={() => setMobileMenuOpen(false)} className={`flex items-center gap-3 px-4 py-3 text-slate-700 hover:bg-slate-50 ${tapTarget} justify-start`}>
                  <ShoppingBag className="h-5 w-5" /><span>QwertyHub</span>
                </Link>
                {isAuthenticated && user && (
                  <>
                    <Link href="/cart" onClick={() => setMobileMenuOpen(false)} className={`flex items-center gap-3 px-4 py-3 text-slate-700 hover:bg-slate-50 ${tapTarget} justify-start`}>
                      <ShoppingCart className="h-5 w-5" /><span>Cart</span>
                    </Link>
                    <Link href={Array.isArray(user.role) && user.role.includes('client') ? '/dashboard/client' : '/dashboard/runner'} onClick={() => setMobileMenuOpen(false)} className={`flex items-center gap-3 px-4 py-3 text-slate-700 hover:bg-slate-50 ${tapTarget} justify-start`}>
                      <LayoutDashboard className="h-5 w-5" /><span>Dashboard</span>
                    </Link>
                    {hasStore && (
                      <Link href="/store" onClick={() => setMobileMenuOpen(false)} className={`flex items-center gap-3 px-4 py-3 text-slate-700 hover:bg-slate-50 ${tapTarget} justify-start`}>
                        <Store className="h-5 w-5" /><span>My store</span>
                      </Link>
                    )}
                    <Link href="/profile" onClick={() => setMobileMenuOpen(false)} className={`flex items-center gap-3 px-4 py-3 text-slate-700 hover:bg-slate-50 ${tapTarget} justify-start border-t border-slate-100 mt-1`}>
                      <span className="w-9 h-9 rounded-full bg-brand-50 text-brand-700 flex items-center justify-center text-xs font-bold ring-1 ring-slate-200 shadow-sm overflow-hidden">
                        {(user as { avatar?: string }).avatar ? (
                          <img src={getImageUrl((user as { avatar?: string }).avatar)} alt={user.name || 'Profile'} className="h-full w-full object-cover" />
                        ) : (
                          user.name?.charAt(0)?.toUpperCase() || 'U'
                        )}
                      </span>
                      <span>Profile</span>
                    </Link>
                  </>
                )}
                {!isAuthenticated && (
                  <div className="flex flex-col gap-2 px-4 py-3 border-t border-slate-100 mt-1">
                    <Link href="/login" onClick={() => setMobileMenuOpen(false)} className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-slate-600 hover:bg-slate-50 ${tapTarget}`}>
                      Sign in
                    </Link>
                    <Link href="/register" onClick={() => setMobileMenuOpen(false)} className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-brand-500 text-white font-semibold hover:bg-brand-600 ${tapTarget}`}>
                      Get Started <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                )}
              </nav>
            </>
          )}
          </>
          )}
        </div>
      </div>
    </header>
  );
}
