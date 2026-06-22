'use client';

import Link from 'next/link';
import { ArrowLeft, ArrowRight, MapPinned, Ship, Truck } from 'lucide-react';
import { ProtectedRoute } from '@/components/ProtectedRoute';

export default function AdminShippingPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'superadmin']}>
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-cyan-50 text-slate-800">
        <header className="border-b border-white/60 bg-white/70 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
            <div>
              <Link href="/admin" className="inline-flex items-center gap-2 text-sm text-sky-600 hover:text-sky-700 mb-2">
                <ArrowLeft className="h-4 w-4" /> Back to admin
              </Link>
              <p className="text-xs uppercase tracking-[0.35em] text-sky-600">Qwertymates · Commerce</p>
              <h1 className="mt-1 text-3xl font-semibold text-slate-900">Shipping</h1>
              <p className="mt-1 text-sm text-slate-600">
                Courier tariffs, parcel tracking, and delivery disputes for marketplace orders.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-xl bg-cyan-100 px-4 py-2">
              <Ship className="h-5 w-5 text-cyan-700" />
              <span className="text-sm font-medium text-cyan-800">Shipping</span>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-6 py-8">
          <div className="grid gap-6 md:grid-cols-2">
            <Link
              href="/admin/couriers"
              className="group flex items-start gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-lg transition hover:-translate-y-1 hover:shadow-xl hover:border-sky-200"
            >
              <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-600">
                <Truck className="h-8 w-8" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-semibold text-slate-900">Courier config</h2>
                <p className="mt-1 text-sm text-slate-600">
                  DeliverAI, PAXI, ICExpress, BEX, Triton, BotswanaPost tariffs. Shoppers see live prices at checkout.
                </p>
                <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-sky-600 group-hover:text-sky-700">
                  Open <ArrowRight className="h-4 w-4" />
                </span>
              </div>
            </Link>

            <Link
              href="/admin/shipping/tracking"
              className="group flex items-start gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-lg transition hover:-translate-y-1 hover:shadow-xl hover:border-cyan-200"
            >
              <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl bg-cyan-100 text-cyan-700">
                <MapPinned className="h-8 w-8" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-semibold text-slate-900">Tracking</h2>
                <p className="mt-1 text-sm text-slate-600">
                  View prepaid parcels, update tracking numbers and status, and follow delivery progress.
                </p>
                <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-cyan-700 group-hover:text-cyan-800">
                  Open <ArrowRight className="h-4 w-4" />
                </span>
              </div>
            </Link>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
