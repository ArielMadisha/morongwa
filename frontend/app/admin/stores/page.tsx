'use client';

import { useState, useEffect, useCallback } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { adminAPI, getImageUrl } from '@/lib/api';
import Link from 'next/link';
import { ArrowLeft, Building2, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { StoreWhatsappMarketsEditor } from '@/components/admin/StoreWhatsappMarketsEditor';
import { STORE_LOCATION_COUNTRIES, storeCountryLabel } from '@/lib/storeCountries';

interface StoreRow {
  _id: string;
  name: string;
  slug: string;
  type: string;
  country?: string;
  countryCode?: string;
  address?: string;
  email?: string;
  cellphone?: string;
  whatsapp?: string;
  stripBackgroundPic?: string;
  whatsappMarketCountries?: string[];
  userId?: { _id: string; name?: string; email?: string };
  supplierId?: { _id: string; storeName?: string; status?: string };
  createdAt?: string;
}

interface UserOption {
  _id: string;
  name?: string;
  email?: string;
  username?: string;
}

export default function AdminStoresPage() {
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    userId: '',
    name: '',
    type: 'supplier' as 'supplier' | 'reseller',
    countryCode: 'ZA',
  });
  const [userSearch, setUserSearch] = useState('');
  const [usersLoading, setUsersLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  useEffect(() => {
    fetchStores();
    adminAPI
      .getPermissionsMe()
      .then((res) => setIsSuperAdmin(!!res.data?.isSuperAdmin))
      .catch(() => setIsSuperAdmin(false));
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

  const fetchStoreUserOptions = useCallback(async (q: string) => {
    setUsersLoading(true);
    try {
      const res = await adminAPI.getStoresUserOptions({
        limit: 300,
        q: q.trim() || undefined,
      });
      const list = res.data?.users ?? [];
      setUsers(Array.isArray(list) ? list : []);
    } catch {
      toast.error('Could not load users for this picker. If you are a delegated admin, you need the Stores permission.');
      setUsers([]);
    } finally {
      setUsersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!showForm) return;
    const t = window.setTimeout(() => {
      void fetchStoreUserOptions(userSearch);
    }, userSearch.trim() ? 320 : 0);
    return () => window.clearTimeout(t);
  }, [showForm, userSearch, fetchStoreUserOptions]);

  const handleDelete = async (s: StoreRow) => {
    const owner =
      (s.userId as { name?: string; email?: string })?.name ||
      (s.userId as { email?: string })?.email ||
      'this user';
    const superMsg = `Permanently delete store "${s.name}" (${s.type}) for ${owner}?\n\nSupplier: all linked marketplace products are removed. Reseller: MyStore listings cleared. Blocked if orders are in progress.`;
    const requestMsg = `Request removal of store "${s.name}" (${s.type}) for ${owner}?\n\nA super-admin will be notified and must approve before the store is permanently deleted.`;
    if (!confirm(isSuperAdmin ? superMsg : requestMsg)) {
      return;
    }
    setDeletingId(s._id);
    try {
      if (isSuperAdmin) {
        const res = await adminAPI.deleteStore(s._id);
        const productsDeleted = res.data?.productsDeleted as number | undefined;
        const myStoreListingsCleared = res.data?.myStoreListingsCleared as number | undefined;
        if (productsDeleted && productsDeleted > 0) {
          toast.success(`Store deleted (${productsDeleted} product(s) removed)`);
        } else if (myStoreListingsCleared && myStoreListingsCleared > 0) {
          toast.success(`Store deleted (cleared ${myStoreListingsCleared} MyStore listing(s))`);
        } else {
          toast.success('Store deleted');
        }
      } else {
        await adminAPI.requestStoreDeletion(s._id);
        toast.success('Removal request sent — super-admin will confirm');
      }
      fetchStores();
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast.error(msg || 'Failed');
    } finally {
      setDeletingId(null);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.userId || !form.name.trim() || !form.countryCode) {
      toast.error('User, store name, and country are required');
      return;
    }
    const countryRow = STORE_LOCATION_COUNTRIES.find((c) => c.code === form.countryCode);
    if (!countryRow) {
      toast.error('Please select a valid country');
      return;
    }
    setSubmitting(true);
    try {
      await adminAPI.createStore({
        userId: form.userId,
        name: form.name.trim(),
        type: form.type,
        country: countryRow.name,
        countryCode: countryRow.code,
      });
      toast.success('Store created');
      setShowForm(false);
      setUserSearch('');
      setForm({ userId: '', name: '', type: 'supplier', countryCode: 'ZA' });
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
              <p className="text-xs uppercase tracking-widest text-sky-600">Qwertymates</p>
              <h1 className="mt-1 text-3xl font-semibold text-slate-900">Stores</h1>
              <p className="mt-1 text-sm text-slate-600">
                Create and manage supplier and reseller stores. Set <strong className="font-semibold text-slate-700">WA markets</strong>{' '}
                per supplier for WhatsApp QwertyHub (menu 2). Delegated admins request removal; super-admin approves in{' '}
                <Link href="/admin/store-deletion-requests" className="text-sky-600 hover:underline">
                  Store removal queue
                </Link>
                .
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowForm((v) => !v);
                  if (showForm) {
                    setUserSearch('');
                    setForm((f) => ({ ...f, userId: '' }));
                  }
                }}
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
                  <label className="block text-sm font-medium text-slate-700 mb-1">Find user</label>
                  <input
                    type="search"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="Search name, email, or username…"
                    className="mb-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                    autoComplete="off"
                  />
                  <label className="block text-sm font-medium text-slate-700 mb-1">User *</label>
                  <select
                    required
                    value={form.userId}
                    onChange={(e) => setForm((f) => ({ ...f, userId: e.target.value }))}
                    disabled={usersLoading}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:cursor-wait disabled:opacity-60"
                  >
                    <option value="">{usersLoading ? 'Loading users…' : 'Select user'}</option>
                    {users.map((u) => (
                      <option key={u._id} value={u._id}>
                        {[u.name, u.email, u.username].filter(Boolean).join(' · ') || u._id}
                      </option>
                    ))}
                  </select>
                  {!usersLoading && users.length === 0 ? (
                    <p className="mt-1 text-xs text-amber-700">No users match this search. Try another name or email.</p>
                  ) : null}
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
                    <option value="supplier">Supplier (marketplace — loads products)</option>
                    <option value="reseller">Reseller (MyStore wall only)</option>
                  </select>
                  <p className="mt-1 text-xs text-slate-500">
                    Choose <strong>Supplier</strong> to list products in Admin → Products. Reseller stores do not appear in the supplier picker.
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Country *</label>
                  <select
                    required
                    value={form.countryCode}
                    onChange={(e) => setForm((f) => ({ ...f, countryCode: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                  >
                    {STORE_LOCATION_COUNTRIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-slate-500">Store location country (required for courier and marketplace routing).</p>
                </div>
                <div className="sm:col-span-2 flex gap-2">
                  <button type="submit" disabled={submitting} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50">
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin inline" /> : null} Create store
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowForm(false);
                      setUserSearch('');
                      setForm((f) => ({ ...f, userId: '' }));
                    }}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
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
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Marketplace</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Shop country</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">WA markets</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Contact</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Slug</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Created</th>
                      <th className="text-right py-3 px-4 text-sm font-semibold text-slate-700">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stores.map((s) => (
                      <tr key={s._id} className="border-b border-slate-50 hover:bg-slate-50/50">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full border border-slate-200 bg-slate-100">
                              {s.stripBackgroundPic ? (
                                <img
                                  src={getImageUrl(s.stripBackgroundPic)}
                                  alt=""
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-[10px] font-semibold uppercase text-slate-400">
                                  —
                                </div>
                              )}
                            </div>
                            <span className="font-medium text-slate-900 truncate">{s.name}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-sm">{(s.userId as any)?.name ?? (s.userId as any)?.email ?? '—'}</td>
                        <td className="py-3 px-4 text-sm capitalize">{s.type}</td>
                        <td className="py-3 px-4 text-sm">
                          {s.type === 'supplier' && s.supplierId ? (
                            <span className="text-emerald-700">Linked</span>
                          ) : s.type === 'supplier' ? (
                            <span className="text-amber-700">Supplier — open Edit to link</span>
                          ) : (
                            <span className="text-slate-500">N/A (reseller)</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-sm text-slate-600">
                          {storeCountryLabel(s.countryCode, s.country)}
                        </td>
                        <td className="py-3 px-4 text-sm text-slate-600 min-w-[10rem]">
                          {s.type === 'supplier' ? (
                            <StoreWhatsappMarketsEditor
                              store={s}
                              compact
                              onSave={async (whatsappMarketCountries) => {
                                await adminAPI.updateStore(s._id, { whatsappMarketCountries });
                                toast.success('WhatsApp markets updated');
                                fetchStores();
                              }}
                            />
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-sm text-slate-600 max-w-[180px] truncate" title={[s.email, s.cellphone, s.whatsapp].filter(Boolean).join(' · ')}>
                          {s.email || s.cellphone || s.whatsapp || '—'}
                        </td>
                        <td className="py-3 px-4 text-sm text-slate-600">{s.slug}</td>
                        <td className="py-3 px-4 text-sm text-slate-600">{s.createdAt ? new Date(s.createdAt).toLocaleDateString() : '—'}</td>
                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex items-center justify-end gap-2">
                            <Link
                              href={`/admin/stores/${s._id}/edit`}
                              className="inline-flex items-center gap-1 rounded-lg border border-sky-100 px-2.5 py-1.5 text-xs font-semibold text-sky-800 hover:bg-sky-50"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Edit
                            </Link>
                            <button
                              type="button"
                              onClick={() => void handleDelete(s)}
                              disabled={deletingId === s._id}
                              className="inline-flex items-center gap-1 rounded-lg border border-red-100 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                              title={isSuperAdmin ? 'Delete store now' : 'Request store removal'}
                            >
                              {deletingId === s._id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5" />
                              )}
                              {isSuperAdmin ? 'Delete' : 'Request removal'}
                            </button>
                          </div>
                        </td>
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
