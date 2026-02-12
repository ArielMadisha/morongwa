import Link from 'next/link';
import { ArrowRight, Sparkles, UserCircle, Shield, MessageSquare } from 'lucide-react';
import SiteHeader from '@/components/SiteHeader';
import { AuthRedirectToWall } from '@/components/AuthRedirectToWall';
import LandingAuthCard from '@/components/LandingAuthCard';
import MarketplacePreviewSection from '@/components/MarketplacePreviewSection';

export default function Home() {
  return (
    <div className="relative min-h-screen bg-gradient-to-br from-sky-50 via-blue-50 to-white text-slate-900">
      <AuthRedirectToWall />
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-0 top-0 h-[480px] w-[480px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-200/50 blur-[100px]" />
        <div className="absolute right-0 top-1/4 h-[360px] w-[360px] translate-x-1/3 rounded-full bg-blue-200/40 blur-[80px]" />
      </div>

      <SiteHeader minimal />

      <main className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Hero */}
        <section className="pt-12 pb-16 lg:pt-16 lg:pb-20">
          <div className="grid lg:grid-cols-[1fr_400px] gap-10 lg:gap-14 items-start">
            <div className="min-w-0">
              <p className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-blue-600 mb-5">
                <Sparkles className="h-3.5 w-3.5" />
                Join the Qwerty Revolution
              </p>
              <h1 className="text-4xl sm:text-5xl font-bold text-slate-900 leading-[1.15] tracking-tight max-w-xl">
                The digital home for doers, sellers & creators.
              </h1>
              <p className="mt-4 text-lg text-slate-600 max-w-lg">
                Tasks, marketplace and reselling in one place. Secure payouts, real-time updates.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <Link
                  href="/"
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/25 hover:from-blue-700 hover:to-indigo-700 transition-colors"
                >
                  Get started
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/"
                  className="inline-flex items-center rounded-xl border-2 border-blue-200 bg-white/90 px-5 py-3 text-sm font-semibold text-blue-600 shadow-sm hover:border-blue-300 hover:bg-blue-50/80 transition-colors"
                >
                  Register
                </Link>
                <Link
                  href="/?signin=1"
                  className="inline-flex items-center rounded-xl border-2 border-blue-200 bg-white/90 px-5 py-3 text-sm font-semibold text-blue-600 shadow-sm hover:border-blue-300 hover:bg-blue-50/80 transition-colors"
                >
                  Sign in
                </Link>
              </div>
              <p className="mt-6 flex items-center gap-3 text-sm text-slate-500">
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Live uptime
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                  Escrow-secured
                </span>
              </p>
            </div>
            <div className="lg:sticky lg:top-24 shrink-0">
              <LandingAuthCard />
            </div>
          </div>
        </section>

        <MarketplacePreviewSection />

        {/* Features */}
        <section className="pt-16 pb-20">
          <h2 className="text-xl font-semibold text-slate-900 mb-8">Why Morongwa</h2>
          <div className="grid sm:grid-cols-3 gap-6">
            <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <UserCircle className="h-5 w-5" />
              </div>
              <h3 className="mt-4 font-semibold text-slate-900">Trusted runners</h3>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                Verified and rated by the community. Choose who handles your tasks.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <Shield className="h-5 w-5" />
              </div>
              <h3 className="mt-4 font-semibold text-slate-900">Secure payments</h3>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                Funds held in escrow until you’re satisfied with the work.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                <MessageSquare className="h-5 w-5" />
              </div>
              <h3 className="mt-4 font-semibold text-slate-900">Real-time chat</h3>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                Message your runner directly from the app.
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

