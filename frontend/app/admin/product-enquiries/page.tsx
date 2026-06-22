'use client';

import { useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { adminAPI, getImageUrlFull } from '@/lib/api';
import Link from 'next/link';
import { ArrowLeft, Loader2, PackageSearch, Search } from 'lucide-react';
import toast from 'react-hot-toast';

type PopulatedUser = { _id?: string; name?: string; email?: string; username?: string };

type ProductLite = { _id?: string; title?: string; images?: string[]; slug?: string };

type EnquiryRow = {
  _id: string;
  lastMessageAt?: string;
  createdAt?: string;
  productId?: ProductLite | string;
  buyerId?: PopulatedUser | string;
  sellerId?: PopulatedUser | string;
};

function asUser(u: EnquiryRow['buyerId']): PopulatedUser | null {
  if (u && typeof u === 'object') return u as PopulatedUser;
  return null;
}

function asProduct(p: EnquiryRow['productId']): ProductLite | null {
  if (p && typeof p === 'object') return p as ProductLite;
  return null;
}

function userLine(u: PopulatedUser | null): string {
  if (!u) return '—';
  const bits = [u.name, u.username ? `@${u.username}` : null].filter(Boolean);
  return bits.length ? bits.join(' · ') : String(u._id || '');
}

export default function AdminProductEnquiriesPage() {
  const [rows, setRows] = useState<EnquiryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [qInput, setQInput] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 20, pages: 1 });

  useEffect(() => {
    void load();
  }, [page, q]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await adminAPI.getProductEnquiriesAdmin({
        page,
        limit: 20,
        q: q.trim() || undefined,
      });
      const data = res.data;
      setRows(Array.isArray(data?.data) ? (data.data as EnquiryRow[]) : []);
      setPagination(data.pagination ?? { total: 0, page, limit: 20, pages: 1 });
    } catch {
      toast.error('Failed to load product enquiries');
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setQ(qInput.trim());
  };

  return (
    <ProtectedRoute allowedRoles={['admin', 'superadmin']}>
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-sky-100 text-slate-800">
        <header className="border-b border-white/60 bg-white/70 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-6 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-widest text-sky-600">Qwertymates</p>
              <h1 className="mt-1 flex items-center gap-2 text-3xl font-semibold text-slate-900">
                <PackageSearch className="h-8 w-8 text-emerald-600" aria-hidden />
                Product enquiries
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                Marketplace buyer–seller enquiry threads. Filter matches product title.
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
          <form onSubmit={onSearch} className="mb-6 flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px]">
              <label htmlFor="pe-q" className="block text-xs font-medium text-slate-600">
                Product title contains
              </label>
              <div className="relative mt-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="pe-q"
                  value={qInput}
                  onChange={(e) => setQInput(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-10 pr-3 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
                  placeholder="e.g. shoe, phone…"
                  maxLength={200}
                />
              </div>
            </div>
            <button
              type="submit"
              className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-sky-700"
            >
              Apply
            </button>
          </form>

          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-10 w-10 animate-spin text-sky-600" />
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white/80 p-12 text-center text-slate-600">
              No enquiries match this filter.
            </div>
          ) : (
            <div className="space-y-4">
              {rows.map((row) => {
                const product = asProduct(row.productId);
                const buyer = asUser(row.buyerId);
                const seller = asUser(row.sellerId);
                const img = product?.images?.[0];
                const pid = product?._id;
                const adminEditHref = pid ? `/admin/products/${pid}/edit` : '/admin/products';
                return (
                  <article
                    key={row._id}
                    className="flex flex-col gap-4 rounded-xl border border-slate-100 bg-white/90 p-4 shadow-sm md:flex-row"
                  >
                    <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                      {img ? (
                        <img
                          src={getImageUrlFull(img)}
                          alt=""
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">
                          No image
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-slate-500">
                        Last message:{' '}
                        {row.lastMessageAt
                          ? new Date(row.lastMessageAt).toLocaleString()
                          : row.createdAt
                            ? new Date(row.createdAt).toLocaleString()
                            : '—'}
                      </p>
                      <h2 className="mt-1 text-lg font-semibold text-slate-900">
                        {product?.title || 'Product'}
                      </h2>
                      <p className="mt-2 text-sm text-slate-600">
                        <span className="font-medium text-slate-800">Buyer:</span> {userLine(buyer)}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        <span className="font-medium text-slate-800">Seller:</span> {userLine(seller)}
                      </p>
                      <p className="mt-2 text-xs text-slate-400">Enquiry id: {row._id}</p>
                      <div className="mt-3">
                        <Link
                          href={adminEditHref}
                          className="text-sm font-semibold text-sky-700 hover:underline"
                        >
                          Edit product in admin
                        </Link>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {!loading && pagination.pages > 1 && (
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-sm text-slate-600">
                Page {pagination.page} of {pagination.pages} ({pagination.total} total)
              </span>
              <button
                type="button"
                disabled={page >= pagination.pages}
                onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </main>
      </div>
    </ProtectedRoute>
  );
}
