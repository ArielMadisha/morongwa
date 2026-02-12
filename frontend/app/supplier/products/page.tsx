'use client';

import { useState, useRef } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { productsAPI } from '@/lib/api';
import Link from 'next/link';
import { ArrowLeft, Loader2, Package, ImagePlus, X } from 'lucide-react';
import toast from 'react-hot-toast';
import SiteHeader from '@/components/SiteHeader';

const MAX_IMAGES = 5;
const MIN_IMAGES = 1;

export default function SupplierProductsPage() {
  const [submitting, setSubmitting] = useState(false);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || form.price === '' || Number(form.price) < 0) {
      toast.error('Title and price are required');
      return;
    }
    if (imageFiles.length < MIN_IMAGES) {
      toast.error(`At least ${MIN_IMAGES} product image is required (up to ${MAX_IMAGES})`);
      return;
    }
    setSubmitting(true);
    try {
      const uploadRes = await productsAPI.uploadImages(imageFiles);
      const urls = uploadRes.data?.urls ?? [];
      if (urls.length < MIN_IMAGES) {
        toast.error('Image upload failed. Please try again.');
        setSubmitting(false);
        return;
      }
      const discountPrice = form.discountPrice.trim() ? Number(form.discountPrice) : undefined;
      await productsAPI.create({
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        images: urls,
        price: Number(form.price),
        ...(discountPrice != null && discountPrice >= 0 && discountPrice < Number(form.price) && { discountPrice }),
        stock: Number(form.stock) || 0,
        outOfStock: form.outOfStock,
        sizes: form.sizes ? form.sizes.split(',').map((s) => s.trim()).filter(Boolean) : [],
        allowResell: form.allowResell,
        categories: form.categories ? form.categories.split(',').map((s) => s.trim()).filter(Boolean) : [],
        tags: form.tags ? form.tags.split(',').map((s) => s.trim()).filter(Boolean) : [],
      });
      toast.success('Product created and listed on the marketplace');
      imagePreviews.forEach((url) => URL.revokeObjectURL(url));
      setImageFiles([]);
      setImagePreviews([]);
      setForm({ title: '', description: '', price: '', discountPrice: '', stock: '0', outOfStock: false, sizes: '', allowResell: true, categories: '', tags: '' });
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Failed to create product';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-sky-100 text-slate-800">
        <SiteHeader />
        <main className="max-w-xl mx-auto px-4 sm:px-6 py-12">
          <nav className="flex items-center gap-2 text-sm text-slate-600 mb-6">
            <Link href="/marketplace" className="text-sky-600 hover:underline">Marketplace</Link>
            <span>/</span>
            <span className="text-slate-800 font-medium">Add product</span>
            <span className="ml-auto">
              <Link href="/supplier/settings" className="text-sky-600 hover:underline">Supplier settings</Link>
            </span>
          </nav>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Add product</h1>
          <p className="text-slate-600 mb-4">As a verified supplier, you can load products to sell on the marketplace.</p>

          <div className="mb-8 rounded-xl border border-sky-100 bg-sky-50/50 p-4">
            <p className="text-sm font-semibold text-slate-800 mb-3">Add product flow</p>
            <ol className="space-y-2 text-sm text-slate-700 list-none">
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-600 text-white text-xs font-bold">1</span>
                <span><strong>Be verified</strong> — Only approved suppliers can add products. Not yet? <Link href="/supplier/apply" className="text-sky-600 hover:underline">Become a supplier</Link>.</span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-600 text-white text-xs font-bold">2</span>
                <span><strong>Fill the form</strong> — Title, price, description, sizes, and options (e.g. allow resell).</span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-600 text-white text-xs font-bold">3</span>
                <span><strong>Product goes live</strong> — It appears on the marketplace and can be bought or resold by others.</span>
              </li>
            </ol>
          </div>

          <form onSubmit={handleSubmit} className="rounded-2xl border border-white/60 bg-white/80 p-6 shadow-xl shadow-sky-50 space-y-4">
            <div>
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
              <p className="text-xs text-slate-500 mt-1">e.g. R1000 — 7.5% to be paid to Morongwa after sale.</p>
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
              <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={3}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                placeholder="Optional"
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
            <div>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.allowResell} onChange={(e) => setForm((f) => ({ ...f, allowResell: e.target.checked }))} className="rounded border-slate-300 text-sky-600" />
                <span className="text-sm text-slate-700">Allow resell</span>
              </label>
              <p className="text-xs text-slate-500 mt-1">Resellers set their own commission (3–7%) when adding to their store.</p>
            </div>
            <div className="flex gap-2 pt-2">
              <button type="submit" disabled={submitting} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50 flex items-center gap-2">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />} Create product
              </button>
              <Link href="/marketplace" className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</Link>
            </div>
          </form>
        </main>
      </div>
    </ProtectedRoute>
  );
}
