'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { adminAPI } from '@/lib/api';
import { SUPPORT_MAIN_CATEGORY_OPTIONS } from '@/lib/supportCategories';
import { ArrowLeft, Shield, Loader2, UserPlus, Search, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

/** Keep aligned with `backend/src/data/models/AdminPermission.ts` ADMIN_SECTION_SLUGS */
const SECTION_OPTIONS: { slug: string; label: string }[] = [
  { slug: 'tv_posts', label: 'QwertyTV posts' },
  { slug: 'tv_comments', label: 'QwertyTV comments' },
  { slug: 'tv_reports', label: 'QwertyTV reports' },
  { slug: 'products', label: 'Load Products (catalog)' },
  { slug: 'product_uploads', label: 'Product uploads & import' },
  { slug: 'suppliers', label: 'Suppliers / verification' },
  { slug: 'supplier_uploads', label: 'Supplier applications & uploads' },
  { slug: 'dropshipping', label: 'Dropshipping (CJ / EPROLO)' },
  { slug: 'stores', label: 'Stores' },
  { slug: 'users', label: 'Manage users' },
  { slug: 'orders', label: 'Marketplace orders' },
  { slug: 'tasks', label: 'Manage tasks' },
  { slug: 'support', label: 'Support tickets' },
  { slug: 'policies', label: 'Policies' },
  { slug: 'merchant_agents', label: 'Merchant agents' },
  { slug: 'adverts', label: 'Adverts (slots)' },
  { slug: 'product_enquiries', label: 'Product enquiries' },
  { slug: 'money_metrics', label: 'Money metrics' },
  { slug: 'sponsored_video', label: 'Sponsored video' },
  { slug: 'web_advertising', label: 'Web advertising' },
  { slug: 'music_sound_library', label: 'Music sounds (QwertyTV)' },
  { slug: 'artist_accounts', label: 'Artist accounts' },
  { slug: 'runner_applications', label: 'Runner applications' },
  { slug: 'tuckshop_cash_agents', label: 'Tuckshop cash agents' },
  { slug: 'fraud_registration', label: 'Registration fraud signals' },
  { slug: 'tv_channel', label: 'QwertyTV linear channel' },
  { slug: 'country_profiles', label: 'Country operations' },
  { slug: 'live_streaming', label: 'Live streaming' },
  { slug: 'messages_dm', label: 'Direct messages' },
  { slug: 'user_broadcast', label: 'Message users (broadcast)' },
  { slug: 'landing_backgrounds', label: 'Landing backgrounds' },
  { slug: 'reseller_stats', label: 'Reseller stats' },
  { slug: 'escrows', label: 'Escrow & ledger' },
];

const SECTION_SLUG_SET = new Set(SECTION_OPTIONS.map((o) => o.slug));

/** Match backend `isProbableEmailLookup` — `@handle` is never treated as email. */
function isProbableEmailLookup(raw: string): boolean {
  const t = String(raw || '').trim();
  if (!t) return false;
  if (/^@[^@\s]+$/.test(t)) return false;
  const at = t.indexOf('@');
  if (at <= 0 || at >= t.length - 1) return false;
  return t.slice(at + 1).includes('.');
}

type AdminMode = 'create' | 'promote';

type PreviewUser = { _id: string; name?: string; email?: string; username?: string; roles?: string[] };

const emptyForm = () => ({
  mode: 'create' as AdminMode,
  email: '',
  name: '',
  password: '',
  lookup: '',
  sections: [] as string[],
  supportCategories: [] as string[],
});

export default function AdminAdminsPage() {
  const [admins, setAdmins] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewUser, setPreviewUser] = useState<PreviewUser | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const loadAdmins = async () => {
    setLoading(true);
    try {
      const res = await adminAPI.getAdmins();
      const data = res.data?.data ?? res.data ?? [];
      setAdmins(Array.isArray(data) ? data : []);
    } catch (e: any) {
      if (e.response?.status === 403) toast.error('Only super-admin can view admins');
      else toast.error('Failed to load admins');
      setAdmins([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAdmins();
  }, []);

  const sectionLabel = (slug: string) => SECTION_OPTIONS.find((o) => o.slug === slug)?.label || slug.replace(/_/g, ' ');

  const runPreview = async () => {
    const raw = form.lookup.trim();
    if (!raw) {
      toast.error('Enter @username or email');
      return;
    }
    setPreviewLoading(true);
    setPreviewUser(null);
    try {
      const params = isProbableEmailLookup(raw) ? { email: raw.toLowerCase() } : { username: raw };
      const res = await adminAPI.previewAdminGrantUser(params);
      const u = res.data?.data;
      if (u?._id) {
        setPreviewUser(u);
        toast.success('User found');
      } else {
        toast.error('Unexpected preview response');
      }
    } catch (e: any) {
      if (e.response?.status === 404) toast.error('User not found');
      else toast.error(e.response?.data?.message || 'Preview failed');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.sections.length === 0) {
      toast.error('Select at least one section');
      return;
    }
    const supportPayload = form.sections.includes('support') ? form.supportCategories : [];

    if (form.mode === 'promote') {
      const raw = form.lookup.trim();
      if (!raw) {
        toast.error('Enter @username or email');
        return;
      }
      setCreating(true);
      try {
        await adminAPI.createAdmin({
          promoteExisting: true,
          ...(isProbableEmailLookup(raw) ? { email: raw.toLowerCase() } : { username: raw }),
          sections: form.sections.filter((s) => SECTION_SLUG_SET.has(s)),
          supportCategories: supportPayload,
        });
        toast.success('Admin access granted or updated');
        setShowCreate(false);
        setForm(emptyForm());
        setPreviewUser(null);
        loadAdmins();
      } catch (e: any) {
        toast.error(e.response?.data?.message || 'Failed to grant admin');
      } finally {
        setCreating(false);
      }
      return;
    }

    if (!form.email?.trim() || !form.name?.trim() || !form.password?.trim()) {
      toast.error('Email, name and password required');
      return;
    }
    setCreating(true);
    try {
      await adminAPI.createAdmin({
        email: form.email.trim(),
        name: form.name.trim(),
        password: form.password,
        sections: form.sections.filter((s) => SECTION_SLUG_SET.has(s)),
        supportCategories: supportPayload,
      });
      toast.success('Admin created');
      setShowCreate(false);
      setForm(emptyForm());
      setPreviewUser(null);
      loadAdmins();
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Failed to create admin');
    } finally {
      setCreating(false);
    }
  };

  const toggleSection = (s: string) => {
    setForm((f) => ({
      ...f,
      sections: f.sections.includes(s) ? f.sections.filter((x) => x !== s) : [...f.sections, s],
      supportCategories: s === 'support' && !f.sections.includes(s) ? [] : f.supportCategories,
    }));
  };

  const toggleSupportCategory = (c: string) => {
    setForm((f) => ({
      ...f,
      supportCategories: f.supportCategories.includes(c) ? f.supportCategories.filter((x) => x !== c) : [...f.supportCategories, c],
    }));
  };

  const openModal = () => {
    setForm(emptyForm());
    setPreviewUser(null);
    setShowCreate(true);
  };

  const closeModal = () => {
    setShowCreate(false);
    setForm(emptyForm());
    setPreviewUser(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-sky-100 text-slate-800">
      <header className="border-b border-white/60 bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
          <div className="flex items-center gap-4">
            <Link
              href="/admin"
              className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="flex items-center gap-3">
              <Shield className="h-8 w-8 text-sky-600" />
              <div>
                <h1 className="text-xl font-semibold text-slate-900">Create admins</h1>
                <p className="text-sm text-slate-500">
                  Super-admin: create new admin accounts or grant dashboard sections to an existing user
                </p>
              </div>
            </div>
          </div>
          <button
            onClick={openModal}
            className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-4 py-2 text-white font-medium hover:bg-sky-600"
          >
            <UserPlus className="h-5 w-5" />
            Add or grant admin
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-10 w-10 animate-spin text-sky-600" />
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-4 py-3 font-medium text-slate-700">Admin</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-700">Sections</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-700 w-36">Actions</th>
                </tr>
              </thead>
              <tbody>
                {admins.map((a) => (
                  <tr key={a._id} className="border-b border-slate-100">
                    <td className="px-4 py-3">
                      {a.userId?.username ? (
                        <p className="font-medium text-slate-900">@{a.userId.username}</p>
                      ) : (
                        <p className="font-medium text-slate-900">{a.userId?.name || '—'}</p>
                      )}
                      <p className="text-sm text-slate-500">{a.userId?.email}</p>
                      {a.userId?.username && a.userId?.name ? (
                        <p className="text-xs text-slate-400">{a.userId.name}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(a.sections || []).map((s: string) => (
                          <span key={s} className="px-2 py-0.5 rounded bg-sky-100 text-sky-800 text-xs" title={s}>
                            {sectionLabel(s)}
                          </span>
                        ))}
                        {(!a.sections || a.sections.length === 0) && (
                          <span className="text-slate-400 text-sm">No sections</span>
                        )}
                      </div>
                      {a.sections?.includes('support') && (a.supportCategories?.length ?? 0) > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          <span className="text-xs text-slate-500">Support:</span>
                          {(a.supportCategories || []).map((c: string) => (
                            <span key={c} className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 text-xs">
                              {c}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right align-top">
                      {a.userId?._id ? (
                        <button
                          type="button"
                          disabled={revokingId !== null}
                          onClick={async () => {
                            const uid = String(a.userId._id);
                            if (
                              !confirm(
                                'Revoke admin for this user? Their AdminPermission row will be removed and the admin role stripped (they stay as a normal user).'
                              )
                            )
                              return;
                            setRevokingId(uid);
                            try {
                              await adminAPI.revokeAdmin(uid);
                              toast.success('Admin access revoked');
                              await loadAdmins();
                            } catch (e: any) {
                              toast.error(e.response?.data?.message || 'Failed to revoke admin');
                            } finally {
                              setRevokingId(null);
                            }
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                        >
                          {revokingId === String(a.userId._id) ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                          Revoke
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {admins.length === 0 && (
              <div className="p-12 text-center text-slate-500">No delegated admins yet</div>
            )}
          </div>
        )}

        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-2xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Add or grant admin</h2>

              <div className="flex rounded-xl border border-slate-200 p-1 bg-slate-50 mb-6">
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, mode: 'create', lookup: '', sections: f.sections }))}
                  className={`flex-1 rounded-lg py-2 text-sm font-medium ${
                    form.mode === 'create' ? 'bg-white shadow text-slate-900' : 'text-slate-600'
                  }`}
                >
                  Create new account
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setForm((f) => ({ ...f, mode: 'promote', email: '', name: '', password: '', sections: f.sections }))
                  }
                  className={`flex-1 rounded-lg py-2 text-sm font-medium ${
                    form.mode === 'promote' ? 'bg-white shadow text-slate-900' : 'text-slate-600'
                  }`}
                >
                  Grant to existing user
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {form.mode === 'create' ? (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                      <input
                        type="email"
                        value={form.email}
                        onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200"
                        required={form.mode === 'create'}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
                      <input
                        type="text"
                        value={form.name}
                        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200"
                        required={form.mode === 'create'}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
                      <input
                        type="password"
                        value={form.password}
                        onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200"
                        required={form.mode === 'create'}
                      />
                    </div>
                  </>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Username or email</label>
                    <p className="text-xs text-slate-500 mb-2">Example: @cinamadisha or their login email.</p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={form.lookup}
                        onChange={(e) => {
                          setForm((f) => ({ ...f, lookup: e.target.value }));
                          setPreviewUser(null);
                        }}
                        placeholder="@username or email"
                        className="flex-1 px-3 py-2 rounded-xl border border-slate-200"
                      />
                      <button
                        type="button"
                        onClick={runPreview}
                        disabled={previewLoading}
                        className="inline-flex items-center gap-2 shrink-0 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        {previewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                        Look up
                      </button>
                    </div>
                    {previewUser && (
                      <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-sm text-emerald-900">
                        <p className="font-medium">{previewUser.name || '—'}</p>
                        <p className="text-emerald-800/90">{previewUser.email}</p>
                        {previewUser.username ? <p>@{previewUser.username}</p> : null}
                        <p className="text-xs text-emerald-700 mt-1">Roles: {(previewUser.roles || []).join(', ') || 'client'}</p>
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Sections to moderate</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1 rounded-xl border border-slate-100 p-3 bg-slate-50/50">
                    {SECTION_OPTIONS.map(({ slug, label }) => (
                      <label key={slug} className="flex items-start gap-2 cursor-pointer rounded-lg p-1 hover:bg-white">
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={form.sections.includes(slug)}
                          onChange={() => toggleSection(slug)}
                        />
                        <span className="text-sm text-slate-700 leading-snug">{label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {form.sections.includes('support') && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Support ticket categories (leave empty = all)</label>
                    <p className="text-xs text-slate-500 mb-2">Assign which support categories this admin can handle.</p>
                    <div className="flex flex-wrap gap-2">
                      {SUPPORT_MAIN_CATEGORY_OPTIONS.map((c) => (
                        <label key={c.value} className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={form.supportCategories.includes(c.value)}
                            onChange={() => toggleSupportCategory(c.value)}
                          />
                          <span className="text-sm text-slate-700">{c.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-3 pt-4">
                  <button type="button" onClick={closeModal} className="flex-1 px-4 py-2 rounded-xl border border-slate-200 text-slate-700">
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creating}
                    className="flex-1 px-4 py-2 rounded-xl bg-sky-500 text-white font-medium disabled:opacity-50"
                  >
                    {creating ? 'Saving…' : form.mode === 'promote' ? 'Grant / update access' : 'Create admin'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
