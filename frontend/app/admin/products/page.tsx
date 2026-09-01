'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { AdminSectionRoute } from '@/components/AdminSectionRoute';
import { adminAPI } from '@/lib/api';
import { formatCurrencyAmount } from '@/lib/formatCurrency';
import Link from 'next/link';
import { ArrowLeft, Package, Loader2, Plus, Trash2, ImagePlus, X, Layers, Wand2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAdminPermissions } from '@/contexts/AdminPermissionsContext';

import {
  adminMarkupPctForCategory,
  getMarketplaceCategoryMarkup,
} from '@/lib/marketplaceCategoryMarkups';
import { BULK_TIER_DEFAULT_MAX_QTY, normalizeBulkTierMaxQty } from '@/lib/bulkTierLimits';
import { currencyForCountryCode, currencyLabel } from '@/lib/storeProductCurrency';
import { FreeShippingFields } from '@/components/products/FreeShippingFields';
import {
  serializeFreeShippingPayload,
  freeShippingAreasFromProduct,
  type FreeShippingAreaRow,
} from '@/lib/freeShippingAreas';

const MAX_IMAGES = 10;
const MIN_IMAGES = 1;

function formatPrice(price: number, currency: string) {
  return formatCurrencyAmount(price, currency || 'ZAR');
}

