'use client';

import { useState, useEffect } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { adminAPI } from '@/lib/api';
import Link from 'next/link';
import {
  ArrowLeft,
  Megaphone,
  Loader2,
  Plus,
  Pencil,
  Trash2,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface Advert {
  _id: string;
  title: string;
  imageUrl: string;
  linkUrl?: string;
  slot: 'random' | 'promo';
  productId?: string;
  active: boolean;
  order?: number;
  createdAt?: string;
}

function AdvertsManagement() {
  const [adverts, setAdverts] = useState<Advert[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Advert | null>(null);
  const [form, setForm] = useState({
    title: '',
    imageUrl: '',
    linkUrl: '',
    slot: 'promo' as 'random' | 'promo',
    active: true,
    order: 0,
  });

  useEffect(() => {
    fetchAdverts();
  }, []);

  const fetchAdverts = async () => {
    try {
      const res = await adminAPI.getAdverts();
      const data = res.data?.data ?? res.data ?? [];
      setAdverts(Array.isArray(data) ? data : []);
    } catch {
      toast.error('Failed to load adverts');
      setAdverts([]);
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ title: '', imageUrl: '', linkUrl: '', slot: 'promo', active: true, order: 0 });
    setModalOpen(true);
  };

  const openEdit = (a: Advert) => {
    setEditing(a);
    setForm({
      title: a.title,
      imageUrl: a.imageUrl,
      linkUrl: a.linkUrl || '',
      slot: a.slot,
      active: a.active,
      order: a.order ?? 0,
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.imageUrl.trim()) {
      toast.error('Title and image URL are required');
      return;
    }
    try {
      if (editing) {
        await adminAPI.updateAdvert(editing._id, form);
        toast.success('Advert updated');
      } else {
        await adminAPI.createAdvert(form);
        toast.success('Advert created');
      }
      setModalOpen(false);
      fetchAdverts();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to save advert');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this advert?')) return;
    try {
      await adminAPI.deleteAdvert(id);
      toast.success('Advert deleted');
      fetchAdverts();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to delete');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-sky-100 text-slate-800">
      <header className="border-b border-white/60 bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-sky-600">Morongwa</p>
            <h1 className="mt-1 text-3xl font-semibold text-slate-900">Adverts</h1>
            <p className="mt-1 text-sm text-slate-600">Manage platform adverts. Random = top square. Promo = bottom slot.</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={openCreate}
              className="inline-flex items-center gap-2 rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700"
            >
              <Plus className="h-4 w-4" />
              New advert
            </button>
            <Link
              href="/admin"
              className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:-translate-y-0.5"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
          </div>
        ) : adverts.length === 0 ? (
          <div className="rounded-2xl border border-slate-100 bg-white/80 p-12 text-center">
            <Megaphone className="mx-auto h-12 w-12 text-slate-300" />
            <p className="mt-4 text-lg font-semibold text-slate-900">No adverts yet</p>
            <p className="text-sm text-slate-600 mt-1">Create your first advert to display on the platform.</p>
            <button onClick={openCreate} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-white font-medium hover:bg-sky-700">
              <Plus className="h-4 w-4" />
              Create advert
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {adverts.map((a) => (
              <div
                key={a._id}
                className="flex flex-col sm:flex-row sm:items-center gap-4 rounded-2xl border border-slate-100 bg-white/90 p-4 shadow-sm"
              >
                <div className="h-20 w-20 shrink-0 rounded-xl overflow-hidden bg-slate-100">
                  <img src={a.imageUrl} alt={a.title} className="h-full w-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-slate-900 truncate">{a.title}</h3>
                  <p className="text-sm text-slate-600">
                    Slot: <span className="font-medium">{a.slot}</span>
                    {a.linkUrl && ` · ${a.linkUrl}`}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    {a.active ? (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                        <CheckCircle className="h-3 w-3" /> Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                        <XCircle className="h-3 w-3" /> Inactive
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => openEdit(a)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <Pencil className="h-4 w-4" />
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(a._id)}
                    className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-xl p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">
              {editing ? 'Edit advert' : 'Create advert'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Title</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2"
                  placeholder="Advert title"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Image URL</label>
                <input
                  type="url"
                  value={form.imageUrl}
                  onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2"
                  placeholder="https://..."
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Link URL (optional)</label>
                <input
                  type="text"
                  value={form.linkUrl}
                  onChange={(e) => setForm((f) => ({ ...f, linkUrl: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2"
                  placeholder="/marketplace or https://..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Slot</label>
                <select
                  value={form.slot}
                  onChange={(e) => setForm((f) => ({ ...f, slot: e.target.value as 'random' | 'promo' }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2"
                >
                  <option value="random">Random (top square)</option>
                  <option value="promo">Promo (bottom, e.g. new product)</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="active"
                  checked={form.active}
                  onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                  className="rounded"
                />
                <label htmlFor="active" className="text-sm text-slate-700">Active</label>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="flex-1 rounded-lg border border-slate-200 px-4 py-2 font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-lg bg-sky-600 px-4 py-2 font-medium text-white hover:bg-sky-700"
                >
                  {editing ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProtectedAdvertsManagement() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'superadmin']}>
      <AdvertsManagement />
    </ProtectedRoute>
  );
}
