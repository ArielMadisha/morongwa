'use client';

import { useState, useEffect, useRef } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { adminAPI } from '@/lib/api';
import Link from 'next/link';
import { ArrowLeft, Package, Loader2, Plus, Pencil, Trash2, ImagePlus, X } from 'lucide-react';
import toast from 'react-hot-toast';

const MAX_IMAGES = 5;
const MIN_IMAGES = 1;

function formatPrice(price: number) {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', minimumFractionDigits: 2 }).format(price);
}

interface ProductRow {
  _id: string;
  title: string;
  slug: string;
  price: number;
  stock: number;
  active: boolean;
  supplierId?: { _id: string; storeName?: string; status?: string };
  createdAt?: string;
}

interface SupplierOption {
  _id: string;
  storeName?: string;
  userId?: { name?: string };
}

export default function AdminProductsPage() {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    supplierId: '',
    title: '',
    description: '',
    price: '',
    stock: '0',
    sizes: '',
    allowResell: true,
    categories: '',
    tags: '',
  });

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const imageFilesOnly = files.filter((f) => f.type.startsWith('image/'));
    if (imageFilesOnly.length !== files.length) toast.error('Only image files (JPEG, PNG, GIF, WebP) are allowed');
    const combined = [...imageFiles, ...imageFilesOnly].slice(0, MAX_IMAGES);
    setImageFiles(combined);
    const newPreviews = combined.map((f) => URL.createObjectURL(f));
    imagePreviews.forEach((url) => URL.revokeObjectURL(url));
    setImagePreviews(newPreviews);
    e.target.value = '';
  };

  const removeImage = (index: number) => {
    const next = imageFiles.filter((_, i) => i !== index);
    setImageFiles(next);
    imagePreviews.forEach((url) => URL.revokeObjectURL(url));
    setImagePreviews(next.map((f) => URL.createObjectURL(f)));
  };

  useEffect(() => {
    fetchProducts();
    fetchSuppliers();
  }, []);

  const fetchProducts = async () => {
    try {
      const res = await adminAPI.getProducts({ limit: 100 });
      const list = res.data?.products ?? res.data ?? [];
      setProducts(Array.isArray(list) ? list : []);
    } catch {
      toast.error('Failed to load products');
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchSuppliers = async () => {
    try {
      const res = await adminAPI.getSuppliers({ status: 'approved', limit: 200 });
      const list = res.data?.suppliers ?? res.data ?? [];
      setSuppliers(Array.isArray(list) ? list : []);
    } catch {
      setSuppliers([]);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.supplierId || !form.title.trim() || form.price === '' || Number(form.price) < 0) {
      toast.error('Supplier, title and price are required');
      return;
    }
    if (imageFiles.length < MIN_IMAGES) {
      toast.error(`At least ${MIN_IMAGES} product image is required (up to ${MAX_IMAGES})`);
      return;
    }
    setSubmitting(true);
    try {
      const uploadRes = await adminAPI.uploadProductImages(imageFiles);
      const urls = uploadRes.data?.urls ?? [];
      if (urls.length < MIN_IMAGES) {
        toast.error('Image upload failed. Please try again.');
        setSubmitting(false);
        return;
      }
      await adminAPI.createProduct({
        supplierId: form.supplierId,
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        images: urls,
        price: Number(form.price),
        stock: Number(form.stock) || 0,
        sizes: form.sizes ? form.sizes.split(',').map((s) => s.trim()).filter(Boolean) : [],
        allowResell: form.allowResell,
        categories: form.categories ? form.categories.split(',').map((s) => s.trim()).filter(Boolean) : [],
        tags: form.tags ? form.tags.split(',').map((s) => s.trim()).filter(Boolean) : [],
      });
      toast.success('Product created');
      setShowForm(false);
      imagePreviews.forEach((url) => URL.revokeObjectURL(url));
      setImageFiles([]);
      setImagePreviews([]);
      setForm({ supplierId: form.supplierId, title: '', description: '', price: '', stock: '0', sizes: '', allowResell: true, categories: '', tags: '' });
      fetchProducts();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to create product');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this product?')) return;
    try {
      await adminAPI.deleteProduct(id);
      toast.success('Product deleted');
      fetchProducts();
    } catch {
      toast.error('Failed to delete product');
    }
  };

  return (
    <ProtectedRoute allowedRoles={['admin', 'superadmin']}>
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-sky-100 text-slate-800">
        <header className="border-b border-white/60 bg-white/70 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
            <div>
              <p className="text-xs uppercase tracking-widest text-sky-600">Morongwa</p>
              <h1 className="mt-1 text-3xl font-semibold text-slate-900">Marketplace products</h1>
              <p className="mt-1 text-sm text-slate-600">Load and manage products for sale. Assign to an approved supplier.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowForm(!showForm)}
                className="inline-flex items-center gap-2 rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-700"
              >
                <Plus className="h-4 w-4" /> Load product
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
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Create product</h2>
              <form onSubmit={handleCreate} className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Supplier *</label>
                  <select
                    required
                    value={form.supplierId}
                    onChange={(e) => setForm((f) => ({ ...f, supplierId: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                  >
                    <option value="">Select approved supplier</option>
                    {suppliers.map((s) => (
                      <option key={s._id} value={s._id}>{s.storeName || (s.userId as any)?.name || s._id}</option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Product pictures * (1–5 images)</label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    multiple
                    onChange={handleImageChange}
                    className="hidden"
                  />
                  <div className="flex flex-wrap gap-3 items-start">
                    {imagePreviews.map((url, i) => (
                      <div key={i} className="relative group">
                        <img src={url} alt={`Preview ${i + 1}`} className="h-24 w-24 object-cover rounded-lg border border-slate-200" />
                        <button
                          type="button"
                          onClick={() => removeImage(i)}
                          className="absolute -top-1 -right-1 rounded-full bg-red-500 text-white p-0.5 hover:bg-red-600"
                          aria-label="Remove image"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                    {imageFiles.length < MAX_IMAGES && (
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="h-24 w-24 rounded-lg border-2 border-dashed border-slate-300 flex items-center justify-center text-slate-500 hover:border-sky-400 hover:text-sky-600"
                      >
                        <ImagePlus className="h-8 w-8" />
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">At least one image required, max 5. JPEG, PNG, GIF or WebP.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Title *</label>
                  <input
                    type="text"
                    required
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                    placeholder="Product name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Price (ZAR) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={form.price}
                    onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                    placeholder="0.00"
                  />
                  <p className="text-xs text-slate-500 mt-1">7.5% commission to Morongwa (paid after sale).</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Stock</label>
                  <input
                    type="number"
                    min="0"
                    value={form.stock}
                    onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Sizes (comma-separated)</label>
                  <input
                    type="text"
                    value={form.sizes}
                    onChange={(e) => setForm((f) => ({ ...f, sizes: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                    placeholder="S, M, L, XL"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Categories (comma-separated)</label>
                  <input
                    type="text"
                    value={form.categories}
                    onChange={(e) => setForm((f) => ({ ...f, categories: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                    placeholder="Food, Local"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    rows={2}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                    placeholder="Optional description"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={form.allowResell} onChange={(e) => setForm((f) => ({ ...f, allowResell: e.target.checked }))} className="rounded border-slate-300 text-sky-600" />
                    <span className="text-sm text-slate-700">Allow resell</span>
                  </label>
                  <p className="text-xs text-slate-500 mt-1">Resellers set their own commission (3–7%) when adding to their store.</p>
                </div>
                <div className="sm:col-span-2 flex gap-2">
                  <button type="submit" disabled={submitting} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50">
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin inline" /> : null} Create product
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      imagePreviews.forEach((url) => URL.revokeObjectURL(url));
                      setImageFiles([]);
                      setImagePreviews([]);
                      setShowForm(false);
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
            ) : products.length === 0 ? (
              <div className="py-16 text-center text-slate-500 flex flex-col items-center gap-2">
                <Package className="h-12 w-12 text-slate-300" />
                No products yet. Load a product to sell on the marketplace.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Product</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Supplier</th>
                      <th className="text-right py-3 px-4 text-sm font-semibold text-slate-700">Price</th>
                      <th className="text-right py-3 px-4 text-sm font-semibold text-slate-700">Stock</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Status</th>
                      <th className="text-right py-3 px-4 text-sm font-semibold text-slate-700">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((p) => (
                      <tr key={p._id} className="border-b border-slate-50 hover:bg-slate-50/50">
                        <td className="py-3 px-4">
                          <p className="font-medium text-slate-900">{p.title}</p>
                          <p className="text-xs text-slate-500">{p.slug}</p>
                        </td>
                        <td className="py-3 px-4 text-sm">{(p.supplierId as any)?.storeName ?? '—'}</td>
                        <td className="py-3 px-4 text-right font-medium text-slate-900">{formatPrice(p.price)}</td>
                        <td className="py-3 px-4 text-right text-sm">{p.stock}</td>
                        <td className="py-3 px-4 text-sm">{p.active ? 'Active' : 'Inactive'}</td>
                        <td className="py-3 px-4 text-right">
                          <Link href={`/marketplace/product/${p._id}`} className="text-sky-600 hover:underline text-sm mr-2">View</Link>
                          <button type="button" onClick={() => handleDelete(p._id)} className="text-red-600 hover:underline text-sm">Delete</button>
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
