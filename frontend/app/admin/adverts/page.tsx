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
  ExternalLink,
  Save,
  Upload,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface Advert {
  _id: string;
  title: string;
  imageUrl: string;
  linkUrl?: string;
  advertiserName?: string;
  advertiserAvatar?: string;
  caption?: string;
  description?: string;
  ctaLabel?: string;
  videoUrl?: string;
  slot: 'random' | 'promo';
  productId?: string;
  active: boolean;
  order?: number;
  createdAt?: string;
}

type WaPremenuForm = {
  tier: 'bronze' | 'silver' | 'gold';
  campaignMode: string;
  silverMediaUrl: string;
  silverCaption: string;
  goldMediaUrl: string;
  goldCaption: string;
  goldFeaturedPartnerLabel: string;
  acbpayMediaUrlA: string;
  acbpayMediaUrlB: string;
  textOverrides: Record<string, string>;
};

const WA_CAMPAIGN_KEYS = ['marketplace', 'resellers', 'wallet', 'employment'] as const;

function WaPremenuAdvertPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadField, setUploadField] = useState<string | null>(null);
  const [bundled, setBundled] = useState<{ silverSample: string; acbpayA: string; acbpayB: string } | null>(null);
  const [form, setForm] = useState<WaPremenuForm>({
    tier: 'silver',
    campaignMode: 'auto',
    silverMediaUrl: '',
    silverCaption: '',
    goldMediaUrl: '',
    goldCaption: '',
    goldFeaturedPartnerLabel: '',
    acbpayMediaUrlA: '',
    acbpayMediaUrlB: '',
    textOverrides: {},
  });

  const load = async () => {
    try {
      const res = await adminAPI.getWaPremenuAdvert();
      const d = res.data?.data;
      if (!d) return;
      setForm({
        tier: d.tier,
        campaignMode: d.campaignMode,
        silverMediaUrl: d.silverMediaUrl || '',
        silverCaption: d.silverCaption || '',
        goldMediaUrl: d.goldMediaUrl || '',
        goldCaption: d.goldCaption || '',
        goldFeaturedPartnerLabel: d.goldFeaturedPartnerLabel || '',
        acbpayMediaUrlA: d.acbpayMediaUrlA || '',
        acbpayMediaUrlB: d.acbpayMediaUrlB || '',
        textOverrides: { ...(d.textOverrides || {}) },
      });
      setBundled(d.bundledDefaults || null);
    } catch {
      toast.error('Failed to load WhatsApp pre-menu advert settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    try {
      setSaving(true);
      await adminAPI.updateWaPremenuAdvert({
        tier: form.tier,
        campaignMode: form.campaignMode,
        silverMediaUrl: form.silverMediaUrl || null,
        silverCaption: form.silverCaption || null,
        goldMediaUrl: form.goldMediaUrl || null,
        goldCaption: form.goldCaption || null,
        goldFeaturedPartnerLabel: form.goldFeaturedPartnerLabel || null,
        acbpayMediaUrlA: form.acbpayMediaUrlA || null,
        acbpayMediaUrlB: form.acbpayMediaUrlB || null,
        textOverrides: form.textOverrides,
      });
      toast.success('WhatsApp pre-menu advert saved');
      await load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const uploadMedia = async (field: keyof WaPremenuForm, file: File) => {
    try {
      setUploadField(field);
      const res = await adminAPI.uploadWaPremenuMedia(file);
      const url = res.data?.url || res.data?.data?.url;
      if (!url) throw new Error('No URL returned');
      setForm((f) => ({ ...f, [field]: url }));
      toast.success('Media uploaded');
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || 'Upload failed');
    } finally {
      setUploadField(null);
    }
  };

  return (
    <section className="mb-8 rounded-2xl border border-emerald-100 bg-white/90 p-6 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">WhatsApp pre-menu adverts</h2>
          <p className="mt-1 text-sm text-slate-600">
            Fallback when no active{' '}
            <Link href="/admin/sponsored-video" className="font-semibold text-emerald-700 hover:underline">
              Sponsored video
            </Link>{' '}
            matches the menu branch. <strong>Bronze</strong> = text only; <strong>Silver/Gold</strong> = video clip
            before the menu (options 2–7, welcome, etc.).
          </p>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={saving || loading}
          className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save WA settings
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-7 w-7 animate-spin text-emerald-600" />
        </div>
      ) : (
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Tier</label>
            <select
              value={form.tier}
              onChange={(e) => setForm((f) => ({ ...f, tier: e.target.value as WaPremenuForm['tier'] }))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
            >
              <option value="bronze">Bronze — campaign text only</option>
              <option value="silver">Silver — sample / silver video</option>
              <option value="gold">Gold — featured partner video</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Campaign mode</label>
            <select
              value={form.campaignMode}
              onChange={(e) => setForm((f) => ({ ...f, campaignMode: e.target.value }))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
            >
              <option value="auto">Auto (calendar / weekday rotation)</option>
              <option value="marketplace">Marketplace</option>
              <option value="resellers">Resellers</option>
              <option value="wallet">Wallet / ACBPay</option>
              <option value="employment">Employment / errands</option>
            </select>
          </div>

          {(form.tier === 'silver' || form.tier === 'gold') && (
            <>
              <div className="lg:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Silver video URL (HTTPS MP4)</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={form.silverMediaUrl}
                    onChange={(e) => setForm((f) => ({ ...f, silverMediaUrl: e.target.value }))}
                    className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    placeholder={bundled?.silverSample || 'https://www.qwertymates.com/wa-adverts/...'}
                  />
                  <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                    <Upload className="h-4 w-4" />
                    {uploadField === 'silverMediaUrl' ? '…' : 'Upload'}
                    <input
                      type="file"
                      accept="video/mp4,video/quicktime,image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void uploadMedia('silverMediaUrl', f);
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Silver caption</label>
                <textarea
                  value={form.silverCaption}
                  onChange={(e) => setForm((f) => ({ ...f, silverCaption: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 min-h-[72px] text-sm"
                />
              </div>
              {form.tier === 'gold' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Gold video URL</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={form.goldMediaUrl}
                        onChange={(e) => setForm((f) => ({ ...f, goldMediaUrl: e.target.value }))}
                        className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      />
                      <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                        <Upload className="h-4 w-4" />
                        {uploadField === 'goldMediaUrl' ? '…' : 'Upload'}
                        <input
                          type="file"
                          accept="video/mp4,video/quicktime"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) void uploadMedia('goldMediaUrl', f);
                            e.target.value = '';
                          }}
                        />
                      </label>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Gold featured partner label</label>
                    <input
                      type="text"
                      value={form.goldFeaturedPartnerLabel}
                      onChange={(e) => setForm((f) => ({ ...f, goldFeaturedPartnerLabel: e.target.value }))}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="lg:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Gold caption</label>
                    <textarea
                      value={form.goldCaption}
                      onChange={(e) => setForm((f) => ({ ...f, goldCaption: e.target.value }))}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 min-h-[72px] text-sm"
                    />
                  </div>
                </>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">ACBPay video A (menu 5 / wallet)</label>
                <input
                  type="text"
                  value={form.acbpayMediaUrlA}
                  onChange={(e) => setForm((f) => ({ ...f, acbpayMediaUrlA: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  placeholder={bundled?.acbpayA}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">ACBPay video B</label>
                <input
                  type="text"
                  value={form.acbpayMediaUrlB}
                  onChange={(e) => setForm((f) => ({ ...f, acbpayMediaUrlB: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  placeholder={bundled?.acbpayB}
                />
              </div>
            </>
          )}

          <div className="lg:col-span-2 space-y-3">
            <p className="text-sm font-medium text-slate-800">Campaign copy overrides (bronze tier + caption fallback)</p>
            {WA_CAMPAIGN_KEYS.map((key) => (
              <div key={key}>
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">{key}</label>
                <textarea
                  value={form.textOverrides[key] || ''}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      textOverrides: { ...f.textOverrides, [key]: e.target.value },
                    }))
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 min-h-[64px] text-sm"
                  placeholder={`Default script used when empty`}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
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
    advertiserName: '',
    advertiserAvatar: '',
    caption: '',
    description: '',
    ctaLabel: 'Learn more',
    videoUrl: '',
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
    setForm({
      title: '',
      imageUrl: '',
      linkUrl: '',
      advertiserName: '',
      advertiserAvatar: '',
      caption: '',
      description: '',
      ctaLabel: 'Learn more',
      videoUrl: '',
      slot: 'promo',
      active: true,
      order: 0,
    });
    setModalOpen(true);
  };

  const openEdit = (a: Advert) => {
    setEditing(a);
    setForm({
      title: a.title,
      imageUrl: a.imageUrl,
      linkUrl: a.linkUrl || '',
      advertiserName: a.advertiserName || '',
      advertiserAvatar: a.advertiserAvatar || '',
      caption: a.caption || '',
      description: a.description || '',
      ctaLabel: a.ctaLabel || 'Learn more',
      videoUrl: a.videoUrl || '',
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
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-sky-600">Qwertymates</p>
            <h1 className="mt-1 text-3xl font-semibold text-slate-900">Adverts</h1>
            <p className="mt-1 text-sm text-slate-600">
              Facebook-style feed adverts on the wall (header, caption, carousel, CTA). Also used in sidebar slots.
            </p>
            <p className="mt-2 text-sm text-slate-600">
              <strong className="font-medium text-slate-800">WhatsApp-style video creatives</strong> are{' '}
              <strong className="font-medium text-emerald-800">not</strong> managed here—they use{' '}
              <Link href="/admin/sponsored-video" className="font-semibold text-emerald-700 underline-offset-2 hover:underline">
                Sponsored video
              </Link>{' '}
              (<strong className="font-medium text-slate-800">SponsoredVideoAd</strong> +{' '}
              <strong className="font-medium text-slate-800">Advertiser</strong>). Packages and onboarding live under{' '}
              <Link href="/admin/advertising" className="font-semibold text-indigo-700 underline-offset-2 hover:underline">
                Web advertising
              </Link>
              .
            </p>
          </div>
          <div className="flex flex-wrap gap-2 sm:justify-end">
            <Link
              href="/admin/sponsored-video"
              className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 shadow-sm transition hover:bg-emerald-100"
            >
              Sponsored video admin
              <ExternalLink className="h-4 w-4" />
            </Link>
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
        <div className="mb-6 rounded-xl border border-amber-100 bg-amber-50/80 px-4 py-3 text-sm text-amber-950">
          <strong className="font-semibold">Reminder:</strong> Twilio Studio decides <em>when</em> a WhatsApp step runs. After
          your flow calls the backend, the creative comes from{' '}
          <Link href="/admin/sponsored-video" className="font-semibold text-amber-900 underline">
            Sponsored video
          </Link>{' '}
          first, then the fallback block below when no sponsored ad matches.
        </div>

        <WaPremenuAdvertPanel />

        <h2 className="mb-4 text-lg font-semibold text-slate-900">Wall feed slot adverts</h2>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
          </div>
        ) : adverts.length === 0 ? (
          <div className="rounded-2xl border border-slate-100 bg-white/80 p-12 text-center">
            <Megaphone className="mx-auto h-12 w-12 text-slate-300" />
            <p className="mt-4 text-lg font-semibold text-slate-900">No adverts yet</p>
            <p className="text-sm text-slate-600 mt-1">Create your first slot advert to display on the platform.</p>
            <button
              onClick={openCreate}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-white font-medium hover:bg-sky-700"
            >
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 overflow-y-auto">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-xl p-6 my-8 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">
              {editing ? 'Edit advert' : 'Create advert'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Advertiser / page name</label>
                <input
                  type="text"
                  value={form.advertiserName}
                  onChange={(e) => setForm((f) => ({ ...f, advertiserName: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2"
                  placeholder="e.g. Flight Centre South Africa"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Card title</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2"
                  placeholder="Headline on CTA card"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Caption (above media)</label>
                <textarea
                  value={form.caption}
                  onChange={(e) => setForm((f) => ({ ...f, caption: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 min-h-[72px]"
                  placeholder="Body copy like a Facebook post…"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Image URL</label>
                <input
                  type="text"
                  value={form.imageUrl}
                  onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2"
                  placeholder="https://... or /uploads/..."
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Advertiser avatar URL (optional)</label>
                <input
                  type="text"
                  value={form.advertiserAvatar}
                  onChange={(e) => setForm((f) => ({ ...f, advertiserAvatar: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2"
                  placeholder="/qwertymates-q-mark-official.png"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Video URL (optional)</label>
                <input
                  type="text"
                  value={form.videoUrl}
                  onChange={(e) => setForm((f) => ({ ...f, videoUrl: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2"
                  placeholder="https://...mp4"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Card description (optional)</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2"
                  placeholder="Subtitle under card title"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">CTA button label</label>
                <input
                  type="text"
                  value={form.ctaLabel}
                  onChange={(e) => setForm((f) => ({ ...f, ctaLabel: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2"
                  placeholder="Learn more"
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
                <label htmlFor="active" className="text-sm text-slate-700">
                  Active
                </label>
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
