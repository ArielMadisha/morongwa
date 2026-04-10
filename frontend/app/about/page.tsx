'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Package,
  Store,
  Truck,
  Wallet,
  MessageSquare,
  Tv,
  Music2,
  Share2,
  Wrench,
  ArrowRight,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useCartAndStores } from '@/lib/useCartAndStores';
import { AppSidebar, AppSidebarMenuButton } from '@/components/AppSidebar';
import { SearchButton } from '@/components/SearchButton';
import { ProfileHeaderButton } from '@/components/ProfileHeaderButton';

const components = [
  {
    icon: Package,
    title: 'QwertyHub – Marketplace & Reselling Engine',
    description:
      'QwertyHub is the marketplace foundation of Qwertymates. Suppliers upload and manage their products on the platform. Users browse and resell products instantly. Users do not handle stock, shipping, or inventory. Products are fulfilled directly by suppliers. Once a user starts reselling, a personal store is automatically created. This allows anyone to become a digital seller with zero inventory risk and minimal setup.',
  },
  {
    icon: Store,
    title: 'MyStore – Automatically Created Online Stores',
    description:
      'MyStore is a personal digital storefront created automatically for users who resell products. No manual setup required. Products selected from QwertyHub appear instantly. Orders, earnings, and transactions are managed seamlessly. Users can focus entirely on selling, promotion, and growth, while the platform handles the rest.',
  },
  {
    icon: Truck,
    title: 'Errands – Task & Service Marketplace',
    description:
      'The Errands feature connects people who need tasks completed with people willing to do them. Clients post errands or tasks. Errand Runners browse and choose tasks. Funds are securely held until task completion. Payment is released to the runner once the task is completed and confirmed. This creates a trusted, transparent, and fair system for service-based work.',
  },
  {
    icon: Wallet,
    title: 'ACBPayWallet – Integrated Digital Wallet',
    description:
      'ACBPayWallet is the financial backbone of Qwertymates, handling all monetary transactions across the platform. It supports payments for products and services, donations, peer-to-peer transfers, wallet top-ups, payment requests, and disbursements and withdrawals. ACBPayWallet ensures secure, centralized, and seamless financial operations across all features.',
  },
  {
    icon: MessageSquare,
    title: 'Morongwa – Messaging & Communication Hub',
    description:
      "Morongwa is Qwertymates' built-in messenger, designed for both business and social communication. Chat about orders, deliveries, and errands. Communicate between buyers, sellers, clients, and runners. Send normal social messages. Make voice and video calls. Keep all platform-related communication in one place. By integrating messaging directly into the platform, Morongwa eliminates the need for external chat apps.",
  },
  {
    icon: Tv,
    title: 'QwertyTV – Video & Live Streaming Hub',
    description:
      'QwertyTV is the centralized home for all video content on Qwertymates: live streams, movies, short videos and reels, and creator-driven video content. QwertyTV serves as an entertainment and engagement hub for both creators and viewers.',
  },
  {
    icon: Music2,
    title: 'QwertyMusic – Music Streaming & Distribution Platform',
    description:
      'QwertyMusic hosts the platform\'s full music ecosystem. Users can stream music and buy and download songs. Artists, publishers, and record companies can upload and publish music and monetize their content directly. This creates a creator-friendly, monetized music platform for artists and listeners alike.',
  },
  {
    icon: Share2,
    title: 'Media Content & Social Posts',
    description:
      'Qwertymates also functions as a social platform where users can create text posts, share images, like and comment on posts, and report inappropriate or harmful content. This social layer strengthens community engagement and content discovery.',
  },
  {
    icon: Wrench,
    title: 'Ask MacGyver – AI Copilot',
    description:
      "Ask MacGyver is Qwertymates' built-in AI Copilot, designed to assist users across the entire platform. Navigate features and services. Discover products, errands, and content. Get recommendations and insights. Answer questions about stores, payments, media, and tasks. Improve productivity and decision-making. Ask MacGyver brings intelligent, real-time assistance directly into the user experience.",
  },
];

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
          <p className="text-lg text-slate-600 leading-relaxed mb-4">
            Qwertymates is a powerful all-in-one digital ecosystem that combines commerce, services,
            payments, media, communication, social interaction, and AI assistance into a single
            platform. It is built to empower individuals and businesses to earn, transact, create,
            communicate, and connect—all without the complexity of managing inventory, logistics, or
            multiple disconnected applications.
          </p>
          <p className="text-slate-600 leading-relaxed">
            Qwertymates is designed to be a complete digital lifestyle platform, supporting
            entrepreneurship, gig work, content creation, entertainment, and everyday communication.
          </p>
        </div>

        <h2 className="text-2xl font-bold text-slate-900 mb-6">Core Components</h2>
        <div className="space-y-8">
          {components.map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-sky-100 flex items-center justify-center">
                  <Icon className="h-6 w-6 text-sky-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">{title}</h3>
                  <p className="text-slate-600 leading-relaxed">{description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12 p-6 rounded-xl bg-sky-50 border border-sky-100">
          <h3 className="text-xl font-bold text-slate-900 mb-3">One Platform. Everything Connected.</h3>
          <p className="text-slate-600 mb-4">
            Qwertymates uniquely brings together: inventory-free e-commerce, task-based earning
            (Errands), secure digital payments (ACBPayWallet), built-in messaging and video calls
            (Morongwa), music and video streaming (QwertyMusic & QwertyTV), social media features,
            and AI-powered assistance (Ask MacGyver).
          </p>
          <p className="text-slate-600">
            All within a single, unified, easy-to-use platform: QwertyHub, MyStore, Errands, Cart,
            ACBPayWallet, Morongwa, QwertyTV, QwertyMusic, and Ask MacGyver.
          </p>
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
