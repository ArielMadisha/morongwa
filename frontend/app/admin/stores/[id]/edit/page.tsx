'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, ExternalLink, ImageIcon, Loader2, Save, Trash2, Upload } from 'lucide-react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { adminAPI, getImageUrl } from '@/lib/api';
import toast from 'react-hot-toast';
import { StoreWhatsappMarketsCheckboxes } from '@/components/admin/StoreWhatsappMarketsEditor';
import { STORE_LOCATION_COUNTRIES, effectiveWhatsappMarketCountries } from '@/lib/storeCountries';

type StoreForm = {
  name: string;
  type: 'supplier' | 'reseller';
  countryCode: string;
  address: string;
  email: string;
  cellphone: string;
  whatsapp: string;
};

export default function AdminEditStorePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = useMemo(() => String(params?.id || ''), [params]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPicture, setUploadingPicture] = useState(false);
  const [stripBackgroundPic, setStripBackgroundPic] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [meta, setMeta] = useState<{
    slug?: string;
    supplierLinked?: boolean;
    ownerLabel?: string;
  }>({});
  const [whatsappMarketCountries, setWhatsappMarketCountries] = useState<string[]>(['ZA']);
  const [form, setForm] = useState<StoreForm>({
    name: '',
    type: 'supplier',
    countryCode: 'ZA',
    address: '',
    email: '',
    cellphone: '',
    whatsapp: '',
  });

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    adminAPI
      .getStore(id)
      .then((res) => {
        const s = res.data?.data ?? res.data;
        if (!s?._id) {
          toast.error('Store not found');
          router.push('/admin/stores');
          return;
        }
        const owner = s.userId as { name?: string; email?: string } | undefined;
        setMeta({
          slug: s.slug,
          supplierLinked: s.type === 'supplier' && !!s.supplierId,
          ownerLabel: owner?.name || owner?.email || undefined,
        });
        setStripBackgroundPic(s.stripBackgroundPic || '');
        setWhatsappMarketCountries(
          effectiveWhatsappMarketCountries({
            whatsappMarketCountries: s.whatsappMarketCountries,
            countryCode: s.countryCode,
          })
        );
        setForm({
          name: s.name || '',
          type: s.type === 'reseller' ? 'reseller' : 'supplier',
          countryCode: String(s.countryCode || 'ZA').toUpperCase(),
          address: s.address || '',
          email: s.email || '',
          cellphone: s.cellphone || '',
          whatsapp: s.whatsapp || '',
        });
      })
      .catch(() => {
        toast.error('Failed to load store');
        router.push('/admin/stores');
      })
      .finally(() => setLoading(false));
  }, [id, router]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    if (!form.name.trim()) {
      toast.error('Store name is required');
      return;
    }
    if (!form.countryCode) {
      toast.error('Country is required');
      return;
    }
    const countryRow = STORE_LOCATION_COUNTRIES.find((c) => c.code === form.countryCode);
    if (!countryRow) {
      toast.error('Please select a valid country');
      return;
    }
    setSaving(true);
    try {
      await adminAPI.updateStore(id, {
        name: form.name.trim(),
        type: form.type,
        country: countryRow.name,
        countryCode: countryRow.code,
        address: form.address.trim(),
        email: form.email.trim(),
        cellphone: form.cellphone.trim(),
        whatsapp: form.whatsapp.trim(),
        ...(form.type === 'supplier' ? { whatsappMarketCountries } : {}),
      });
      toast.success('Store updated');
      router.push('/admin/stores');
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast.error(msg || 'Failed to update store');
    } finally {
      setSaving(false);
    }
  };

  const handlePictureSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file');
      return;
    }
    setUploadingPicture(true);
    try {
      const res = await adminAPI.uploadStoreProfilePicture(id, file);
      const url = res.data?.url || (res.data?.data as { stripBackgroundPic?: string } | undefined)?.stripBackgroundPic;
      if (url) {
        setStripBackgroundPic(url);
        toast.success('Store profile picture updated');
      } else {
        toast.error('Upload failed');
      }
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast.error(msg || 'Failed to upload profile picture');
    } finally {
      setUploadingPicture(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemovePicture = async () => {
    if (!id || !stripBackgroundPic) return;
    if (!confirm('Remove this store profile picture?')) return;
    setUploadingPicture(true);
    try {
      await adminAPI.updateStore(id, { stripBackgroundPic: '' });
      setStripBackgroundPic('');
      toast.success('Profile picture removed');
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast.error(msg || 'Failed to remove profile picture');
    } finally {
      setUploadingPicture(false);
    }
  };

  return (
    <ProtectedRoute allowedRoles={['admin', 'superadmin']}>
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-sky-100 text-slate-800">
        <main className="mx-auto max-w-3xl px-6 py-8">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">Edit store</h1>
              {meta.ownerLabel && (
                <p className="text-sm text-slate-600 mt-1">
                  Owner: {meta.ownerLabel}
                  {form.type ? ` · ${form.type}` : ''}
                  {form.type === 'supplier' && !meta.supplierLinked ? ' · marketplace link pending until save' : ''}
                </p>
              )}
            </div>
            <Link
              href="/admin/stores"
              className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:shadow-md"
            >
              <ArrowLeft className="h-4 w-4" /> Back to stores
            </Link>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
            </div>
          ) : (
            <form
              onSubmit={onSubmit}
              className="rounded-2xl border border-white/60 bg-white/80 p-6 shadow-xl shadow-sky-50 backdrop-blur grid gap-4 sm:grid-cols-2"
            >
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-2">Store profile picture</label>
                <div className="flex flex-wrap items-start gap-4">
                  <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full border border-slate-200 bg-slate-100 flex items-center justify-center">
                    {stripBackgroundPic ? (
                      <img
                        src={getImageUrl(stripBackgroundPic)}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <ImageIcon className="h-8 w-8 text-slate-400" aria-hidden />
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => void handlePictureSelect(e)}
                    />
                    <button
                      type="button"
                      disabled={uploadingPicture}
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-medium text-sky-800 hover:bg-sky-100 disabled:opacity-50"
                    >
                      {uploadingPicture ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                      {stripBackgroundPic ? 'Replace picture' : 'Upload picture'}
                    </button>
                    {stripBackgroundPic ? (
                      <button
                        type="button"
                        disabled={uploadingPicture}
                        onClick={() => void handleRemovePicture()}
                        className="inline-flex items-center gap-2 rounded-lg border border-red-100 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" />
                        Remove
                      </button>
                    ) : null}
                    <p className="text-xs text-slate-500 max-w-sm">
                      Shown on the store header and in cart/store pickers. JPEG, PNG, GIF, or WebP up to 10MB.
                    </p>
                  </div>
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Store name *</label>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2"
                />
                {meta.slug && (
                  <p className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-2">
                    Slug updates when the name changes: <span className="font-mono">{meta.slug}</span>
                    <a
                      href={`/store/${meta.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sky-600 hover:underline"
                    >
                      View storefront <ExternalLink className="h-3 w-3" />
                    </a>
                  </p>
                )}
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Store type</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as 'supplier' | 'reseller' }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2"
                >
                  <option value="supplier">Supplier (marketplace products)</option>
                  <option value="reseller">Reseller (MyStore only)</option>
                </select>
                <p className="mt-1 text-xs text-slate-500">
                  Set to Supplier and save to appear in Admin → Products supplier dropdown.
                </p>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Shop country *</label>
                <select
                  required
                  value={form.countryCode}
                  onChange={(e) => {
                    const code = e.target.value;
                    setForm((f) => ({ ...f, countryCode: code }));
                    if (form.type === 'supplier' && whatsappMarketCountries.length === 1 && whatsappMarketCountries[0] === form.countryCode) {
                      setWhatsappMarketCountries([code]);
                    }
                  }}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2"
                >
                  {STORE_LOCATION_COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-slate-500">Physical store location (courier and marketplace routing).</p>
              </div>
              {form.type === 'supplier' ? (
                <div className="sm:col-span-2">
                  <StoreWhatsappMarketsCheckboxes
                    countryCode={form.countryCode}
                    value={whatsappMarketCountries}
                    onChange={setWhatsappMarketCountries}
                  />
                </div>
              ) : null}
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Address</label>
                <textarea
                  rows={2}
                  value={form.address}
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Cellphone</label>
                <input
                  type="tel"
                  value={form.cellphone}
                  onChange={(e) => setForm((f) => ({ ...f, cellphone: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">WhatsApp</label>
                <input
                  type="tel"
                  value={form.whatsapp}
                  onChange={(e) => setForm((f) => ({ ...f, whatsapp: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2"
                />
              </div>
              <div className="sm:col-span-2 flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save changes
                </button>
                <Link
                  href="/admin/stores"
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </Link>
              </div>
            </form>
          )}
        </main>
      </div>
    </ProtectedRoute>
  );
}
