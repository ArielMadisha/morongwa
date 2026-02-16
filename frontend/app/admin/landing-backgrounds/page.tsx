'use client';

import { useState, useEffect, useRef } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { adminAPI, getImageUrl } from '@/lib/api';
import Link from 'next/link';
import { ArrowLeft, Image, Loader2, Plus, Pencil, Trash2, Upload } from 'lucide-react';
import toast from 'react-hot-toast';

interface LandingBackground {
  _id: string;
  imageUrl: string;
  order: number;
  active: boolean;
  createdAt?: string;
}

function LandingBackgroundsManagement() {
  const [items, setItems] = useState<LandingBackground[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<LandingBackground | null>(null);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({ imageUrl: '', order: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchItems();
  }, []);

  const fetchItems = async () => {
    try {
      const res = await adminAPI.getLandingBackgrounds();
      const data = res.data?.data ?? res.data ?? [];
      setItems(Array.isArray(data) ? data : []);
    } catch {
      toast.error('Failed to load backgrounds');
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ imageUrl: '', order: 0 });
    setModalOpen(true);
  };

  const openEdit = (b: LandingBackground) => {
    setEditing(b);
    setForm({ imageUrl: b.imageUrl, order: b.order ?? 0 });
    setModalOpen(true);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    setUploading(true);
    try {
      const res = await adminAPI.uploadLandingBackground(file);
      const url = res.data?.url ?? (res.data as any)?.url;
      if (url) setForm((f) => ({ ...f, imageUrl: url }));
      else toast.error('Upload failed');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.imageUrl.trim()) {
      toast.error('Image is required');
      return;
    }
    try {
      if (editing) {
        await adminAPI.updateLandingBackground(editing._id, form);
        toast.success('Background updated');
      } else {
        await adminAPI.createLandingBackground(form);
        toast.success('Background added');
      }
      setModalOpen(false);
      fetchItems();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to save');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this background?')) return;
    try {
      await adminAPI.deleteLandingBackground(id);
      toast.success('Background deleted');
      fetchItems();
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
            <h1 className="mt-1 text-3xl font-semibold text-slate-900">Landing backgrounds</h1>
            <p className="mt-1 text-sm text-slate-600">Upload background images for login and register pages.</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={openCreate}
              className="inline-flex items-center gap-2 rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700"
            >
              <Plus className="h-4 w-4" />
              Add background
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
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-slate-100 bg-white/80 p-12 text-center">
            <Image className="mx-auto h-12 w-12 text-slate-300" />
            <p className="mt-4 text-lg font-semibold text-slate-900">No backgrounds yet</p>
            <p className="text-sm text-slate-600 mt-1">Add backgrounds to customize the login and register page.</p>
            <button onClick={openCreate} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-white font-medium hover:bg-sky-700">
              <Plus className="h-4 w-4" />
              Add background
            </button>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {items.map((b) => (
              <div key={b._id} className="rounded-2xl border border-slate-100 bg-white/90 overflow-hidden shadow-sm">
                <div className="aspect-[16/10] bg-slate-100 relative">
                  <img src={getImageUrl(b.imageUrl)} alt="Background" className="w-full h-full object-cover" />
                </div>
                <div className="p-4 flex items-center justify-between">
                  <span className="text-sm text-slate-600">Order: {b.order}</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => openEdit(b)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <Pencil className="h-4 w-4" />
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(b._id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </button>
                  </div>
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
              {editing ? 'Edit background' : 'Add background'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Image</label>
                <div className="flex gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    {uploading ? 'Uploading...' : 'Upload image'}
                  </button>
                  <input
                    type="url"
                    value={form.imageUrl}
                    onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
                    className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    placeholder="Or paste image URL"
                  />
                </div>
                {form.imageUrl && (
                  <div className="mt-2 aspect-video rounded-lg overflow-hidden bg-slate-100">
                    <img src={getImageUrl(form.imageUrl)} alt="Preview" className="w-full h-full object-cover" />
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Order (display sequence)</label>
                <input
                  type="number"
                  value={form.order}
                  onChange={(e) => setForm((f) => ({ ...f, order: parseInt(e.target.value, 10) || 0 }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2"
                  min={0}
                />
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
                  disabled={!form.imageUrl.trim()}
                  className="flex-1 rounded-lg bg-sky-600 px-4 py-2 font-medium text-white hover:bg-sky-700 disabled:opacity-50"
                >
                  {editing ? 'Update' : 'Add'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProtectedLandingBackgrounds() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'superadmin']}>
      <LandingBackgroundsManagement />
    </ProtectedRoute>
  );
}
