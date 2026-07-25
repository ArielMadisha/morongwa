'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Pencil, UtensilsCrossed } from 'lucide-react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { productsAPI } from '@/lib/api';

type Row = {
  supplierId: string;
  storeName: string;
  menuCount: number;
  extrasCount: number;
};

function AdminFoodRestaurantsPage() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    let cancelled = false;
    productsAPI
      .list({ category: 'Food & Restaurant', limit: 500, page: 1 })
      .then((res) => {
        if (cancelled) return;
        const list = (res.data?.data ?? res.data ?? []) as Array<{
          tags?: string[];
          supplierId?: { _id?: string; storeName?: string } | string;
          store?: { name?: string };
        }>;
        const map = new Map<string, Row>();
        for (const p of Array.isArray(list) ? list : []) {
          const sid =
            typeof p.supplierId === 'string'
              ? p.supplierId
              : String(p.supplierId?._id || '');
          if (!sid) continue;
          const name =
            p.store?.name ||
            (typeof p.supplierId === 'object' ? p.supplierId?.storeName : '') ||
            'Restaurant';
          const tags = (p.tags || []).map((t) => String(t).toLowerCase());
          const row = map.get(sid) || {
            supplierId: sid,
            storeName: name,
            menuCount: 0,
            extrasCount: 0,
          };
          if (tags.includes('food-extra')) row.extrasCount += 1;
          else row.menuCount += 1;
          map.set(sid, row);
        }
        setRows([...map.values()].sort((a, b) => a.storeName.localeCompare(b.storeName)));
      })
      .catch(() => setRows([]))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-orange-50 text-slate-800">
      <header className="border-b border-white/60 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-6">
          <div className="flex items-center gap-3">
            <UtensilsCrossed className="h-7 w-7 text-orange-600" />
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Food restaurants</h1>
              <p className="text-sm text-slate-600">
                Edit menus, pictures, prices/markup, and pickup location.
              </p>
            </div>
          </div>
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:shadow-md"
          >
            <ArrowLeft className="h-4 w-4" /> Back to admin
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        <p className="mb-4 text-sm text-slate-600">
          Paid orders WhatsApp the store number and credit the store wallet. Catalog also appears under{' '}
          <Link href="/admin/products" className="text-sky-600 hover:underline">
            Load Products
          </Link>
          .
        </p>
        {loading ? (
          <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
        ) : rows.length === 0 ? (
          <p className="text-slate-500">No food restaurants yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">Restaurant</th>
                  <th className="px-4 py-3 font-semibold">Menu</th>
                  <th className="px-4 py-3 font-semibold">Extras</th>
                  <th className="px-4 py-3 font-semibold">Admin</th>
                  <th className="px-4 py-3 font-semibold">Public</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.supplierId} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-medium text-slate-900">{r.storeName}</td>
                    <td className="px-4 py-3">{r.menuCount}</td>
                    <td className="px-4 py-3">{r.extrasCount}</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/food-restaurants/${r.supplierId}`}
                        className="inline-flex items-center gap-1.5 font-semibold text-orange-700 hover:underline"
                      >
                        <Pencil className="h-3.5 w-3.5" /> Edit menu
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/marketplace/food/store/${r.supplierId}?by=supplier`}
                        className="text-sky-600 hover:underline"
                        target="_blank"
                      >
                        Open public menu
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}

export default function Page() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'superadmin']}>
      <AdminFoodRestaurantsPage />
    </ProtectedRoute>
  );
}
