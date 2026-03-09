'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Save } from 'lucide-react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { adminAPI } from '@/lib/api';
import toast from 'react-hot-toast';

type ProductForm = {
  title: string;
  description: string;
  price: string;
  discountPrice: string;
  stock: string;
  outOfStock: boolean;
  active: boolean;
  allowResell: boolean;
  sizes: string;
  categories: string;
  tags: string;
};

export default function AdminEditProductPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = useMemo(() => String(params?.id || ''), [params]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<ProductForm>({
    title: '',
    description: '',
    price: '',
    discountPrice: '',
    stock: '0',
    outOfStock: false,
    active: true,
    allowResell: true,
    sizes: '',
    categories: '',
    tags: '',
  });

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    adminAPI
      .getProduct(id)
      .then((res) => {
        const p = res.data?.data ?? res.data;
        if (!p?._id) {
          toast.error('Product not found');
          router.push('/admin/products');
          return;
        }
        setForm({
          title: p.title || '',
          description: p.description || '',
          price: String(p.price ?? ''),
          discountPrice: p.discountPrice != null ? String(p.discountPrice) : '',
          stock: String(p.stock ?? 0),
          outOfStock: !!p.outOfStock,
          active: p.active !== false,
          allowResell: p.allowResell !== false,
          sizes: Array.isArray(p.sizes) ? p.sizes.join(', ') : '',
          categories: Array.isArray(p.categories) ? p.categories.join(', ') : '',
          tags: Array.isArray(p.tags) ? p.tags.join(', ') : '',
        });
      })
      .catch(() => {
        toast.error('Failed to load product');
        router.push('/admin/products');
      })
      .finally(() => setLoading(false));
  }, [id, router]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    if (!form.title.trim()) {
      toast.error('Title is required');
      return;
    }
    const price = Number(form.price);
    if (!Number.isFinite(price) || price < 0) {
      toast.error('Price must be a valid number');
      return;
    }
    const discountPrice =
      form.discountPrice.trim() === '' ? null : Number(form.discountPrice);
    if (discountPrice != null && (Number.isNaN(discountPrice) || discountPrice < 0 || discountPrice >= price)) {
      toast.error('Discount must be lower than price');
      return;
    }

    setSaving(true);
    try {
      await adminAPI.updateProduct(id, {
        title: form.title.trim(),
        description: form.description.trim(),
        price,
        discountPrice,
        stock: Math.max(0, Number(form.stock) || 0),
        outOfStock: form.outOfStock,
        active: form.active,
        allowResell: form.allowResell,
        sizes: form.sizes.split(',').map((s) => s.trim()).filter(Boolean),
        categories: form.categories.split(',').map((s) => s.trim()).filter(Boolean),
        tags: form.tags.split(',').map((s) => s.trim()).filter(Boolean),
      });
      toast.success('Product updated');
      router.push('/admin/products');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to update product');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ProtectedRoute allowedRoles={['admin', 'superadmin']}>
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-sky-100 text-slate-800">
        <main className="mx-auto max-w-3xl px-6 py-8">
          <div className="mb-6 flex items-center justify-between">
            <h1 className="text-2xl font-semibold text-slate-900">Edit product</h1>
            <Link href="/admin/products" className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:shadow-md">
              <ArrowLeft className="h-4 w-4" /> Back to products
            </Link>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
            </div>
          ) : (
            <form onSubmit={onSubmit} className="rounded-2xl border border-white/60 bg-white/80 p-6 shadow-xl shadow-sky-50 backdrop-blur grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Title *</label>
                <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Price (ZAR) *</label>
                <input type="number" step="0.01" min="0" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Discount (ZAR)</label>
                <input type="number" step="0.01" min="0" value={form.discountPrice} onChange={(e) => setForm((f) => ({ ...f, discountPrice: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Stock</label>
                <input type="number" min="0" value={form.stock} onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <textarea rows={3} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Sizes (comma-separated)</label>
                <input value={form.sizes} onChange={(e) => setForm((f) => ({ ...f, sizes: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Categories (comma-separated)</label>
                <input value={form.categories} onChange={(e) => setForm((f) => ({ ...f, categories: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Tags (comma-separated)</label>
                <input value={form.tags} onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2" />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} />
                Active
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={form.outOfStock} onChange={(e) => setForm((f) => ({ ...f, outOfStock: e.target.checked }))} />
                Out of stock
              </label>
              <label className="sm:col-span-2 flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={form.allowResell} onChange={(e) => setForm((f) => ({ ...f, allowResell: e.target.checked }))} />
                Allow resell
              </label>
              <button type="submit" disabled={saving} className="sm:col-span-2 inline-flex items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save changes
              </button>
            </form>
          )}
        </main>
      </div>
    </ProtectedRoute>
  );
}
