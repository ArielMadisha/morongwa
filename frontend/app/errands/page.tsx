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
import {
  ERRANDS_ANDROID_PLAY_URL,
  ERRANDS_BORDER_BULLETS,
  ERRANDS_DASHBOARD_URL,
  ERRANDS_POPULAR_ROUTES,
  ERRANDS_SA_BULLETS,
  APPS_GALLERY_PAGE_URL,
} from '@/lib/errandsMarketing';

const CHOICES = [
  { n: '1', emoji: '📦', label: 'Collect & Send (Cross Border)' },
  { n: '2', emoji: '🚛', label: 'Transport Items (Large Items)' },
  { n: '3', emoji: '📍', label: 'Local Errand' },
];

const PLAY_BADGE_SRC =
  'https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png';

export default function ErrandsPage() {
  const { user } = useAuth();
  const { cartCount, hasStore } = useCartAndStores(!!user);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-emerald-50 via-white to-sky-50 text-slate-900">
      <header className="sticky top-0 z-40 w-full flex-shrink-0 border-b border-slate-100 bg-white/95 shadow-sm backdrop-blur-md">
        <div className="px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <Link href={user ? '/wall' : '/'} className="flex shrink-0 items-center" aria-label="Home">
                <img
                  src="/qwertymates-logo-icon.png"
                  alt="Qwertymates"
                  className="h-14 w-14 shrink-0 object-contain sm:h-16 sm:w-16 lg:hidden"
                />
                <img src="/qwertymates-logo.png" alt="Qwertymates" className="hidden h-9 w-auto object-contain lg:block" />
              </Link>
              {user ? <AppSidebarMenuButton onClick={() => setMenuOpen((v) => !v)} /> : null}
            </div>
            <div className="min-w-0 flex-1" />
            <div className="flex shrink-0 items-center gap-2">
              <SearchButton className="max-w-[200px] sm:max-w-[280px]" />
              <ProfileHeaderButton />
            </div>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 min-w-0 w-full flex-1">
        {user ? (
          <AppSidebar
            variant="wall"
            cartCount={cartCount}
            hasStore={hasStore}
            menuOpen={menuOpen}
            setMenuOpen={setMenuOpen}
            hideLogo
            belowHeader
          />
        ) : null}
        <div className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              <span aria-hidden>📦</span> Qwertymates Errands
            </h1>
            <p className="mt-3 text-lg text-slate-600">Your trusted errands partner in Southern Africa</p>

            <section className="mt-10 space-y-6">
              <div className="rounded-2xl border border-emerald-200/80 bg-white/90 p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900">
                  <span aria-hidden>✅</span> In South Africa
                </h2>
                <p className="mt-2 text-slate-600">We assist with:</p>
                <ul className="mt-3 list-disc space-y-2 pl-5 text-slate-700">
                  {ERRANDS_SA_BULLETS.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>

              <div className="rounded-2xl border border-sky-200/80 bg-white/90 p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900">
                  <span aria-hidden>✅</span> Across Borders
                </h2>
                <p className="mt-2 text-slate-600">Buy in South Africa and let us handle the rest:</p>
                <ul className="mt-3 list-disc space-y-2 pl-5 text-slate-700">
                  {ERRANDS_BORDER_BULLETS.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>

              <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900">
                  <span aria-hidden>🚛</span> Safe Transport for Large Items
                </h2>
                <p className="mt-2 text-slate-600 leading-relaxed">
                  Move bulky goods with confidence — handled by trusted runners.
                </p>
              </div>

              <div className="rounded-2xl border border-sky-200 bg-sky-50/80 p-6">
                <h2 className="text-lg font-semibold text-slate-900">
                  <span aria-hidden>🌍</span> Popular Routes
                </h2>
                <ul className="mt-3 space-y-2 text-slate-700">
                  {ERRANDS_POPULAR_ROUTES.map((r) => (
                    <li key={r.label} className="flex items-center gap-2">
                      <span aria-hidden>
                        {r.flagFrom} → {r.flagTo}
                      </span>
                      <span>{r.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            <div className="mt-10 border-t border-slate-200 pt-8">
              <p className="text-slate-700">
                <span className="font-semibold text-slate-900">
                  <span aria-hidden>💡</span> Simple process:
                </span>{' '}
                You order → We collect → We deliver safely
              </p>
            </div>

            <div className="mt-10 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Choose what you need</h2>
              <ul className="mt-4 space-y-3 text-slate-700">
                {CHOICES.map((c) => (
                  <li key={c.n} className="flex flex-wrap items-start gap-2">
                    <Keycap className="mt-0.5 shrink-0 tabular-nums text-xs font-bold text-emerald-900 border-emerald-400/70 from-emerald-50 to-emerald-100/90">
                      {c.n}
                    </Keycap>
                    <span className="text-lg leading-none" aria-hidden>
                      {c.emoji}
                    </span>
                    <span className="font-medium text-slate-900">{c.label}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-sm text-slate-600">
                When you post a task, pick the workflow that matches — Collect &amp; Send (cross-border), Transport Items
                (large items), or a local errand — and we guide you through pickup, delivery, and pricing.
              </p>
            </div>

            <div className="mt-10 space-y-6 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-6">
              <div>
                <p className="text-sm font-medium text-slate-700">
                  <span aria-hidden>👇</span> Continue with Qwertymates Errands:
                </p>
                <a
                  href={ERRANDS_DASHBOARD_URL}
                  className="mt-2 inline-flex min-h-[44px] items-center gap-2 text-lg font-semibold text-emerald-800 underline decoration-emerald-600/60 underline-offset-4 hover:text-emerald-950"
                >
                  Qwertymates Dashboard
                  <ArrowRight className="h-5 w-5" aria-hidden />
                </a>
              </div>

              <div>
                <p className="text-sm font-medium text-slate-700">
                  <span aria-hidden>👇</span> Or download our mobile apps:
                </p>
                <ul className="mt-3 space-y-3">
                  <li>
                    <a
                      href={APPS_GALLERY_PAGE_URL}
                      className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700"
                    >
                      Download from Qwertymates (Android + Huawei)
                    </a>
                  </li>
                  <li>
                    <a
                      href={ERRANDS_ANDROID_PLAY_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                      aria-label="Android App on Google Play"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={PLAY_BADGE_SRC}
                        alt="Get it on Google Play"
                        width={180}
                        height={54}
                        className="h-14 w-auto"
                      />
                    </a>
                  </li>
                </ul>
              </div>
            </div>

            <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link
                href="/dashboard/client"
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 font-semibold text-white shadow hover:bg-emerald-700"
              >
                Post an errand
                <ArrowRight className="h-5 w-5" aria-hidden />
              </Link>
              <Link
                href="/runner/apply"
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-6 py-3 font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
              >
                Become a runner
              </Link>
              <Link
                href="/login"
                className="inline-flex min-h-[44px] items-center justify-center px-4 font-semibold text-slate-600 hover:text-slate-900"
              >
                Sign in
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
