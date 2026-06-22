'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Save, Layers, X } from 'lucide-react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { adminAPI, getImageUrl } from '@/lib/api';
import { formatCurrencyAmount } from '@/lib/formatCurrency';
import toast from 'react-hot-toast';
import {
  adminMarkupPctForCategory,
  getMarketplaceCategoryMarkup,
} from '@/lib/marketplaceCategoryMarkups';
import { BULK_TIER_DEFAULT_MAX_QTY, displayBulkTierMaxQty, normalizeBulkTierMaxQty } from '@/lib/bulkTierLimits';

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

function formatPrice(price: number) {
  return formatCurrencyAmount(price, 'ZAR');
}

function roundMoneyZar(n: number): number {
  return Math.round(n * 100) / 100;
}

function inclusiveListPriceFromBaseZar(base: number, adminMarkupPct: number): number {
  if (!Number.isFinite(base) || base < 0) return 0;
  return roundMoneyZar(base * (1 + adminMarkupPct / 100));
}

/** Inverse of inclusive list: catalog list → supplier base for the given admin %. */
function supplierBaseZarFromCatalogListZar(listZar: number, adminMarkupPct: number): number {
  if (!Number.isFinite(listZar) || listZar < 0) return 0;
  const den = 1 + adminMarkupPct / 100;
  if (!Number.isFinite(den) || den <= 0) return 0;
  return roundMoneyZar(listZar / den);
}

function effectiveBaseUnitZar(priceStr: string, discountStr: string): number | null {
  const p = Number.parseFloat(String(priceStr).replace(',', '.'));
  if (!Number.isFinite(p) || p < 0) return null;
  const dRaw = String(discountStr || '').trim();
  if (!dRaw) return p;
  const d = Number.parseFloat(dRaw.replace(',', '.'));
  if (!Number.isFinite(d) || d < 0 || d >= p) return p;
  return d;
}

