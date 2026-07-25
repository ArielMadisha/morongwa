'use client';

import { QwertyHubSectionShell } from '@/components/marketplace/QwertyHubSectionShell';

/** Order Groceries — placeholder until grocery partners go live. */
export default function MarketplaceGroceriesPage() {
  return (
    <QwertyHubSectionShell
      section="groceries"
      title="Order Groceries"
      description="Grocery delivery partners are on the way."
    >
      <div className="bg-white/90 backdrop-blur rounded-2xl border border-slate-100 p-10 sm:p-12 text-center shadow-sm">
        <h3 className="text-2xl font-semibold text-slate-800 mb-2">Coming Soon</h3>
        <p className="text-slate-600 max-w-md mx-auto">
          Order Groceries will open here soon. For now, shop products on QwertyHub or order food from restaurants.
        </p>
      </div>
    </QwertyHubSectionShell>
  );
}
