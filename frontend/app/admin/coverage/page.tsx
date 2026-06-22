'use client';

import { ProtectedRoute } from '@/components/ProtectedRoute';
import Link from 'next/link';
import { ArrowLeft, ClipboardList, ExternalLink } from 'lucide-react';

type AdminLink = { label: string; href: string };

type Row = { surface: string; publicPath: string; admin: AdminLink[]; notes?: string };

const ROWS: Row[] = [
  {
    surface: 'Home / landing',
    publicPath: '/',
    admin: [{ label: 'Landing backgrounds', href: '/admin/landing-backgrounds' }],
    notes: 'Login/register backgrounds',
  },
  {
    surface: 'Wall (feed)',
    publicPath: '/wall',
    admin: [{ label: 'QwertyTV moderation', href: '/admin/tv' }],
    notes: 'Posts, comments, reports',
  },
  {
    surface: 'QwertyTV hub',
    publicPath: '/morongwa-tv',
    admin: [{ label: 'QwertyTV moderation', href: '/admin/tv' }],
    notes: 'Same moderation surface',
  },
  {
    surface: 'Live watch / Go live',
    publicPath: '/morongwa-tv/live/watch/[userId] · Wall Create post',
    admin: [{ label: 'Live streaming', href: '/admin/live' }],
    notes: 'Platform HLS/RTMP env · isLive broadcasters · force end',
  },
  {
    surface: 'Marketplace',
    publicPath: '/marketplace',
    admin: [
      { label: 'Products', href: '/admin/products' },
      { label: 'Suppliers', href: '/admin/suppliers' },
      { label: 'Orders', href: '/admin/orders' },
      { label: 'Product enquiries', href: '/admin/product-enquiries' },
    ],
    notes: 'Buyer–seller threads',
  },
  {
    surface: 'Stores / reseller wall',
    publicPath: '/store',
    admin: [
      { label: 'Stores', href: '/admin/stores' },
      { label: 'Reseller stats', href: '/admin/reseller' },
    ],
    notes: '',
  },
  {
    surface: 'Wallet & integrations',
    publicPath: '/wallet · /pay',
    admin: [
      { label: 'Money metrics', href: '/admin/money-metrics' },
      { label: 'Pricing', href: '/admin/pricing' },
      { label: 'Merchant agents', href: '/admin/merchant-agents' },
      { label: 'Worldpay payouts', href: '/admin/worldpay-payouts' },
    ],
    notes: 'Fees, treasury, agent programs',
  },
  {
    surface: 'Tasks & errands',
    publicPath: '/tasks',
    admin: [{ label: 'Tasks', href: '/admin/tasks' }],
    notes: 'Quotes, cancellations',
  },
  {
    surface: 'Runners',
    publicPath: '(runner dashboard)',
    admin: [{ label: 'Runners', href: '/admin/runners' }],
    notes: 'PDP & vehicle verification',
  },
  {
    surface: 'Direct messages',
    publicPath: '/messages',
    admin: [{ label: 'Direct messages', href: '/admin/messages' }],
    notes: 'User-to-user DMs',
  },
  {
    surface: 'Task messenger',
    publicPath: '(in-task)',
    admin: [{ label: 'Tasks (context)', href: '/admin/tasks' }],
    notes: 'No separate inbox',
  },
  {
    surface: 'Support',
    publicPath: '(in-app)',
    admin: [{ label: 'Support', href: '/admin/support' }],
    notes: '',
  },
  {
    surface: 'Music',
    publicPath: '/qwerty-music',
    admin: [
      { label: 'Music', href: '/admin/music' },
      { label: 'Artists', href: '/admin/artists' },
    ],
    notes: '',
  },
  {
    surface: 'Policy / compliance pages',
    publicPath: '/about · /account-deletion · /child-safety-standards',
    admin: [],
    notes: 'Source in repo DOCS / legal copy',
  },
  {
    surface: 'Web slot adverts',
    publicPath: '(sidebar slots)',
    admin: [{ label: 'Adverts', href: '/admin/adverts' }],
    notes: 'Advert model · random/promo image slots only',
  },
  {
    surface: 'Sponsored creatives (WhatsApp + web)',
    publicPath: '(API placements)',
    admin: [
      { label: 'Sponsored video', href: '/admin/sponsored-video' },
      { label: 'Web advertising', href: '/admin/advertising' },
    ],
    notes: 'SponsoredVideoAd + Advertiser; WA menu timing = Twilio Studio, not Adverts page',
  },
];

export default function AdminSiteCoveragePage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'superadmin']}>
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-sky-100 text-slate-800">
        <header className="border-b border-white/60 bg-white/70 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-6 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-widest text-sky-600">Qwertymates</p>
              <h1 className="mt-1 flex items-center gap-2 text-3xl font-semibold text-slate-900">
                <ClipboardList className="h-8 w-8 text-sky-600" aria-hidden />
                Site coverage
              </h1>
              <p className="mt-1 max-w-2xl text-sm text-slate-600">
                Major public surfaces and where to administer them. Canonical detail lives in{' '}
                <code className="rounded bg-slate-100 px-1 text-xs">DOCS/ADMIN_SITE_COVERAGE.md</code>.
              </p>
            </div>
            <Link
              href="/admin"
              className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:shadow-md"
            >
              <ArrowLeft className="h-4 w-4" /> Back to admin
            </Link>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-6 py-8">
          <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white/90 shadow-sm">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50/80">
                <tr>
                  <th className="px-4 py-3 font-semibold text-slate-700">Surface</th>
                  <th className="px-4 py-3 font-semibold text-slate-700">Public</th>
                  <th className="px-4 py-3 font-semibold text-slate-700">Admin</th>
                  <th className="px-4 py-3 font-semibold text-slate-700">Notes</th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map((r) => (
                  <tr key={r.surface} className="border-b border-slate-50 align-top hover:bg-sky-50/40">
                    <td className="px-4 py-3 font-medium text-slate-900">{r.surface}</td>
                    <td className="px-4 py-3 text-slate-600">{r.publicPath}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {r.admin.length === 0 ? (
                        '—'
                      ) : (
                        <span className="flex flex-wrap gap-x-2 gap-y-1">
                          {r.admin.map((l, i) => (
                            <span key={`${r.surface}-${l.href}`}>
                              {i > 0 ? <span className="text-slate-300"> · </span> : null}
                              <Link href={l.href} className="font-medium text-sky-700 hover:underline">
                                {l.label}
                              </Link>
                            </span>
                          ))}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{r.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-8 text-center text-sm text-slate-600">
            <Link href="/admin/messages" className="font-semibold text-sky-700 hover:underline">
              Direct messages
            </Link>
            {' · '}
            <Link href="/admin/live" className="font-semibold text-sky-700 hover:underline">
              Live broadcasters
            </Link>
            {' · '}
            <Link href="/admin/product-enquiries" className="font-semibold text-sky-700 hover:underline">
              Product enquiries
            </Link>
          </p>

          <p className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs text-slate-500">
            <ExternalLink className="inline h-3 w-3" aria-hidden />
            Deploy health checks:{' '}
            <a className="text-sky-700 hover:underline" href="https://www.qwertymates.com/">
              qwertymates.com
            </a>
            {' · '}
            <a className="text-sky-700 hover:underline" href="https://www.qwertymates.com/wall">
              /wall
            </a>
          </p>
        </main>
      </div>
    </ProtectedRoute>
  );
}