export default function AdminEditProductPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = useMemo(() => String(params?.id || ''), [params]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [bulkTiers, setBulkTiers] = useState<Array<{ minQty: string; maxQty: string; price: string }>>([]);
  const [productImages, setProductImages] = useState<string[]>([]);
  const [colorNames, setColorNames] = useState<string[]>([]);
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

  const baseUnitZar = useMemo(() => effectiveBaseUnitZar(form.price, form.discountPrice), [form.price, form.discountPrice]);

  const adminMarkupPct = useMemo(() => adminMarkupPctForCategory(form.categories), [form.categories]);

  const displaySellingPriceZar = useMemo(() => {
    if (baseUnitZar == null) return '';
    return formatPrice(inclusiveListPriceFromBaseZar(baseUnitZar, adminMarkupPct));
  }, [baseUnitZar, adminMarkupPct]);

  const resellerRangeHint = useMemo(() => {
    if (!form.allowResell) return null;
    const mk = getMarketplaceCategoryMarkup(form.categories);
    if (!mk || baseUnitZar == null) return null;
    const listP = inclusiveListPriceFromBaseZar(baseUnitZar, adminMarkupPct);
    return {
      lo: roundMoneyZar(listP * (1 + mk.resellerMinPct / 100)),
      hi: roundMoneyZar(listP * (1 + mk.resellerMaxPct / 100)),
      minPct: mk.resellerMinPct,
      maxPct: mk.resellerMaxPct,
    };
  }, [form.allowResell, form.categories, baseUnitZar, adminMarkupPct]);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    adminAPI
      .getProductCategories()
      .then((res) => setCategoryOptions(Array.isArray(res.data?.data) ? res.data.data : []))
      .catch(() => setCategoryOptions([]));
    adminAPI
      .getProduct(id)
      .then((res) => {
        const p = res.data?.data ?? res.data;
        if (!p?._id) {
          toast.error('Product not found');
          router.push('/admin/products');
          return;
        }
        const topCat = Array.isArray(p.categories) ? String(p.categories[0] || '').trim() : '';
        const adminPct = adminMarkupPctForCategory(topCat);
        const listPrice = Number(p.price) || 0;
        const listDisc =
          p.discountPrice != null && Number.isFinite(Number(p.discountPrice)) ? Number(p.discountPrice) : null;
        const baseMainStr = listPrice > 0 ? String(supplierBaseZarFromCatalogListZar(listPrice, adminPct)) : '';
        const baseDiscStr =
          listDisc != null && listDisc < listPrice
            ? String(supplierBaseZarFromCatalogListZar(listDisc, adminPct))
            : '';
        const rawTiers = Array.isArray((p as { bulkTiers?: unknown }).bulkTiers)
          ? (p as { bulkTiers: Array<{ minQty?: number; maxQty?: number; price?: number }> }).bulkTiers
          : [];
        setBulkTiers(
          rawTiers.map((t) => ({
            minQty: t.minQty != null ? String(t.minQty) : '',
            maxQty: t.maxQty != null ? String(displayBulkTierMaxQty(Number(t.maxQty))) : '',
            price:
              t.price != null && Number.isFinite(Number(t.price))
                ? String(supplierBaseZarFromCatalogListZar(Number(t.price), adminPct))
                : '',
          })),
        );
        const imgs = Array.isArray(p.images) ? p.images.map((u: unknown) => String(u || '').trim()).filter(Boolean) : [];
        const rawColors = Array.isArray((p as { colors?: Array<{ name?: string; imageIndex?: number }> }).colors)
          ? (p as { colors: Array<{ name?: string; imageIndex?: number }> }).colors
          : [];
        const namesByIndex = new Array(imgs.length).fill('');
        for (const c of rawColors) {
          const idx = Number(c.imageIndex);
          if (Number.isFinite(idx) && idx >= 0 && idx < imgs.length) {
            namesByIndex[idx] = String(c.name || '').trim();
          }
        }
        setProductImages(imgs);
        setColorNames(namesByIndex);
        setForm({
          title: p.title || '',
          description: p.description || '',
          price: baseMainStr,
          discountPrice: baseDiscStr,
          stock: String(p.stock ?? 0),
          outOfStock: !!p.outOfStock,
          active: p.active !== false,
          allowResell: p.allowResell !== false,
          sizes: Array.isArray(p.sizes) ? p.sizes.join(', ') : '',
          categories: topCat,
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
    if (!form.categories.trim()) {
      toast.error('Please select a category');
      return;
    }
    if (productImages.length > 0) {
      const trimmed = colorNames.map((c) => c.trim());
      if (trimmed.length !== productImages.length || !trimmed.every((c) => c.length > 0)) {
        toast.error('Enter a color name for each product image (e.g. Yellow, Black, Navy)');
        return;
      }
    }
    const baseList = Number(form.price);
    if (!Number.isFinite(baseList) || baseList < 0) {
      toast.error('Price must be a valid number');
      return;
    }
    const adminPct = adminMarkupPctForCategory(form.categories);
    const inclusiveList = inclusiveListPriceFromBaseZar(baseList, adminPct);
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
    let inclusiveDiscount: number | null = null;
    if (form.discountPrice.trim()) {
      const d = Number(form.discountPrice);
      if (Number.isFinite(d) && d > 0 && d < baseList) {
        const incD = inclusiveListPriceFromBaseZar(d, adminPct);
        if (incD < inclusiveList) inclusiveDiscount = incD;
      }
    }

    setSaving(true);
    try {
      const trimmedColors = colorNames.map((c) => c.trim());
      await adminAPI.updateProduct(id, {
        title: form.title.trim(),
        description: form.description.trim(),
        price: inclusiveList,
        discountPrice: inclusiveDiscount,
        stock: Math.max(0, Number(form.stock) || 0),
        outOfStock: form.outOfStock,
        active: form.active,
        allowResell: form.allowResell,
        sizes: form.sizes.split(',').map((s) => s.trim()).filter(Boolean),
        categories: form.categories ? [form.categories] : [],
        tags: form.tags.split(',').map((s) => s.trim()).filter(Boolean),
        bulkTiers: bulkTiersData,
        ...(productImages.length > 0
          ? {
              colors: trimmedColors.map((name, imageIndex) => ({ name, imageIndex })),
            }
          : {}),
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
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Product colors *</label>
                {productImages.length === 0 ? (
                  <p className="text-sm text-slate-500">No images on this product.</p>
                ) : (
                  <div className="flex flex-wrap gap-3">
                    {productImages.map((img, i) => (
                      <div key={`${img}-${i}`} className="flex flex-col gap-1">
                        <img
                          src={getImageUrl(img)}
                          alt={`Product ${i + 1}`}
                          className="h-24 w-24 object-cover rounded-lg border border-slate-200"
                        />
                        <input
                          type="text"
                          required
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
                          className="w-24 rounded border border-slate-200 px-1.5 py-1 text-xs text-slate-800"
                        />
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-xs text-slate-500 mt-1">
                  One color name per photo — what customers can order (e.g. Yellow, Black, Navy). Use the garment color, not the background.
                </p>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <textarea rows={3} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Price (ZAR) *</label>
                <input type="number" step="0.01" min="0" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2" />
                <p className="text-xs text-slate-500 mt-1">
                  Amount before Markup ({form.categories.trim() || 'selected category'})
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Discount price (ZAR)</label>
                <input type="number" step="0.01" min="0" value={form.discountPrice} onChange={(e) => setForm((f) => ({ ...f, discountPrice: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2" />
                <p className="text-xs text-slate-500 mt-1">
                  Optional sale base (before markup). Must be less than regular base (before markup).
                </p>
              </div>
              <div className="sm:col-span-2 rounded-xl border-2 border-sky-400/80 bg-sky-50/60 p-3 shadow-sm">
                <label className="block text-sm font-semibold text-slate-800 mb-1">Selling price (ZAR)</label>
                <input
                  type="text"
                  readOnly
                  tabIndex={-1}
                  aria-readonly="true"
                  value={displaySellingPriceZar}
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
                <label className="block text-sm font-medium text-slate-700 mb-1">Top category *</label>
                <select
                  required
                  value={form.categories}
                  onChange={(e) => setForm((f) => ({ ...f, categories: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2"
                >
                  <option value="">Select category</option>
                  {categoryOptions.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
                <p className="text-xs text-slate-500 mt-1">Choose the product&apos;s marketplace category.</p>
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
                  Quantity-based unit prices as <span className="font-semibold">base (before category markup)</span>; saved tiers use catalog list like the main price. Remove all rows to clear tiers on save.
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
                        <span className="text-sm font-medium text-slate-600">Unit base (ZAR)</span>
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
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Stock</label>
                <input type="number" min="0" value={form.stock} onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Sizes (comma-separated or ranges, e.g. S-4XL)</label>
                <input value={form.sizes} onChange={(e) => setForm((f) => ({ ...f, sizes: e.target.value }))} placeholder="S, M, L or S-4XL" className="w-full rounded-lg border border-slate-200 px-3 py-2" />
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
