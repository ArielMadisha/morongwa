'use client';

import { useState, useEffect } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { adminAPI } from '@/lib/api';
import Link from 'next/link';
import { ArrowLeft, LayoutGrid, Loader2, Users, Package } from 'lucide-react';
import toast from 'react-hot-toast';

export default function AdminResellerPage() {
  const [stats, setStats] = useState<{ totalWalls?: number; wallsWithProducts?: number; totalProductsOnWalls?: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminAPI.getResellerStats().then((res) => setStats(res.data ?? null)).catch(() => { toast.error('Failed to load reseller stats'); setStats(null); }).finally(() => setLoading(false));
  }, []);

  return (
    <ProtectedRoute allowedRoles={['admin', 'superadmin']}>
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-sky-100 text-slate-800">
        <header className="border-b border-white/60 bg-white/70 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
            <div>
              <p className="text-xs uppercase tracking-widest text-sky-600">Morongwa</p>
              <h1 className="mt-1 text-3xl font-semibold text-slate-900">Reseller stats</h1>
              <p className="mt-1 text-sm text-slate-600">Reseller walls and products on walls.</p>
            </div>
            <Link href="/admin" className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:shadow-md">
              <ArrowLeft className="h-4 w-4" /> Back to admin
            </Link>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-6 py-8">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-10 w-10 animate-spin text-sky-600" />
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-white/60 bg-white/80 p-6 shadow-xl shadow-sky-50 backdrop-blur">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-slate-500">Total reseller walls</p>
                    <p className="mt-2 text-3xl font-semibold text-slate-900">{stats?.totalWalls ?? 0}</p>
                  </div>
                  <LayoutGrid className="h-10 w-10 text-sky-600" />
                </div>
              </div>
              <div className="rounded-2xl border border-white/60 bg-white/80 p-6 shadow-xl shadow-sky-50 backdrop-blur">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-slate-500">Walls with products</p>
                    <p className="mt-2 text-3xl font-semibold text-slate-900">{stats?.wallsWithProducts ?? 0}</p>
                  </div>
                  <Users className="h-10 w-10 text-emerald-600" />
                </div>
              </div>
              <div className="rounded-2xl border border-white/60 bg-white/80 p-6 shadow-xl shadow-sky-50 backdrop-blur">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-slate-500">Products on walls</p>
                    <p className="mt-2 text-3xl font-semibold text-slate-900">{stats?.totalProductsOnWalls ?? 0}</p>
                  </div>
                  <Package className="h-10 w-10 text-purple-600" />
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </ProtectedRoute>
  );
}
