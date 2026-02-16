'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { productsAPI, suppliersAPI } from '@/lib/api';
import Link from 'next/link';
import { Loader2, Package, ImagePlus, X, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useCartAndStores } from '@/lib/useCartAndStores';
import { AppSidebar, AppSidebarMenuButton } from '@/components/AppSidebar';
import { ProfileDropdown } from '@/components/ProfileDropdown';

const MAX_IMAGES = 5;
const MIN_IMAGES = 1;

export default function SupplierProductsPage() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const { cartCount, hasStore } = useCartAndStores(!!user);
  const [menuOpen, setMenuOpen] = useState(false);
  const [verifiedSupplier, setVerifiedSupplier] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  useEffect(() => {
    suppliersAPI.getMe()
      .then((res) => {
        const s = res.data?.data ?? res.data;
        setVerifiedSupplier(s?.status === 'approved');
      })
      .catch(() => setVerifiedSupplier(false));
  }, []);
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
      toast.success('Product created and listed on QwertyHub');
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

  // Block reseller-only stores: if user has a store from reselling but is NOT a verified supplier, they cannot add physical products
  if (verifiedSupplier === false) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-amber-50/20 to-sky-50 text-slate-800 flex">
          <AppSidebar variant="wall" userName={user?.name} cartCount={cartCount} hasStore={hasStore} onLogout={handleLogout} menuOpen={menuOpen} setMenuOpen={setMenuOpen} />
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            <header className="bg-white/85 backdrop-blur-md border-b border-slate-100 px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between gap-4">
              <AppSidebarMenuButton onClick={() => setMenuOpen(true)} />
              <ProfileDropdown userName={user?.name} className="ml-auto" />
            </header>
            <main className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-8">
              <div className="max-w-xl mx-auto">
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
                  <AlertTriangle className="h-12 w-12 text-amber-600 mx-auto mb-4" />
                  <h1 className="text-xl font-bold text-slate-900 mb-2">Supplier verification required</h1>
                  <p className="text-slate-700 mb-4">
                    Your store was created automatically when you added products from QwertyHub. To add your own physical products and sell inventory, you must first get verified as a supplier.
                  </p>
                  <Link href="/supplier/apply" className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-700">
                    Apply to become a supplier
                  </Link>
                  <p className="text-sm text-slate-500 mt-4">
                    <Link href="/store" className="text-sky-600 hover:underline">Back to MyStore</Link>
                  </p>
                </div>
              </div>
            </main>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  if (verifiedSupplier === null) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-amber-50/20 to-sky-50 flex items-center justify-center">
          <Loader2 className="h-10 w-10 animate-spin text-sky-600" />
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-amber-50/20 to-sky-50 text-slate-800 flex">
        <AppSidebar variant="wall" userName={user?.name} cartCount={cartCount} hasStore={hasStore} onLogout={handleLogout} menuOpen={menuOpen} setMenuOpen={setMenuOpen} />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <header className="bg-white/85 backdrop-blur-md border-b border-slate-100 px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between gap-4">
            <AppSidebarMenuButton onClick={() => setMenuOpen(true)} />
            <ProfileDropdown userName={user?.name} className="ml-auto" />
          </header>
          <main className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="max-w-xl mx-auto">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h1 className="text-2xl font-bold text-slate-900">Add product</h1>
                  <p className="text-slate-600 text-sm mt-0.5">Load products to sell on QwertyHub.</p>
                </div>
                <Link href="/supplier/settings" className="text-sm font-medium text-sky-600 hover:text-sky-700">
                  Supplier settings
                </Link>
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
              <Link href="/store" className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Back to MyStore</Link>
            </div>
          </form>
            </div>
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
