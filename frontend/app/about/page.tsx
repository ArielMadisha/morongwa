'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useCartAndStores } from '@/lib/useCartAndStores';
import { AppSidebar, AppSidebarMenuButton } from '@/components/AppSidebar';
import { SearchButton } from '@/components/SearchButton';
import { ProfileHeaderButton } from '@/components/ProfileHeaderButton';
import { Keycap } from '@/components/Keycap';

export default function AboutPage() {
  const { user } = useAuth();
  const { cartCount, hasStore } = useCartAndStores(!!user);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-sky-50 to-white text-slate-900">
      <header className="sticky top-0 z-40 w-full bg-white/95 backdrop-blur-md border-b border-slate-100 shadow-sm flex-shrink-0">
        <div className="px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Link href={user ? '/wall' : '/'} className="shrink-0 flex items-center" aria-label="Home">
                <img src="/qwertymates-logo-icon.png" alt="Qwertymates" className="h-16 w-16 sm:h-[4.25rem] sm:w-[4.25rem] object-contain lg:hidden shrink-0" />
                <img src="/qwertymates-logo.png" alt="Qwertymates" className="h-9 w-auto object-contain hidden lg:block" />
              </Link>
              {user && <AppSidebarMenuButton onClick={() => setMenuOpen((v) => !v)} />}
            </div>
            <div className="flex-1 min-w-0" />
            <div className="flex items-center gap-2 shrink-0">
              <SearchButton className="max-w-[200px] sm:max-w-[280px]" />
              <ProfileHeaderButton />
            </div>
          </div>
        </div>
      </header>
      <div className="flex min-h-0 min-w-0 w-full flex-1">
        {user && (
          <AppSidebar
            variant="wall"
            cartCount={cartCount}
            hasStore={hasStore}
            menuOpen={menuOpen}
            setMenuOpen={setMenuOpen}
            hideLogo
            belowHeader
          />
        )}
      <div className="flex-1 min-w-0 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-12">
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
            About Qwertymates
          </h1>
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 space-y-4">
            <p className="text-lg font-semibold text-slate-900">💡 Welcome to Qwertymates</p>
            <p className="text-slate-700 leading-relaxed">
              Qwertymates is an all‑in‑one digital platform where you can earn, pay, sell, communicate,
              and explore content — all in one place.
            </p>
            <p className="text-slate-900 font-semibold flex flex-wrap items-center gap-2">
              <Keycap className="text-xs normal-case tracking-normal">What you can do</Keycap>
            </p>
            <div className="space-y-4 text-slate-700">
              <div>
                <p className="font-semibold flex flex-wrap items-center gap-2">
                  <Keycap className="normal-case tracking-normal text-xs">Earn &amp; Sell</Keycap>
                  <span className="text-slate-600 font-normal text-sm">QwertyHub + MyStore</span>
                </p>
                <p>Browse products, resell instantly, and get your own store — no stock or logistics needed.</p>
              </div>
              <div>
                <p className="font-semibold flex flex-wrap items-center gap-2">
                  <Keycap className="normal-case tracking-normal text-xs">Pay &amp; get paid</Keycap>
                  <span className="text-slate-600 font-normal text-sm">ACBPayWallet</span>
                </p>
                <p>Send money, pay shops, receive payments, and manage everything securely.</p>
              </div>
              <div>
                <p className="font-semibold flex flex-wrap items-center gap-2">
                  <Keycap className="normal-case tracking-normal text-xs">Errands</Keycap>
                  <span className="text-slate-600 font-normal text-sm">Tasks</span>
                </p>
                <p>Find tasks or earn money by completing them, with secure payments.</p>
              </div>
              <div>
                <p className="font-semibold flex flex-wrap items-center gap-2">
                  <Keycap className="normal-case tracking-normal text-xs">Chat &amp; call</Keycap>
                  <span className="text-slate-600 font-normal text-sm">Messenger</span>
                </p>
                <p>Message, call, and communicate for business or social.</p>
              </div>
              <div>
                <p className="font-semibold flex flex-wrap items-center gap-2">
                  <Keycap className="normal-case tracking-normal text-xs">Watch &amp; listen</Keycap>
                  <span className="text-slate-600 font-normal text-sm">QwertyTV &amp; QwertyMusic</span>
                </p>
                <p>Stream videos, music, and content from creators.</p>
              </div>
              <div>
                <p className="font-semibold flex flex-wrap items-center gap-2">
                  <Keycap className="normal-case tracking-normal text-xs">Ask MacGyver</Keycap>
                  <span className="text-slate-600 font-normal text-sm">AI assistant</span>
                </p>
                <p>Get help, recommendations, and answers instantly.</p>
              </div>
            </div>
            <p className="text-slate-900 font-semibold">✅ One account. One platform. Everything connected.</p>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap gap-4">
          <Link
            href="/policies"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 text-white font-medium hover:bg-sky-700 transition-colors"
          >
            Community Guidelines & Policies
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/register"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 text-slate-700 font-medium hover:bg-slate-50 transition-colors"
          >
            Get Started
          </Link>
        </div>
      </div>
      </div>
      </div>
    </div>
  );
}