/** Product upload / create time for admin Load Products table. */
function formatUploadedAt(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function roundMoneyZar(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Catalog list price from supplier base + category admin markup %. */
function inclusiveListPriceFromBaseZar(base: number, adminMarkupPct: number): number {
  if (!Number.isFinite(base) || base < 0) return 0;
  return roundMoneyZar(base * (1 + adminMarkupPct / 100));
}

/** Pre-commission unit: discount when valid and < list, else list price from the form strings. */
function effectiveBaseUnitZar(priceStr: string, discountStr: string): number | null {
  const p = Number.parseFloat(String(priceStr).replace(',', '.'));
  if (!Number.isFinite(p) || p < 0) return null;
  const dRaw = String(discountStr || '').trim();
  if (!dRaw) return p;
  const d = Number.parseFloat(dRaw.replace(',', '.'));
  if (!Number.isFinite(d) || d < 0 || d >= p) return p;
  return d;
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
  country?: string;
  countryCode?: string;
  userId?: { name?: string };
}

function supplierOptionLabel(s: SupplierOption): string {
  const name = s.storeName || (s.userId as { name?: string })?.name || s._id;
  const cc = s.countryCode || s.country;
  return cc ? `${name} (${cc})` : name;
}

export default function AdminProductsPage() {
  const { perms } = useAdminPermissions();
  const catalogUnrestricted = Boolean(perms?.isSuperAdmin || perms?.productCatalogUnrestricted);
  const scopedSupplierId = perms?.scopedSupplierId ? String(perms.scopedSupplierId) : '';
  const scopedSupplierIds = (perms?.scopedSupplierIds || []).map(String).filter(Boolean);
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
  const [normalizingCategories, setNormalizingCategories] = useState(false);
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [colorNames, setColorNames] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    supplierId: '',
    title: '',
    description: '',
    price: '',
    discountPrice: '',
    stock: '1000',
    outOfStock: false,
    sizes: '',
    allowResell: true,
    categories: '',
    tags: '',
  });
  const [bulkTiers, setBulkTiers] = useState<Array<{ minQty: string; maxQty: string; price: string }>>([]);
  const [freeShippingEnabled, setFreeShippingEnabled] = useState(false);
  const [freeShippingAreas, setFreeShippingAreas] = useState<FreeShippingAreaRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const selectedSupplier = useMemo(
    () => suppliers.find((s) => s._id === form.supplierId),
    [suppliers, form.supplierId]
  );
  const loadCurrency = useMemo(
    () => currencyForCountryCode(selectedSupplier?.countryCode),
    [selectedSupplier?.countryCode]
  );
  const loadCurrencyLabel = useMemo(() => currencyLabel(loadCurrency), [loadCurrency]);

  const baseUnit = useMemo(() => effectiveBaseUnitZar(form.price, form.discountPrice), [form.price, form.discountPrice]);

  const adminMarkupPct = useMemo(() => adminMarkupPctForCategory(form.categories), [form.categories]);

  const displaySellingPrice = useMemo(() => {
    if (baseUnit == null) return '';
    return formatPrice(inclusiveListPriceFromBaseZar(baseUnit, adminMarkupPct), loadCurrency);
  }, [baseUnit, adminMarkupPct, loadCurrency]);

  const resellerRangeHint = useMemo(() => {
    if (!form.allowResell) return null;
    const mk = getMarketplaceCategoryMarkup(form.categories);
    if (!mk || baseUnit == null) return null;
    const listP = inclusiveListPriceFromBaseZar(baseUnit, adminMarkupPct);
    return {
      lo: roundMoneyZar(listP * (1 + mk.resellerMinPct / 100)),
      hi: roundMoneyZar(listP * (1 + mk.resellerMaxPct / 100)),
      minPct: mk.resellerMinPct,
      maxPct: mk.resellerMaxPct,
    };
  }, [form.allowResell, form.categories, baseUnit, adminMarkupPct]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const imageFilesOnly = files.filter((f) => f.type.startsWith('image/'));
    if (imageFilesOnly.length !== files.length) toast.error('Only image files (JPEG, PNG, GIF, WebP) are allowed');
    const combined = [...imageFiles, ...imageFilesOnly].slice(0, MAX_IMAGES);
    setImageFiles(combined);
    setColorNames((prev) => {
      const next = [...prev];
      while (next.length < combined.length) next.push('');
      return next.slice(0, combined.length);
    });
    const newPreviews = combined.map((f) => URL.createObjectURL(f));
    imagePreviews.forEach((url) => URL.revokeObjectURL(url));
    setImagePreviews(newPreviews);
    e.target.value = '';
  };

  const removeImage = (index: number) => {
    const next = imageFiles.filter((_, i) => i !== index);
    setImageFiles(next);
    setColorNames((prev) => prev.filter((_, i) => i !== index));
    imagePreviews.forEach((url) => URL.revokeObjectURL(url));
    setImagePreviews(next.map((f) => URL.createObjectURL(f)));
  };

  useEffect(() => {
    fetchProducts(1);
    fetchSuppliers();
    adminAPI
      .getProductCategories()
      .then((res) => setCategoryOptions(Array.isArray(res.data?.data) ? res.data.data : []))
      .catch(() => setCategoryOptions([]));
  }, []);

  /** Drop selections that are no longer on the current list (e.g. after page change). */
  useEffect(() => {
    const onPage = new Set(products.map((p) => p._id));
    setSelectedIds((prev) => {
      const next = new Set<string>();
      prev.forEach((id) => {
        if (onPage.has(id)) next.add(id);
      });
      return next;
    });
  }, [products]);

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
      const res = await adminAPI.getProductSupplierOptions({ limit: 200, hasActiveStore: true });
      let list = res.data?.suppliers ?? res.data ?? [];
      if (!Array.isArray(list)) list = [];
      if (list.length === 0) {
        const fallback = await adminAPI.getProductSupplierOptions({ limit: 200 });
        const fallbackList = fallback.data?.suppliers ?? fallback.data ?? [];
        list = Array.isArray(fallbackList) ? fallbackList : [];
      }
      setSuppliers(list);
      if (list.length === 1) {
        setForm((f) => ({ ...f, supplierId: list[0]._id }));
      } else if (scopedSupplierId && list.some((s: SupplierOption) => s._id === scopedSupplierId)) {
        setForm((f) => ({ ...f, supplierId: scopedSupplierId }));
      } else if (scopedSupplierIds.length === 1 && list.some((s: SupplierOption) => s._id === scopedSupplierIds[0])) {
        setForm((f) => ({ ...f, supplierId: scopedSupplierIds[0] }));
      }
      if (list.length === 0) {
        toast.error(
          catalogUnrestricted
            ? 'No approved suppliers found — check Admin → Suppliers'
            : 'No store assigned for product loading'
        );
      }
    } catch {
      setSuppliers([]);
      toast.error('Could not load supplier list for product assignment');
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.supplierId || !form.title.trim() || form.price === '' || Number(form.price) < 0) {
      toast.error('Supplier, title and price are required');
      return;
    }
    if (!form.categories.trim()) {
      toast.error('Please select a category');
      return;
    }
    if (imageFiles.length < MIN_IMAGES) {
      toast.error(`At least ${MIN_IMAGES} product image is required (up to ${MAX_IMAGES})`);
      return;
    }
    const shippingPayload = serializeFreeShippingPayload(freeShippingEnabled, freeShippingAreas);
    if (shippingPayload.freeShippingEnabled && !shippingPayload.freeShippingAreas?.length) {
      toast.error('Add at least one free shipping area (town and country)');
      return;
    }
    const trimmedColors = colorNames.map((c) => c.trim());
    if (trimmedColors.length !== imageFiles.length || !trimmedColors.every((c) => c.length > 0)) {
      toast.error('Enter a color name for each product image (e.g. Yellow, Black, Navy)');
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
      const baseList = Number(form.price);
      const adminPct = adminMarkupPctForCategory(form.categories);
      const inclusiveList = inclusiveListPriceFromBaseZar(baseList, adminPct);
      let inclusiveDiscount: number | undefined;
      if (form.discountPrice.trim()) {
        const d = Number(form.discountPrice);
        if (Number.isFinite(d) && d > 0 && d < baseList) {
          const incD = inclusiveListPriceFromBaseZar(d, adminPct);
          if (incD < inclusiveList) inclusiveDiscount = incD;
        }
      }
      const bulkTiersData = bulkTiers
        .filter((t) => t.minQty.trim() && t.price.trim())
        .map((t) => {
          const minQty = Number(t.minQty);
          const maxRaw = Number(t.maxQty);
          const maxQty = normalizeBulkTierMaxQty(maxRaw, minQty);
          return {
            minQty,
            maxQty,
            price: inclusiveListPriceFromBaseZar(Number(t.price), adminPct),
          };
        })
        .filter((t) => t.minQty >= 1 && t.maxQty >= t.minQty && t.price >= 0);
      const manualColors = trimmedColors.map((name, imageIndex) => ({ name, imageIndex }));
      await adminAPI.createProduct({
        supplierId: form.supplierId,
        currency: loadCurrency,
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        images: urls,
        price: inclusiveList,
        ...(inclusiveDiscount != null && { discountPrice: inclusiveDiscount }),
        ...(bulkTiersData.length > 0 && { bulkTiers: bulkTiersData }),
        stock: Number(form.stock) || 0,
        outOfStock: form.outOfStock,
        sizes: form.sizes ? form.sizes.split(',').map((s) => s.trim()).filter(Boolean) : [],
        allowResell: form.allowResell,
        categories: form.categories ? [form.categories] : [],
        tags: form.tags ? form.tags.split(',').map((s) => s.trim()).filter(Boolean) : [],
        colors: manualColors,
        ...shippingPayload,
      });
      toast.success('Product created');
      setShowForm(false);
      imagePreviews.forEach((url) => URL.revokeObjectURL(url));
      setImageFiles([]);
      setImagePreviews([]);
      setColorNames([]);
      setForm({ supplierId: form.supplierId, title: '', description: '', price: '', discountPrice: '', stock: '1000', outOfStock: false, sizes: '', allowResell: true, categories: '', tags: '' });
      setBulkTiers([]);
      setFreeShippingEnabled(false);
      setFreeShippingAreas([]);
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
      setSelectedIds((prev) => {
        const n = new Set(prev);
        n.delete(id);
        return n;
      });
      toast.success('Product deleted');
      const targetPage = products.length === 1 && page > 1 ? page - 1 : page;
      fetchProducts(targetPage);
    } catch {
      toast.error('Failed to delete product');
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} selected product(s)? This cannot be undone.`)) return;
    setBulkDeleting(true);
    const ids = [...selectedIds];
    let ok = 0;
    let fail = 0;
    for (const id of ids) {
      try {
        await adminAPI.deleteProduct(id);
        ok += 1;
      } catch {
        fail += 1;
      }
    }
    setBulkDeleting(false);
    setSelectedIds(new Set());
    if (ok) toast.success(`Deleted ${ok} product(s).`);
    if (fail) toast.error(`Failed to delete ${fail} product(s).`);
    const clearedWholePage = ids.length === products.length && ok === ids.length;
    fetchProducts(clearedWholePage && page > 1 ? page - 1 : page);
  };

  const handleNormalizeCategories = async () => {
    if (!confirm('Auto-assign categories for products missing/invalid categories?')) return;
    setNormalizingCategories(true);
    try {
      const fallbackCategory = form.categories || categoryOptions[0] || '';
      const res = await adminAPI.categorizeMissingProducts({ fallbackCategory, limit: 3000 });
      toast.success(`Categories normalized. Updated ${res.data?.updated ?? 0} products.`);
      fetchProducts(page);
    } catch {
      toast.error('Failed to normalize categories');
    } finally {
      setNormalizingCategories(false);
    }
  };

  return (
    <AdminSectionRoute sections={['products', 'product_uploads']}>
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-sky-100 text-slate-800">
        <header className="border-b border-white/60 bg-white/70 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
            <div>
              <p className="text-xs uppercase tracking-widest text-sky-600">Morongwa</p>
              <h1 className="mt-1 text-3xl font-semibold text-slate-900">Load Products</h1>
              <p className="mt-1 text-sm text-slate-600">
                {catalogUnrestricted
                  ? 'Load and manage products for sale. Assign to an approved supplier.'
                  : 'Load products into one of your stores. Use the store dropdown to switch.'}
              </p>
              <p className="mt-2 text-xs text-slate-500">
                Showing {products.length} of {totalProducts} products (page {page} of {totalPages}, {PAGE_SIZE} per page)
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {catalogUnrestricted ? (
                <button
                  type="button"
                  onClick={handleNormalizeCategories}
                  disabled={normalizingCategories}
                  className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                >
                  {normalizingCategories ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                  Auto-categorize products
                </button>
              ) : null}
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
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    {catalogUnrestricted ? 'Supplier *' : 'Store *'}
                  </label>
                  <select
                    required
                    value={form.supplierId}
                    onChange={(e) => setForm((f) => ({ ...f, supplierId: e.target.value }))}
                    disabled={suppliers.length <= 1}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:bg-slate-50 disabled:text-slate-700"
                  >
                    {suppliers.length !== 1 ? (
                      <option value="">{catalogUnrestricted ? 'Select approved supplier' : 'Select store'}</option>
                    ) : null}
                    {suppliers.map((s) => (
                      <option key={s._id} value={s._id}>{supplierOptionLabel(s)}</option>
                    ))}
                  </select>
                  {!catalogUnrestricted ? (
                    <p className="mt-1 text-xs text-slate-500">
                      {suppliers.length > 1
                        ? 'Pick which of your stores to load this product into.'
                        : 'Products are loaded into your store only.'}
                    </p>
                  ) : null}
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Category *</label>
                  <select
                    required
                    value={form.categories}
                    onChange={(e) => setForm((f) => ({ ...f, categories: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                  >
                    <option value="">Select category</option>
                    {categoryOptions.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-500 mt-1">Choose the product&apos;s marketplace category.</p>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Product pictures * (1–{MAX_IMAGES} images)</label>
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
                      <div key={i} className="relative group flex flex-col gap-1">
                        <img src={url} alt={`Preview ${i + 1}`} className="h-24 w-24 object-cover rounded-lg border border-slate-200" />
                        <input
                          type="text"
                          value={colorNames[i] || ''}
                          onChange={(e) =>
                            setColorNames((prev) => {
                              const next = [...prev];
                              while (next.length <= i) next.push('');
                              next[i] = e.target.value;
                              return next;
                            })
                          }
                          placeholder={`Color ${i + 1} *`}
                          required
                          className="w-24 rounded border border-slate-200 px-1.5 py-1 text-xs text-slate-800"
                        />
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
                  <p className="text-xs text-slate-500 mt-1">
                    At least one image required, max {MAX_IMAGES}. Enter the <span className="font-medium">actual garment color</span> for each photo — customers choose these at checkout (e.g. Yellow, Black, Navy).
                  </p>
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
                  <label className="block text-sm font-medium text-slate-700 mb-1">Price ({loadCurrencyLabel}) *</label>
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
                  <p className="text-xs text-slate-500 mt-1">
                    Amount before Markup ({form.categories.trim() || 'selected category'})
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Discount price ({loadCurrencyLabel})</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.discountPrice}
                    onChange={(e) => setForm((f) => ({ ...f, discountPrice: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                    placeholder="Optional — e.g. 799 for sale"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Optional sale base (before markup). Must be less than regular base (before markup).
                  </p>
                </div>
                <div className="rounded-xl border-2 border-sky-400/80 bg-sky-50/60 p-3 shadow-sm">
                  <label className="block text-sm font-semibold text-slate-800 mb-1">Selling price ({loadCurrencyLabel})</label>
                  <input
                    type="text"
                    readOnly
                    tabIndex={-1}
                    aria-readonly="true"
                    value={displaySellingPrice}
                    placeholder="Price calculated automatically"
                    className="w-full cursor-default rounded-lg border border-sky-200 bg-white px-3 py-2 font-medium text-slate-900"
                  />
                  <p className="text-xs text-slate-600 mt-1.5">
                    Includes {adminMarkupPct}% markup
                    {form.categories.trim() ? ` (${form.categories.trim()})` : ''}.
                  </p>
                  {!form.allowResell ? (
                    <p className="text-xs text-slate-500 mt-1">Reselling is off — only this list price applies.</p>
                  ) : resellerRangeHint ? (
                    <p className="text-xs text-slate-600 mt-1">
                      Resellers may add {resellerRangeHint.minPct}%–{resellerRangeHint.maxPct}% on this list price (about{' '}
                      {formatPrice(resellerRangeHint.lo)} – {formatPrice(resellerRangeHint.hi)}).
                    </p>
                  ) : null}
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
                  <p className="text-xs text-slate-500 mb-2">
                    Quantity-based unit prices as <span className="font-semibold">base (before category markup)</span>; stored tiers use catalog list like the main price.
                  </p>
                  {bulkTiers.length > 0 && (
                    <div className="space-y-2">
                      {bulkTiers.map((tier, i) => (
                        <div key={i} className="flex flex-wrap gap-2 items-center rounded-lg border border-slate-200 bg-slate-50/50 p-3">
                          <span className="text-sm font-medium text-slate-600">Quantity</span>
                          <input
                            type="number"
                            min="0"
                            max={String(BULK_TIER_DEFAULT_MAX_QTY)}
                            value={tier.minQty}
                            onChange={(e) => setBulkTiers((t) => t.map((x, j) => (j === i ? { ...x, minQty: e.target.value } : x)))}
                            placeholder="Min"
                            className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                          />
                          <span className="text-slate-500">–</span>
                          <input
                            type="number"
                            min="0"
                            max={String(BULK_TIER_DEFAULT_MAX_QTY)}
                            value={tier.maxQty}
                            onChange={(e) => setBulkTiers((t) => t.map((x, j) => (j === i ? { ...x, maxQty: e.target.value } : x)))}
                            placeholder={String(BULK_TIER_DEFAULT_MAX_QTY)}
                            className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                          />
                          <span className="text-sm font-medium text-slate-600">Unit base ({loadCurrencyLabel})</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={tier.price}
                            onChange={(e) => setBulkTiers((t) => t.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))}
                            placeholder="Before markup"
                            className="w-28 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
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
                <div className="sm:col-span-2">
                  <FreeShippingFields
                    enabled={freeShippingEnabled}
                    areas={freeShippingAreas}
                    defaultCountryCode={selectedSupplier?.countryCode || 'ZA'}
                    onEnabledChange={setFreeShippingEnabled}
                    onAreasChange={setFreeShippingAreas}
                  />
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
                  <label className="block text-sm font-medium text-slate-700 mb-1">Sizes (comma-separated or ranges)</label>
                  <input
                    type="text"
                    value={form.sizes}
                    onChange={(e) => setForm((f) => ({ ...f, sizes: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                    placeholder="S, M, L, XL or S-4XL"
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
                  <p className="text-xs text-slate-500 mt-1">
                    Resellers choose markup within the category band on the list price (see preview above).
                  </p>
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
                        <th className="w-[9.5rem] min-w-[9.5rem] py-2 px-2 align-top text-left" scope="col">
                          <button
                            type="button"
                            onClick={handleBulkDelete}
                            disabled={bulkDeleting || selectedIds.size === 0}
                            className="inline-flex w-full flex-col items-stretch gap-1 rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-left text-xs font-semibold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-45"
                          >
                            <span className="inline-flex items-center gap-1">
                              {bulkDeleting ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" /> : <Trash2 className="h-3.5 w-3.5 shrink-0" />}
                              Delete selected
                            </span>
                            {selectedIds.size > 0 ? (
                              <span className="text-[10px] font-normal text-red-600/90">{selectedIds.size} on this page</span>
                            ) : (
                              <span className="text-[10px] font-normal text-slate-500">Select rows below</span>
                            )}
                          </button>
                        </th>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Product</th>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 whitespace-nowrap">Uploaded</th>
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
                          <td className="py-3 px-2 text-center align-middle">
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                              checked={selectedIds.has(p._id)}
                              onChange={() => {
                                setSelectedIds((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(p._id)) next.delete(p._id);
                                  else next.add(p._id);
                                  return next;
                                });
                              }}
                              aria-label={`Select ${p.title} for bulk delete`}
                            />
                          </td>
                          <td className="py-3 px-4">
                            <p className="font-medium text-slate-900">{p.title}</p>
                            <p className="text-xs text-slate-500">{p.slug}</p>
                          </td>
                          <td className="py-3 px-4 text-sm text-slate-600 whitespace-nowrap" title={p.createdAt || undefined}>
                            {formatUploadedAt(p.createdAt)}
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
    </AdminSectionRoute>
  );
}
