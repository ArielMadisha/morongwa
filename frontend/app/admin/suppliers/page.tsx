'use client';

import { useState, useEffect } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { adminAPI, usersAPI } from '@/lib/api';
import Link from 'next/link';
import { ArrowLeft, Building2, User, Loader2, Clock, CheckCircle, XCircle, Plus, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { AdminLocationFollowupLinks, AdminMessageFollowupLinks } from '@/components/admin/AdminDocumentFollowup';
import { formatSupplierAreaTown } from '@/lib/userAreaLabel';

interface SupplierRow {
  _id: string;
  userId: {
    name?: string;
    email?: string;
    phone?: string;
    countryCode?: string;
    runnerServiceCountry?: string;
    runnerServiceCity?: string;
    location?: { type?: string; coordinates?: number[] };
  };
  status: string;
  type: string;
  storeName?: string;
  contactEmail?: string;
  contactPhone?: string;
  pickupAddress?: string;
  country?: string;
  countryCode?: string;
  storeAddress?: string;
  appliedAt?: string;
}

type UserPick = { _id: string; name?: string; email?: string; username?: string };

export default function AdminSuppliersPage() {
  const PAGE_SIZE = 100;
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalSuppliers, setTotalSuppliers] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>('approved');

  const [addOpen, setAddOpen] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [userHits, setUserHits] = useState<UserPick[]>([]);
  const [userSearchLoading, setUserSearchLoading] = useState(false);
  const [pickedUser, setPickedUser] = useState<UserPick | null>(null);
  const [addType, setAddType] = useState<'individual' | 'company'>('individual');
  const [addStoreName, setAddStoreName] = useState('');
  const [addContactEmail, setAddContactEmail] = useState('');
  const [addContactPhone, setAddContactPhone] = useState('');
  const [addSubmitting, setAddSubmitting] = useState(false);

  useEffect(() => {
    fetchSuppliers(1);
  }, [statusFilter]);

  useEffect(() => {
    const q = userSearch.trim();
    if (q.length < 1) {
      setUserHits([]);
      return;
    }
    const t = setTimeout(() => {
      (async () => {
        setUserSearchLoading(true);
        try {
          const res = await usersAPI.list({ q, limit: 15 });
          setUserHits(Array.isArray(res.data?.users) ? res.data.users : []);
        } catch {
          setUserHits([]);
        } finally {
          setUserSearchLoading(false);
        }
      })();
    }, 300);
    return () => clearTimeout(t);
  }, [userSearch]);

  const fetchSuppliers = async (targetPage = 1, append = false) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    try {
      const res = await adminAPI.getSuppliers({ status: statusFilter || undefined, page: targetPage, limit: PAGE_SIZE });
      const list = res.data?.suppliers ?? res.data ?? [];
      const next = Array.isArray(list) ? list : [];
      setSuppliers((prev) => (append ? [...prev, ...next] : next));
      const pagination = res.data?.pagination;
      const pages = Number(pagination?.pages || 1);
      const currentPage = Number(pagination?.page || targetPage || 1);
      const total = Number(pagination?.total || next.length || 0);
      setTotalPages(Number.isFinite(pages) && pages > 0 ? pages : 1);
      setPage(Number.isFinite(currentPage) && currentPage > 0 ? currentPage : 1);
      setTotalSuppliers(Number.isFinite(total) && total >= 0 ? total : 0);
    } catch {
      toast.error('Failed to load suppliers');
      if (!append) setSuppliers([]);
    } finally {
      if (append) setLoadingMore(false);
      else setLoading(false);
    }
  };

  const openAddModal = () => {
    setAddOpen(true);
    setUserSearch('');
    setUserHits([]);
    setPickedUser(null);
    setAddType('individual');
    setAddStoreName('');
    setAddContactEmail('');
    setAddContactPhone('');
  };

  const submitAddSupplier = async () => {
    if (!pickedUser?._id) {
      toast.error('Choose a user account for this supplier');
      return;
    }
    setAddSubmitting(true);
    try {
      await adminAPI.createSupplier({
        userId: pickedUser._id,
        type: addType,
        storeName: addStoreName.trim() || undefined,
        contactEmail: addContactEmail.trim() || undefined,
        contactPhone: addContactPhone.trim() || undefined,
      });
      toast.success('Supplier added');
      setAddOpen(false);
      await fetchSuppliers(1);
    } catch (e: unknown) {
      const msg =
        typeof e === 'object' && e !== null && 'response' in e
          ? (e as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast.error(msg || 'Could not add supplier');
    } finally {
      setAddSubmitting(false);
    }
  };

  return (
    <ProtectedRoute allowedRoles={['admin', 'superadmin']}>
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-sky-100 text-slate-800">
        <header className="border-b border-white/60 bg-white/70 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
            <div>
              <p className="text-xs uppercase tracking-widest text-sky-600">Qwertymates</p>
              <h1 className="mt-1 text-3xl font-semibold text-slate-900">Suppliers / Sellers</h1>
              <p className="mt-1 text-sm text-slate-600">
                Verify companies and individuals. Approve or reject applications, or add a supplier for an existing account.
              </p>
              <p className="mt-2 text-xs text-slate-500">
                Showing {suppliers.length} of {totalSuppliers} suppliers (page {page} of {totalPages}, {PAGE_SIZE} per page)
              </p>
            </div>
            <Link href="/admin" className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:shadow-md">
              <ArrowLeft className="h-4 w-4" /> Back to admin
            </Link>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-6 py-8">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
            {['pending', 'approved', 'rejected', ''].map((s) => (
              <button
                key={s || 'all'}
                type="button"
                onClick={() => { setStatusFilter(s); setPage(1); }}
                className={`rounded-lg px-4 py-2 text-sm font-medium ${
                  statusFilter === s ? 'bg-sky-600 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                {s === 'pending' ? 'Pending' : s === 'approved' ? 'Approved' : s === 'rejected' ? 'Rejected' : 'All'}
              </button>
            ))}
            </div>
            <button
              type="button"
              onClick={openAddModal}
              className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-700"
            >
              <Plus className="h-4 w-4" /> Add supplier
            </button>
          </div>

          <div className="rounded-2xl border border-white/60 bg-white/80 shadow-xl shadow-sky-50 backdrop-blur overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-10 w-10 animate-spin text-sky-600" />
              </div>
            ) : suppliers.length === 0 ? (
              <div className="py-16 px-6 text-center text-slate-500">
                <p>No suppliers found.</p>
                <button
                  type="button"
                  onClick={openAddModal}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
                >
                  <Plus className="h-4 w-4" /> Add supplier
                </button>
              </div>
            ) : (
              <div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Applicant</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Type</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Contact</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Message</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Area / Town</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Location</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Status</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Applied</th>
                      <th className="text-right py-3 px-4 text-sm font-semibold text-slate-700">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {suppliers.map((sup) => {
                      const displayName = String(sup.userId?.name || 'there').trim() || 'there';
                      const msgPhone = sup.contactPhone || sup.userId?.phone;
                      const msgEmail = sup.contactEmail || sup.userId?.email;
                      const area = formatSupplierAreaTown(sup);
                      return (
                      <tr key={sup._id} className="border-b border-slate-50 hover:bg-slate-50/50">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            {sup.type === 'company' ? <Building2 className="h-4 w-4 text-slate-400" /> : <User className="h-4 w-4 text-slate-400" />}
                            <div>
                              <p className="font-medium text-slate-900">{sup.userId?.name ?? '—'}</p>
                              <p className="text-xs text-slate-500">{sup.userId?.email ?? '—'}</p>
                              {sup.storeName && <p className="text-xs text-sky-600">{sup.storeName}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-sm capitalize">{sup.type}</td>
                        <td className="py-3 px-4 text-sm">
                          {sup.contactEmail && <span>{sup.contactEmail}</span>}
                          {sup.contactPhone && <span className="block text-slate-500">{sup.contactPhone}</span>}
                          {!sup.contactEmail && !sup.contactPhone && '—'}
                        </td>
                        <td className="py-3 px-4 text-sm align-top min-w-[140px]">
                          <AdminMessageFollowupLinks
                            displayName={displayName}
                            phone={msgPhone}
                            email={msgEmail}
                            context="supplier"
                          />
                        </td>
                        <td className="py-3 px-4 text-sm text-slate-700 align-top min-w-[120px]">
                          {area.line === '—' ? (
                            <span className="text-slate-400">—</span>
                          ) : (
                            <div>
                              <p className="font-medium text-slate-800">{area.country}</p>
                              {area.town !== '—' ? (
                                <p className="text-xs text-slate-500">{area.town}</p>
                              ) : null}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-sm align-top min-w-[120px]">
                          <AdminLocationFollowupLinks
                            countryCode={sup.userId?.countryCode}
                            coordinates={sup.userId?.location?.coordinates}
                          />
                        </td>
                        <td className="py-3 px-4">
                          {sup.status === 'pending' && <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"><Clock className="h-3 w-3" /> Pending</span>}
                          {sup.status === 'approved' && <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800"><CheckCircle className="h-3 w-3" /> Approved</span>}
                          {sup.status === 'rejected' && <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800"><XCircle className="h-3 w-3" /> Rejected</span>}
                        </td>
                        <td className="py-3 px-4 text-sm text-slate-600">
                          {sup.appliedAt ? new Date(sup.appliedAt).toLocaleDateString() : '—'}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Link href={`/admin/suppliers/${sup._id}`} className="text-sky-600 hover:text-sky-700 text-sm font-medium">View</Link>
                        </td>
                      </tr>
                    );
                    })}
                  </tbody>
                  </table>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-white/70 px-4 py-3">
                  <p className="text-xs text-slate-500">Page {page} of {totalPages}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => fetchSuppliers(page - 1)}
                      disabled={page <= 1 || loading || loadingMore}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      Previous page
                    </button>
                    <button
                      type="button"
                      onClick={() => fetchSuppliers(page + 1)}
                      disabled={page >= totalPages || loading || loadingMore}
                      className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-sm font-medium text-sky-700 hover:bg-sky-100 disabled:opacity-50"
                    >
                      Next page
                    </button>
                    <button
                      type="button"
                      onClick={() => fetchSuppliers(page + 1, true)}
                      disabled={page >= totalPages || loading || loadingMore}
                      className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
                    >
                      {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Load more
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>

        {addOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
            <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/60 bg-white p-6 shadow-xl">
              <button
                type="button"
                aria-label="Close"
                className="absolute right-4 top-4 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                onClick={() => !addSubmitting && setAddOpen(false)}
              >
                <X className="h-5 w-5" />
              </button>
              <h2 className="text-lg font-semibold text-slate-900">Add supplier</h2>
              <p className="mt-1 text-sm text-slate-600">
                Pick an existing user. They will be onboarded as an approved supplier and get a supplier store if needed.
              </p>

              <div className="mt-5 space-y-4">
                <div>
                  <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">User</label>
                  {pickedUser ? (
                    <div className="mt-1 flex items-center justify-between rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm">
                      <div>
                        <p className="font-medium text-slate-900">{pickedUser.name ?? '—'}</p>
                        <p className="text-xs text-slate-600">{pickedUser.email ?? pickedUser.username ?? pickedUser._id}</p>
                      </div>
                      <button
                        type="button"
                        className="text-sky-700 text-xs font-semibold hover:underline"
                        onClick={() => setPickedUser(null)}
                      >
                        Change
                      </button>
                    </div>
                  ) : (
                    <>
                      <input
                        type="search"
                        placeholder="Search name, email, or username…"
                        value={userSearch}
                        onChange={(e) => setUserSearch(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                      />
                      <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50/80">
                        {userSearchLoading ? (
                          <div className="flex justify-center py-6">
                            <Loader2 className="h-6 w-6 animate-spin text-sky-600" />
                          </div>
                        ) : userHits.length === 0 ? (
                          <p className="py-4 text-center text-xs text-slate-500">{userSearch.trim() ? 'No matches' : 'Type to search'}</p>
                        ) : (
                          <ul className="divide-y divide-slate-100">
                            {userHits.map((u) => (
                              <li key={u._id}>
                                <button
                                  type="button"
                                  className="w-full px-3 py-2 text-left text-sm hover:bg-white"
                                  onClick={() => {
                                    setPickedUser(u);
                                    setUserSearch('');
                                    setUserHits([]);
                                  }}
                                >
                                  <span className="font-medium text-slate-900">{u.name ?? '—'}</span>
                                  <span className="block text-xs text-slate-500">{u.email ?? u.username ?? u._id}</span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">Type</label>
                  <select
                    value={addType}
                    onChange={(e) => setAddType(e.target.value as 'individual' | 'company')}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-400"
                  >
                    <option value="individual">Individual</option>
                    <option value="company">Company</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">Store name (optional)</label>
                  <input
                    type="text"
                    value={addStoreName}
                    onChange={(e) => setAddStoreName(e.target.value)}
                    placeholder="Defaults to user name or “My Store”"
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-400"
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">Contact email (optional)</label>
                    <input
                      type="email"
                      value={addContactEmail}
                      onChange={(e) => setAddContactEmail(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">Contact phone (optional)</label>
                    <input
                      type="text"
                      value={addContactPhone}
                      onChange={(e) => setAddContactPhone(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-400"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  disabled={addSubmitting}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  onClick={() => setAddOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={addSubmitting || !pickedUser}
                  className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
                  onClick={submitAddSupplier}
                >
                  {addSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Save supplier
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </ProtectedRoute>
  );
}
