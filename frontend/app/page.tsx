import Link from 'next/link';
import {
  ArrowRight,
  UserCircle,
  Shield,
  MessageSquare,
  Sparkles,
  Store,
  Music,
  Mic2,
  Tv,
  Wallet,
  Search,
  TrendingUp,
} from 'lucide-react';
import SiteHeader from '@/components/SiteHeader';
import LandingMarketplaceCard from '@/components/LandingMarketplaceCard';
import { AuthRedirectToWall } from '@/components/AuthRedirectToWall';

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-hidden text-slate-900">
      <AuthRedirectToWall />
      <div className="pointer-events-none absolute inset-0 z-0">
        <div className="absolute -left-20 -top-24 h-96 w-96 rounded-full bg-brand-200/50 blur-3xl" />
        <div className="absolute right-[-10rem] top-12 h-[28rem] w-[28rem] rounded-full bg-brand-300/40 blur-3xl" />
      </div>

      <div className="relative z-10">
        <SiteHeader minimal />
      </div>

      {/* Hero Section */}
      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-20">
        <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-12 items-center">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 text-sm font-semibold text-brand-700 bg-brand-50 backdrop-blur-md px-4 py-2 rounded-full shadow-xs border border-brand-100">
              <Sparkles className="h-4 w-4" />
              Join the Qwerty Revolution
            </div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold text-slate-900 leading-tight">
              The Digital Home for <span className="text-brand-600">Doers</span>, Sellers & Creators.
            </h1>
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
              <Link
                href="/register"
                prefetch={false}
                className="min-h-[44px] bg-brand-500 text-white px-6 py-3 sm:px-8 sm:py-4 rounded-lg hover:bg-brand-600 font-semibold text-base sm:text-lg transition-all inline-flex items-center justify-center shadow-sm"
              >
                Get Started
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
              <Link
                href="/register"
                prefetch={false}
                className="min-h-[44px] bg-white text-slate-800 px-6 py-3 sm:px-8 sm:py-4 rounded-lg hover:bg-slate-50 font-semibold text-base sm:text-lg border border-slate-200 transition-all inline-flex items-center justify-center shadow-xs"
              >
                Register
              </Link>
              <Link
                href="/login"
                prefetch={false}
                className="min-h-[44px] text-slate-600 hover:text-slate-900 font-semibold text-base sm:text-lg inline-flex items-center justify-center"
              >
                Sign in
              </Link>
            </div>
            <div className="flex items-center gap-4 text-sm text-slate-600">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Live platform uptime
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-brand-500" />
                Escrow-secured payouts
              </div>
            </div>
            <p className="text-sm text-slate-600 max-w-xl">
              Need a quick answer while you explore? Use{' '}
              <Link href="/search" className="font-semibold text-brand-600 hover:text-brand-700 underline-offset-2 hover:underline">
                Ask MacGyver
              </Link>{' '}
              in the search bar - plain-language help across tasks, QwertyHub, music, TV, and wallet topics.
            </p>
          </div>

          <LandingMarketplaceCard />
        </div>

        {/* Platform products & services */}
        <div className="mt-12 sm:mt-20">
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 text-center mb-2">
            What you can do on Qwertymates
          </h2>
          <p className="text-slate-600 text-center max-w-3xl mx-auto mb-10 text-sm sm:text-base">
            Runners, shops without stock, music, TV, wallet, messenger, and Ask MacGyver - together in one trusted platform.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
            <div className="bg-white/85 backdrop-blur-md p-6 sm:p-8 rounded-xl shadow-sm hover:shadow-md transition-shadow border border-slate-100">
              <div className="bg-brand-50 w-16 h-16 rounded-full flex items-center justify-center mb-6">
                <UserCircle className="h-8 w-8 text-brand-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Trusted Runners</h3>
              <p className="text-slate-600 text-sm sm:text-base">
                Verified, rated runners in your area. Post errands and deliveries with confidence.
              </p>
            </div>

            <div className="bg-white/85 backdrop-blur-md p-6 sm:p-8 rounded-xl shadow-sm hover:shadow-md transition-shadow border border-slate-100">
              <div className="bg-emerald-100 w-16 h-16 rounded-full flex items-center justify-center mb-6">
                <Shield className="h-8 w-8 text-green-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Secure payments</h3>
              <p className="text-slate-600 text-sm sm:text-base">
                Task payments stay in escrow until you are satisfied. Marketplace checkouts use the same trust-first approach.
              </p>
            </div>

            <div className="bg-white/85 backdrop-blur-md p-6 sm:p-8 rounded-xl shadow-sm hover:shadow-md transition-shadow border border-slate-100">
              <div className="bg-violet-100 w-16 h-16 rounded-full flex items-center justify-center mb-6">
                <MessageSquare className="h-8 w-8 text-violet-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Morongwa Messenger</h3>
              <p className="text-slate-600 text-sm sm:text-base mb-4">
                Peer-to-peer chat with buyers, sellers, and runners - plus video calls when you need to show or explain something live.
              </p>
              <Link href="/messages" className="text-violet-700 hover:text-violet-800 font-semibold text-sm inline-flex items-center gap-1">
                Open Messages <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="bg-white/85 backdrop-blur-md p-6 sm:p-8 rounded-xl shadow-sm hover:shadow-md transition-shadow border border-slate-100">
              <div className="bg-lime-100 w-16 h-16 rounded-full flex items-center justify-center mb-6">
                <TrendingUp className="h-8 w-8 text-lime-800" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Earn without holding stock</h3>
              <p className="text-slate-600 text-sm sm:text-base mb-4">
                Add products to MyStore from QwertyHub, set your margin, and sell to your audience. Suppliers and fulfilment partners ship for you - you focus on audience and promotion.
              </p>
              <Link href="/register" className="text-lime-800 hover:text-lime-900 font-semibold text-sm inline-flex items-center gap-1">
                Start earning <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="bg-white/85 backdrop-blur-md p-6 sm:p-8 rounded-xl shadow-md hover:shadow-lg transition-shadow border border-amber-200/80 sm:col-span-2 lg:col-span-1 ring-1 ring-amber-100/60">
              <div className="bg-amber-100 w-16 h-16 rounded-full flex items-center justify-center mb-6">
                <Store className="h-8 w-8 text-amber-700" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">QwertyHub (not &quot;Just another dropshipping website&quot;)</h3>
              <p className="text-slate-600 text-sm sm:text-base mb-4">
                <span className="font-semibold text-slate-800">Traditional retail:</span> tie up cash in inventory, warehouse, and packaging.
                <span className="font-semibold text-slate-800"> Ordinary faceless dropship:</span> anonymous storefronts and weak buyer trust.
                <span className="font-semibold text-slate-800"> QwertyHub:</span> curated suppliers, integrated fulfilment, escrow-backed checkout, resell flows, and ties to your <Link href="/morongwa-tv" className="text-amber-700 hover:underline">Qwerty TV</Link> presence - a real ecosystem, not a lone plugin store.
              </p>
              <Link href="/marketplace" className="text-amber-700 hover:text-amber-800 font-semibold text-sm inline-flex items-center gap-1">
                Explore QwertyHub <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="bg-white/85 backdrop-blur-md p-6 sm:p-8 rounded-xl shadow-sm hover:shadow-md transition-shadow border border-slate-100">
              <div className="bg-rose-100 w-16 h-16 rounded-full flex items-center justify-center mb-6">
                <Music className="h-8 w-8 text-rose-700" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">QwertyMusic</h3>
              <p className="text-slate-600 text-sm sm:text-base mb-4">
                Discover tracks, support local sound, and buy music in one place - built for fans who already use the rest of Qwertymates.
              </p>
              <Link href="/qwerty-music" className="text-rose-700 hover:text-rose-800 font-semibold text-sm inline-flex items-center gap-1">
                Listen &amp; shop music <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="bg-white/85 backdrop-blur-md p-6 sm:p-8 rounded-xl shadow-sm hover:shadow-md transition-shadow border border-slate-100">
              <div className="bg-fuchsia-100 w-16 h-16 rounded-full flex items-center justify-center mb-6">
                <Mic2 className="h-8 w-8 text-fuchsia-800" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Music for artists &amp; labels</h3>
              <p className="text-slate-600 text-sm sm:text-base mb-4">
                Artists, local rights owners, and production companies can publish and monetize catalog - reach buyers and viewers across QwertyHub and Qwerty TV.
              </p>
              <Link href="/qwerty-music" className="text-fuchsia-800 hover:text-fuchsia-900 font-semibold text-sm inline-flex items-center gap-1">
                Open QwertyMusic <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="bg-white/85 backdrop-blur-md p-6 sm:p-8 rounded-xl shadow-sm hover:shadow-md transition-shadow border border-slate-100">
              <div className="bg-sky-100 w-16 h-16 rounded-full flex items-center justify-center mb-6">
                <Tv className="h-8 w-8 text-sky-700" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Qwerty TV</h3>
              <p className="text-slate-600 text-sm sm:text-base mb-4">
                Morongwa-TV for short video and images: local creators monetize attention, link products, and grow with the same audience as the marketplace.
              </p>
              <Link href="/morongwa-tv" className="text-sky-700 hover:text-sky-800 font-semibold text-sm inline-flex items-center gap-1">
                Watch &amp; create <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="bg-white/85 backdrop-blur-md p-6 sm:p-8 rounded-xl shadow-sm hover:shadow-md transition-shadow border border-slate-100">
              <div className="bg-indigo-100 w-16 h-16 rounded-full flex items-center justify-center mb-6">
                <Wallet className="h-8 w-8 text-indigo-700" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">ACBPayWallet</h3>
              <p className="text-slate-600 text-sm sm:text-base mb-4">
                Top up, track balance, and move money for tasks and marketplace activity - PayGate-backed funding with clear in-app history.
              </p>
              <Link href="/wallet" className="text-indigo-700 hover:text-indigo-800 font-semibold text-sm inline-flex items-center gap-1">
                Go to Wallet <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="bg-white/85 backdrop-blur-md p-6 sm:p-8 rounded-xl shadow-sm hover:shadow-md transition-shadow border border-slate-100">
              <div className="bg-brand-100 w-16 h-16 rounded-full flex items-center justify-center mb-6">
                <Search className="h-8 w-8 text-brand-700" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Ask MacGyver</h3>
              <p className="text-slate-600 text-sm sm:text-base mb-4">
                Ask plain-language questions in search - shortcuts to policies, product areas, and how things work on the platform.
              </p>
              <Link href="/search" className="text-brand-700 hover:text-brand-800 font-semibold text-sm inline-flex items-center gap-1">
                Try Ask MacGyver <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>

        {/* How It Works */}
        <div className="mt-24 bg-white/90 backdrop-blur-md rounded-3xl shadow-xl p-8 sm:p-12 border border-slate-100">
          <h2 className="text-3xl font-bold text-center text-slate-900 mb-2">
            Let Trusted Runners Do your Tasks
          </h2>
          <p className="text-center text-lg sm:text-xl font-semibold text-brand-700 tracking-tight mb-12">
            How It Works
          </p>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="bg-brand-500 text-white w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 text-xl font-bold shadow-sm">
                1
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Post Your Task</h3>
              <p className="text-slate-600">Describe what you need done and set your budget</p>
            </div>
            <div className="text-center">
              <div className="bg-brand-500 text-white w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 text-xl font-bold shadow-sm">
                2
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Get Matched</h3>
              <p className="text-slate-600">Nearby runners accept your task and get to work</p>
            </div>
            <div className="text-center">
              <div className="bg-brand-500 text-white w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 text-xl font-bold shadow-sm">
                3
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Task Complete</h3>
              <p className="text-slate-600">Review your runner and payment is released</p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative bg-white/85 backdrop-blur-md mt-20 border-t border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <img src="/qwertymates-logo-icon.png" alt="" className="h-12 w-12 object-contain shrink-0" width={48} height={48} aria-hidden />
                <span className="text-lg font-bold text-slate-900">Qwertymates</span>
              </div>
              <p className="text-sm text-slate-600">The Digital Home for Doers, Sellers &amp; Creators.</p>
            </div>

            <div>
              <h4 className="font-semibold text-slate-900 mb-4 text-sm">Legal</h4>
              <ul className="space-y-2 text-sm">
                <li><Link href="/policies/terms-of-service" className="text-slate-600 hover:text-brand-600">Terms of Service</Link></li>
                <li><Link href="/policies/privacy-policy" className="text-slate-600 hover:text-brand-600">Privacy Policy</Link></li>
                <li><Link href="/policies/cookies-tracking" className="text-slate-600 hover:text-brand-600">Cookies</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold text-slate-900 mb-4 text-sm">Platform</h4>
              <ul className="space-y-2 text-sm">
                <li><Link href="/policies/pricing-fees" className="text-slate-600 hover:text-brand-600">Pricing &amp; Commissions</Link></li>
                <li><Link href="/policies/escrow-payouts" className="text-slate-600 hover:text-brand-600">Escrow & Payouts</Link></li>
                <li><Link href="/marketplace" className="text-slate-600 hover:text-brand-600">Marketplace</Link></li>
                <li><Link href="/policies/suppliers-manufacturers" className="text-slate-600 hover:text-brand-600">Suppliers & Manufacturers</Link></li>
                <li><Link href="/policies/acceptable-use" className="text-slate-600 hover:text-brand-600">Community Guidelines</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold text-slate-900 mb-4 text-sm">Resources</h4>
              <ul className="space-y-2 text-sm">
                <li><Link href="/about" className="text-slate-600 hover:text-brand-600">About Qwertymates</Link></li>
                <li><Link href="/policies" className="text-slate-600 hover:text-brand-600">All Policies</Link></li>
                <li><Link href="/policies/security-vulnerability" className="text-slate-600 hover:text-brand-600">Security</Link></li>
                <li><Link href="/policies/consumer-complaints" className="text-slate-600 hover:text-brand-600">Support</Link></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-8 flex flex-col sm:flex-row gap-3 sm:justify-between sm:items-center">
            <p className="text-slate-500 text-sm">
              © {new Date().getFullYear()} Qwertymates. All rights reserved.
            </p>
            <p className="text-slate-500 text-xs sm:text-sm text-left sm:text-right max-w-md sm:max-w-xl">
              Proudly serving communities across Africa, Asia, Europe, the Americas, and beyond.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

