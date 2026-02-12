'use client';

import { useState, useEffect } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { adminAPI } from '@/lib/api';
import Link from 'next/link';
import { ArrowLeft, Building2, Loader2, Plus } from 'lucide-react';
import toast from 'react-hot-toast';

interface StoreRow {
  _id: string;
  name: string;
  slug: string;
  type: string;
  userId?: { _id: string; name?: string; email?: string };
  supplierId?: { _id: string; storeName?: string; status?: string };
  createdAt?: string;
}

interface UserOption {
  _id: string;
  name?: string;
  email?: string;
}

export default function AdminStoresPage() {
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ userId: '', name: '', type: 'reseller' as 'supplier' | 'reseller' });

  useEffect(() => {
    fetchStores();
    fetchUsers();
  }, []);

  const fetchStores = async () => {
    try {
      const res = await adminAPI.getStores({ limit: 100 });
      const list = res.data?.stores ?? res.data ?? [];
      setStores(Array.isArray(list) ? list : []);
    } catch {
      toast.error('Failed to load stores');
      setStores([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await adminAPI.getUsers({ limit: 200 });
      const list = res.data?.users ?? res.data ?? [];
      setUsers(Array.isArray(list) ? list : []);
    } catch {
      setUsers([]);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.userId || !form.name.trim()) {
      toast.error('User and store name are required');
      return;
    }
    setSubmitting(true);
    try {
      await adminAPI.createStore({
        userId: form.userId,
        name: form.name.trim(),
        type: form.type,
      });
      toast.success('Store created');
      setShowForm(false);
      setForm({ userId: '', name: '', type: 'reseller' });
      fetchStores();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to create store');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ProtectedRoute allowedRoles={['admin', 'superadmin']}>
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-sky-100 text-slate-800">
        <header className="border-b border-white/60 bg-white/70 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
            <div>
              <p className="text-xs uppercase tracking-widest text-sky-600">Morongwa</p>
              <h1 className="mt-1 text-3xl font-semibold text-slate-900">Stores</h1>
              <p className="mt-1 text-sm text-slate-600">Create and manage supplier and reseller stores.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowForm(!showForm)}
                className="inline-flex items-center gap-2 rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-700"
              >
                <Plus className="h-4 w-4" /> Create store
              </button>
              <Link href="/admin" className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:shadow-md">
                <ArrowLeft className="h-4 w-4" /> Back to admin
              </Link>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-6 py-8">
          {showForm && (
            <div className="mb-8 rounded-2xl border border-white/60 bg-white/80 p-6 shadow-xl shadow-sky-50 backdrop-blur">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Create store for user</h2>
              <form onSubmit={handleCreate} className="grid gap-4 sm:grid-cols-2 max-w-xl">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">User *</label>
                  <select
                    required
                    value={form.userId}
                    onChange={(e) => setForm((f) => ({ ...f, userId: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                  >
                    <option value="">Select user</option>
                    {users.map((u) => (
                      <option key={u._id} value={u._id}>{u.name || u.email || u._id}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Store name *</label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                    placeholder="My Store"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
                  <select
                    value={form.type}
                    onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as 'supplier' | 'reseller' }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                  >
                    <option value="reseller">Reseller</option>
                    <option value="supplier">Supplier</option>
                  </select>
                </div>
                <div className="sm:col-span-2 flex gap-2">
                  <button type="submit" disabled={submitting} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50">
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin inline" /> : null} Create store
                  </button>
                  <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
                </div>
              </form>
            </div>
          )}

          <div className="rounded-2xl border border-white/60 bg-white/80 shadow-xl shadow-sky-50 backdrop-blur overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-10 w-10 animate-spin text-sky-600" />
              </div>
            ) : stores.length === 0 ? (
              <div className="py-16 text-center text-slate-500 flex flex-col items-center gap-2">
                <Building2 className="h-12 w-12 text-slate-300" />
                No stores yet. Create a store or approve a supplier to create one automatically.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Store</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Owner</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Type</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Slug</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stores.map((s) => (
                      <tr key={s._id} className="border-b border-slate-50 hover:bg-slate-50/50">
                        <td className="py-3 px-4 font-medium text-slate-900">{s.name}</td>
                        <td className="py-3 px-4 text-sm">{(s.userId as any)?.name ?? (s.userId as any)?.email ?? '—'}</td>
                        <td className="py-3 px-4 text-sm capitalize">{s.type}</td>
                        <td className="py-3 px-4 text-sm text-slate-600">{s.slug}</td>
                        <td className="py-3 px-4 text-sm text-slate-600">{s.createdAt ? new Date(s.createdAt).toLocaleDateString() : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
