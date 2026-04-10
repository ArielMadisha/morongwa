'use client';

import { useState, useEffect, useRef } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { adminAPI } from '@/lib/api';
import { formatCurrencyAmount } from '@/lib/formatCurrency';
import Link from 'next/link';
import { ArrowLeft, Package, Loader2, Plus, Trash2, ImagePlus, X, Layers } from 'lucide-react';
import toast from 'react-hot-toast';

const MAX_IMAGES = 5;
const MIN_IMAGES = 1;

function formatPrice(price: number) {
  return formatCurrencyAmount(price, 'ZAR');
}

interface ProductRow {
  _id: string;
  title: string;
  slug: string;
  price: number;
  stock: number;
  active: boolean;
  supplierId?: { _id: string; storeName?: string; status?: string };
  supplierSource?: string;
  externalProductId?: string;
  createdAt?: string;
}

interface SupplierOption {
  _id: string;
  storeName?: string;
  userId?: { name?: string };
}

export default function AdminProductsPage() {
  const PAGE_SIZE = 100;
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalProducts, setTotalProducts] = useState(0);
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
    discountPrice: '',
    stock: '0',
    outOfStock: false,
    sizes: '',
    allowResell: true,
    categories: '',
    tags: '',
  });
  const [bulkTiers, setBulkTiers] = useState<Array<{ minQty: string; maxQty: string; price: string }>>([]);

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
    fetchProducts(1);
    fetchSuppliers();
  }, []);

  const fetchProducts = async (targetPage = 1, append = false) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    try {
      const res = await adminAPI.getProducts({ page: targetPage, limit: PAGE_SIZE });
      const list = res.data?.products ?? res.data ?? [];
      const next = Array.isArray(list) ? list : [];
      setProducts((prev) => (append ? [...prev, ...next] : next));
      const pagination = res.data?.pagination;
      const pages = Number(pagination?.pages || 1);
      const currentPage = Number(pagination?.page || targetPage || 1);
      const total = Number(pagination?.total || next.length || 0);
      setTotalPages(Number.isFinite(pages) && pages > 0 ? pages : 1);
      setPage(Number.isFinite(currentPage) && currentPage > 0 ? currentPage : 1);
      setTotalProducts(Number.isFinite(total) && total >= 0 ? total : 0);
    } catch {
      toast.error('Failed to load products');
      if (!append) setProducts([]);
    } finally {
      if (append) setLoadingMore(false);
      else setLoading(false);
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
      const discountPrice = form.discountPrice.trim() ? Number(form.discountPrice) : undefined;
      const bulkTiersData = bulkTiers
        .filter((t) => t.minQty.trim() && t.maxQty.trim() && t.price.trim())
        .map((t) => ({
          minQty: Number(t.minQty),
          maxQty: Number(t.maxQty),
          price: Number(t.price),
        }))
        .filter((t) => t.minQty >= 0 && t.maxQty >= t.minQty && t.price >= 0);
      await adminAPI.createProduct({
        supplierId: form.supplierId,
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        images: urls,
        price: Number(form.price),
        ...(discountPrice != null && discountPrice >= 0 && discountPrice < Number(form.price) && { discountPrice }),
        ...(bulkTiersData.length > 0 && { bulkTiers: bulkTiersData }),
        stock: Number(form.stock) || 0,
        outOfStock: form.outOfStock,
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
      setForm({ supplierId: form.supplierId, title: '', description: '', price: '', discountPrice: '', stock: '0', outOfStock: false, sizes: '', allowResell: true, categories: '', tags: '' });
      setBulkTiers([]);
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
      const targetPage = products.length === 1 && page > 1 ? page - 1 : page;
      fetchProducts(targetPage);
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
              <p className="mt-2 text-xs text-slate-500">
                Showing {products.length} of {totalProducts} products (page {page} of {totalPages}, {PAGE_SIZE} per page)
              </p>
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
                  <p className="text-xs text-slate-500 mt-1">7.5% commission to Qwertymates (paid after sale).</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Discount price (ZAR)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.discountPrice}
                    onChange={(e) => setForm((f) => ({ ...f, discountPrice: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                    placeholder="Optional — e.g. 799 for sale"
                  />
                  <p className="text-xs text-slate-500 mt-1">Cheaper price for discounted orders. Must be less than regular price.</p>
                </div>
                <div className="sm:col-span-2">
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-slate-700">Bulk sale tiers</label>
                    <button
                      type="button"
                      onClick={() => setBulkTiers((t) => [...t, { minQty: '', maxQty: '', price: '' }])}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-sky-300 bg-sky-50 px-3 py-1.5 text-sm font-medium text-sky-700 hover:bg-sky-100"
                    >
                      <Layers className="h-4 w-4" /> Add bulk sale tier
                    </button>
                  </div>
                  <p className="text-xs text-slate-500 mb-2">Quantity-based pricing. E.g. 1–100 at R50, 101–1000 at R45.</p>
                  {bulkTiers.length > 0 && (
                    <div className="space-y-2">
                      {bulkTiers.map((tier, i) => (
                        <div key={i} className="flex flex-wrap gap-2 items-center rounded-lg border border-slate-200 bg-slate-50/50 p-3">
                          <span className="text-sm font-medium text-slate-600">Quantity</span>
                          <input
                            type="number"
                            min="0"
                            max="999999"
                            value={tier.minQty}
                            onChange={(e) => setBulkTiers((t) => t.map((x, j) => (j === i ? { ...x, minQty: e.target.value } : x)))}
                            placeholder="Min"
                            className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                          />
                          <span className="text-slate-500">–</span>
                          <input
                            type="number"
                            min="0"
                            max="999999"
                            value={tier.maxQty}
                            onChange={(e) => setBulkTiers((t) => t.map((x, j) => (j === i ? { ...x, maxQty: e.target.value } : x)))}
                            placeholder="Max"
                            className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                          />
                          <span className="text-sm font-medium text-slate-600">Price (ZAR)</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={tier.price}
                            onChange={(e) => setBulkTiers((t) => t.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))}
                            placeholder="Per unit"
                            className="w-24 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                          />
                          <button
                            type="button"
                            onClick={() => setBulkTiers((t) => t.filter((_, j) => j !== i))}
                            className="p-1.5 rounded-lg text-red-600 hover:bg-red-50"
                            aria-label="Remove tier"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
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
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={form.outOfStock} onChange={(e) => setForm((f) => ({ ...f, outOfStock: e.target.checked }))} className="rounded border-slate-300 text-sky-600" />
                    <span className="text-sm text-slate-700">Mark as out of stock</span>
                  </label>
                  <p className="text-xs text-slate-500 mt-1">When checked, customers cannot add this product to cart.</p>
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
                      setBulkTiers([]);
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
              <div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50 border-b border-slate-100">
                      <tr>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Product</th>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Supplier</th>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">CJ / External ID</th>
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
                          <td className="py-3 px-4 text-sm">{(p.supplierId as any)?.storeName ?? ((p as any).supplierSource === 'cj' ? 'CJ Dropshipping' : (p as any).supplierSource ?? '—')}</td>
                          <td className="py-3 px-4 text-sm">
                            {(p as any).externalProductId ? (
                              <code
                                className="text-xs font-mono text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded cursor-copy"
                                title="CJ Product ID – copy to trace in CJ Dropshipping"
                                onClick={() => {
                                  navigator.clipboard.writeText((p as any).externalProductId);
                                  toast.success('CJ Product ID copied');
                                }}
                              >
                                {(p as any).externalProductId}
                              </code>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right font-medium text-slate-900">
                            {(p as any).discountPrice != null && (p as any).discountPrice < p.price ? (
                              <span><span className="text-sky-600">{formatPrice((p as any).discountPrice)}</span> <span className="text-slate-400 line-through text-sm">{formatPrice(p.price)}</span></span>
                            ) : (
                              formatPrice(p.price)
                            )}
                          </td>
                          <td className="py-3 px-4 text-right text-sm">{p.stock}</td>
                          <td className="py-3 px-4 text-sm">{p.active ? 'Active' : 'Inactive'}</td>
                          <td className="py-3 px-4 text-right">
                            <Link href={`/marketplace/product/${p._id}`} className="text-sky-600 hover:underline text-sm mr-2">View</Link>
                            <Link href={`/admin/products/${p._id}/edit`} className="text-emerald-600 hover:underline text-sm mr-2">Edit</Link>
                            <button type="button" onClick={() => handleDelete(p._id)} className="text-red-600 hover:underline text-sm">Delete</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-white/70 px-4 py-3">
                  <p className="text-xs text-slate-500">
                    Page {page} of {totalPages}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => fetchProducts(page - 1)}
                      disabled={page <= 1 || loading || loadingMore}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      Previous page
                    </button>
                    <button
                      type="button"
                      onClick={() => fetchProducts(page + 1)}
                      disabled={page >= totalPages || loading || loadingMore}
                      className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-sm font-medium text-sky-700 hover:bg-sky-100 disabled:opacity-50"
                    >
                      Next page
                    </button>
                    <button
                      type="button"
                      onClick={() => fetchProducts(page + 1, true)}
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
      </div>
    </ProtectedRoute>
  );
}
