'use client';

import Link from 'next/link';
import { ArrowLeft, Truck, Package, ArrowRight } from 'lucide-react';

export default function AdminDropshipPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-sky-100 text-slate-800">
      <header className="border-b border-white/60 bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
          <div>
            <Link href="/admin" className="inline-flex items-center gap-2 text-sm text-sky-600 hover:text-sky-700 mb-2">
              <ArrowLeft className="h-4 w-4" /> Back to admin
            </Link>
            <p className="text-xs uppercase tracking-[0.35em] text-sky-600">Qwertymates</p>
            <h1 className="mt-1 text-3xl font-semibold text-slate-900">Dropshipping</h1>
            <p className="mt-1 text-sm text-slate-600">
              Search, import, and manage products from dropshipping suppliers. Products are added to Qwertymates marketplace.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-sky-100 px-4 py-2">
            <Truck className="h-5 w-5 text-sky-600" />
            <span className="text-sm font-medium text-sky-700">Dropshipping</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="grid gap-6 md:grid-cols-2">
          <Link
            href="/admin/dropship/cj"
            className="group flex items-start gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-lg transition hover:-translate-y-1 hover:shadow-xl hover:border-sky-200"
          >
            <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-600">
              <Truck className="h-8 w-8" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-semibold text-slate-900">CJ Dropshipping</h2>
              <p className="mt-1 text-sm text-slate-600">
                Search CJ catalog, import products by ID or bulk, sync stock. 2-tier pricing applied on import.
              </p>
              <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-sky-600 group-hover:text-sky-700">
                Open <ArrowRight className="h-4 w-4" />
              </span>
            </div>
          </Link>

          <Link
            href="/admin/dropship/eprolo"
            className="group flex items-start gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-lg transition hover:-translate-y-1 hover:shadow-xl hover:border-teal-200"
          >
            <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl bg-teal-100 text-teal-600">
              <Package className="h-8 w-8" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-semibold text-slate-900">EPROLO</h2>
              <p className="mt-1 text-sm text-slate-600">
                Search EPROLO platform, import products by ID or bulk, sync stock. Products uploaded to Qwertymates.
              </p>
              <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-teal-600 group-hover:text-teal-700">
                Open <ArrowRight className="h-4 w-4" />
              </span>
            </div>
          </Link>
        </div>

        <p className="mt-8 text-center text-sm text-slate-500">
          Add API keys to backend .env and run <code className="bg-slate-100 px-1.5 py-0.5 rounded">npm run seed:external-suppliers</code> to configure suppliers.
        </p>
      </main>
    </div>
  );
}
