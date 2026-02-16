import Link from 'next/link';
import { ArrowRight, Package, UserCircle, Shield, MessageSquare, Sparkles, Store } from 'lucide-react';
import SiteHeader from '@/components/SiteHeader';
import LandingMarketplaceCard from '@/components/LandingMarketplaceCard';
import { AuthRedirectToWall } from '@/components/AuthRedirectToWall';

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-sky-50 via-blue-50 to-white text-slate-900">
      <AuthRedirectToWall />
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-20 -top-24 h-96 w-96 rounded-full bg-gradient-to-br from-sky-200/60 to-blue-300/35 blur-3xl" />
        <div className="absolute right-[-10rem] top-12 h-[28rem] w-[28rem] rounded-full bg-gradient-to-tr from-cyan-200/60 via-blue-200/45 to-indigo-200/50 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(59,130,246,0.12),transparent_42%),radial-gradient(circle_at_80%_0%,rgba(14,165,233,0.12),transparent_38%),radial-gradient(circle_at_55%_78%,rgba(79,70,229,0.12),transparent_45%)]" />
      </div>

      <SiteHeader minimal />

      {/* Hero Section */}
      <main className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-12 items-center">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 text-sm font-semibold text-sky-700 bg-white/80 backdrop-blur-md px-4 py-2 rounded-full shadow-sm border border-sky-100">
              <Sparkles className="h-4 w-4" />
              Join the Qwerty Revolution
            </div>
            <h1 className="text-5xl md:text-6xl font-extrabold text-slate-900 leading-tight">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">
                The Digital Home for Doers, Sellers & Creators.
              </span>
            </h1>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link
                href="/register"
                className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-8 py-4 rounded-xl hover:from-blue-700 hover:to-indigo-700 font-semibold text-lg transition-all inline-flex items-center justify-center shadow-lg shadow-blue-600/20"
              >
                Get Started
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
              <Link
                href="/register"
                className="bg-white/80 text-blue-700 px-8 py-4 rounded-xl hover:bg-white font-semibold text-lg border-2 border-blue-100 transition-all inline-flex items-center justify-center shadow-sm"
              >
                Register
              </Link>
              <Link
                href="/login"
                className="bg-white/80 text-blue-700 px-8 py-4 rounded-xl hover:bg-white font-semibold text-lg border-2 border-blue-100 transition-all inline-flex items-center justify-center shadow-sm"
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
                <span className="h-2 w-2 rounded-full bg-blue-500" />
                Escrow-secured payouts
              </div>
            </div>
          </div>

          <LandingMarketplaceCard />
        </div>

        {/* Features */}
        <div className="mt-24 grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          <div className="bg-white/85 backdrop-blur-md p-8 rounded-2xl shadow-lg hover:shadow-xl transition-shadow border border-slate-100">
            <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mb-6">
              <UserCircle className="h-8 w-8 text-blue-600" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-3">Trusted Runners</h3>
            <p className="text-slate-600">
              All runners are verified and rated by the community. Choose who you trust with your tasks.
            </p>
          </div>

          <div className="bg-white/85 backdrop-blur-md p-8 rounded-2xl shadow-lg hover:shadow-xl transition-shadow border border-slate-100">
            <div className="bg-green-100 w-16 h-16 rounded-full flex items-center justify-center mb-6">
              <Shield className="h-8 w-8 text-green-600" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-3">Secure Payments</h3>
            <p className="text-slate-600">
              Your payment is held securely in escrow until the task is completed to your satisfaction.
            </p>
          </div>

          <div className="bg-white/85 backdrop-blur-md p-8 rounded-2xl shadow-lg hover:shadow-xl transition-shadow border border-slate-100">
            <div className="bg-purple-100 w-16 h-16 rounded-full flex items-center justify-center mb-6">
              <MessageSquare className="h-8 w-8 text-purple-600" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-3">Real-time Chat</h3>
            <p className="text-slate-600">
              Stay in touch with your runner through our built-in messaging system.
            </p>
          </div>

          <div className="bg-white/85 backdrop-blur-md p-8 rounded-2xl shadow-lg hover:shadow-xl transition-shadow border border-slate-100">
            <div className="bg-amber-100 w-16 h-16 rounded-full flex items-center justify-center mb-6">
              <Store className="h-8 w-8 text-amber-600" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-3">Open Your Own Store</h3>
            <p className="text-slate-600">
              You don&apos;t have to keep stock. Suppliers handle the stock and shipping.
            </p>
            <Link
              href="/marketplace"
              className="mt-4 inline-flex items-center gap-1.5 text-amber-600 hover:text-amber-700 font-semibold text-sm"
            >
              Browse products <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        {/* How It Works */}
        <div className="mt-24 bg-white/90 backdrop-blur-md rounded-3xl shadow-xl p-12 border border-slate-100">
          <h2 className="text-3xl font-bold text-center text-slate-900 mb-12">How It Works</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="bg-gradient-to-br from-blue-600 to-indigo-600 text-white w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 text-xl font-bold shadow-lg shadow-blue-600/30">
                1
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Post Your Task</h3>
              <p className="text-slate-600">Describe what you need done and set your budget</p>
            </div>
            <div className="text-center">
              <div className="bg-gradient-to-br from-blue-600 to-indigo-600 text-white w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 text-xl font-bold shadow-lg shadow-blue-600/30">
                2
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Get Matched</h3>
              <p className="text-slate-600">Nearby runners accept your task and get to work</p>
            </div>
            <div className="text-center">
              <div className="bg-gradient-to-br from-blue-600 to-indigo-600 text-white w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 text-xl font-bold shadow-lg shadow-blue-600/30">
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
              <div className="flex items-center space-x-2 mb-4">
                <Package className="h-6 w-6 text-blue-600" />
                <span className="text-lg font-bold text-slate-900">Morongwa</span>
              </div>
              <p className="text-sm text-slate-600">Your errand marketplace, built for trust and speed.</p>
            </div>

            <div>
              <h4 className="font-semibold text-slate-900 mb-4 text-sm">Legal</h4>
              <ul className="space-y-2 text-sm">
                <li><Link href="/policies/terms-of-service" className="text-slate-600 hover:text-sky-600">Terms of Service</Link></li>
                <li><Link href="/policies/privacy-policy" className="text-slate-600 hover:text-sky-600">Privacy Policy</Link></li>
                <li><Link href="/policies/cookies-tracking" className="text-slate-600 hover:text-sky-600">Cookies</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold text-slate-900 mb-4 text-sm">Platform</h4>
              <ul className="space-y-2 text-sm">
                <li><Link href="/policies/pricing-fees" className="text-slate-600 hover:text-sky-600">Pricing & Fees</Link></li>
                <li><Link href="/policies/escrow-payouts" className="text-slate-600 hover:text-sky-600">Escrow & Payouts</Link></li>
                <li><Link href="/marketplace" className="text-slate-600 hover:text-sky-600">Marketplace</Link></li>
                <li><Link href="/policies/suppliers-manufacturers" className="text-slate-600 hover:text-sky-600">Suppliers & Manufacturers</Link></li>
                <li><Link href="/policies/acceptable-use" className="text-slate-600 hover:text-sky-600">Community Guidelines</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold text-slate-900 mb-4 text-sm">Resources</h4>
              <ul className="space-y-2 text-sm">
                <li><Link href="/policies" className="text-slate-600 hover:text-sky-600">All Policies</Link></li>
                <li><Link href="/policies/security-vulnerability" className="text-slate-600 hover:text-sky-600">Security</Link></li>
                <li><Link href="/policies/consumer-complaints" className="text-slate-600 hover:text-sky-600">Support</Link></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-8 flex justify-between items-center">
            <p className="text-slate-500 text-sm">
              © {new Date().getFullYear()} Morongwa. All rights reserved.
            </p>
            <p className="text-slate-500 text-xs">Serving Botswana · Lesotho · Namibia · South Africa · Zimbabwe · Zambia</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

