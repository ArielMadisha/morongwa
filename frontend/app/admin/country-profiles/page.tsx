'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Loader2,
  Globe2,
  Copy,
  Check,
  Plus,
  Trash2,
  MessageCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { adminAPI } from '@/lib/api';

type Row = {
  _id: string;
  countryCode: string;
  countryName: string;
  whatsappNumber?: string;
  whatsappLabel?: string;
  whatsappNumber2?: string;
  whatsappLabel2?: string;
  macgyverWaTwilioPool1?: string;
  macgyverWaTwilioPool2?: string;
  currencyCode: string;
  supportNotes?: string;
  sortOrder: number;
  active: boolean;
};

/** MacGyver WhatsApp-only outbound credential bucket (main Qwertymates bot routing unchanged). */
const MACGYVER_POOL_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Default for this line (line 1 → WA API; line 2 → Subaccount A when #2 is set)' },
  { value: 'wa_api', label: 'WhatsApp API pool (TWILIO_WA_* / parent fallback)' },
  { value: 'twilio_parent', label: 'Parent Twilio (TWILIO_ACCOUNT_SID)' },
  { value: 'twilio_subaccount', label: 'Subaccount A (TWILIO_SUBACCOUNT_SID)' },
  {
    value: 'twilio_subaccount_b',
    label: 'Subaccount B (TWILIO_SUBACCOUNT_B_SID or TWILIO_MACGYVER_SUBACCOUNT_SID)',
  },
];

function waMeHref(e164: string): string | null {
  const d = String(e164 || '').replace(/\D/g, '');
  if (d.length < 8) return null;
  return `https://wa.me/${d}`;
}

export default function AdminCountryProfilesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    countryCode: '',
    countryName: '',
    whatsappNumber: '',
    whatsappLabel: '',
    whatsappNumber2: '',
    whatsappLabel2: '',
    macgyverWaTwilioPool1: '',
    macgyverWaTwilioPool2: '',
    currencyCode: 'USD',
    supportNotes: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminAPI.getCountryProfiles();
      const data = (res.data as { data?: Row[] })?.data ?? [];
      setRows(Array.isArray(data) ? data : []);
    } catch {
      toast.error('Failed to load country profiles');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const copyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
      toast.success('Copied');
    } catch {
      toast.error('Could not copy');
    }
  };

  const patchRow = async (code: string, patch: Record<string, unknown>) => {
    setSaving(code);
    try {
      await adminAPI.patchCountryProfile(code, patch);
      await load();
      toast.success('Saved');
    } catch (e: unknown) {
      const msg =
        typeof e === 'object' && e !== null && 'response' in e
          ? (e as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast.error(msg || 'Save failed');
    } finally {
      setSaving(null);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = createForm.countryCode.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(code)) {
      toast.error('Country code must be 2 letters (e.g. ZM)');
      return;
    }
    if (!createForm.countryName.trim()) {
      toast.error('Country name is required');
      return;
    }
    setSaving('new');
    try {
      await adminAPI.createCountryProfile({
        countryCode: code,
        countryName: createForm.countryName.trim(),
        whatsappNumber: createForm.whatsappNumber.trim() || undefined,
        whatsappLabel: createForm.whatsappLabel.trim() || undefined,
        whatsappNumber2: createForm.whatsappNumber2.trim() || undefined,
        whatsappLabel2: createForm.whatsappLabel2.trim() || undefined,
        macgyverWaTwilioPool1: createForm.macgyverWaTwilioPool1.trim() || undefined,
        macgyverWaTwilioPool2: createForm.macgyverWaTwilioPool2.trim() || undefined,
        currencyCode: createForm.currencyCode.trim().toUpperCase() || undefined,
        supportNotes: createForm.supportNotes.trim() || undefined,
      });
      toast.success('Country added');
      setCreateOpen(false);
      setCreateForm({
        countryCode: '',
        countryName: '',
        whatsappNumber: '',
        whatsappLabel: '',
        whatsappNumber2: '',
        whatsappLabel2: '',
        macgyverWaTwilioPool1: '',
        macgyverWaTwilioPool2: '',
        currencyCode: 'USD',
        supportNotes: '',
      });
      await load();
    } catch (err: unknown) {
      const msg =
        typeof err === 'object' && err !== null && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast.error(msg || 'Could not add country');
    } finally {
      setSaving(null);
    }
  };

  const handleDelete = async (r: Row) => {
    if (!confirm(`Remove country profile ${r.countryCode}?`)) return;
    setSaving(r.countryCode);
    try {
      await adminAPI.deleteCountryProfile(r.countryCode);
      await load();
      toast.success('Removed');
    } catch {
      toast.error('Delete failed');
    } finally {
      setSaving(null);
    }
  };

  return (
    <ProtectedRoute allowedRoles={['admin', 'superadmin']}>
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-sky-50 text-slate-800">
        <header className="border-b border-white/60 bg-white/80 backdrop-blur">
          <div className="mx-auto flex max-w-5xl flex-col gap-4 px-6 py-6 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-widest text-emerald-600">Qwertymates · Admin</p>
              <h1 className="mt-1 flex items-center gap-2 text-3xl font-semibold text-slate-900">
                <Globe2 className="h-8 w-8 text-emerald-600" aria-hidden />
                Country operations
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-600">
                One card per territory (e.g. <strong>ZAR / +27</strong> and <strong>BWP / +267</strong>, plus future lines
                like Lesotho) so ops can steer users to the <strong>right national WhatsApp</strong>, keep escalation
                notes, and see currency at a glance. You can register a <strong>second WhatsApp line per country</strong>{' '}
                for <strong>MacGyver WhatsApp replies only</strong>, each mapped to a Twilio credential bucket (parent,
                subaccount A/B, or WA API pool).{' '}
                <strong>Main Qwertymates bot routing</strong> still follows Twilio + backend env (
                <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs">TWILIO_WHATSAPP_FROM</code>
                , Botswana/Lesotho vars, optional{' '}
                <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs">TWILIO_WA_REGIONAL_SENDERS_JSON</code>
                ).
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-700"
              >
                <Plus className="h-4 w-4" />
                Add country
              </button>
              <Link
                href="/admin/support"
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:shadow"
              >
                Support tickets
              </Link>
              <Link
                href="/admin"
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:shadow"
              >
                <ArrowLeft className="h-4 w-4" /> Admin home
              </Link>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-5xl px-6 py-8">
          {loading ? (
            <div className="flex justify-center py-24">
              <Loader2 className="h-12 w-12 animate-spin text-emerald-500" />
            </div>
          ) : (
            <div className="space-y-4">
              {rows.map((r) => {
                const wa = waMeHref(r.whatsappNumber || '');
                const wa2 = waMeHref(r.whatsappNumber2 || '');
                return (
                  <div
                    key={r._id}
                    className="rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          {r.countryCode} · {r.active ? 'Active' : 'Hidden'}
                        </p>
                        <h2 className="text-xl font-semibold text-slate-900">{r.countryName}</h2>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void patchRow(r.countryCode, { active: !r.active })}
                          disabled={saving === r.countryCode}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
                        >
                          {r.active ? 'Deactivate' : 'Activate'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(r)}
                          disabled={saving === r.countryCode}
                          className="rounded-lg border border-rose-200 p-1.5 text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                          title="Delete profile"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="text-xs font-medium text-slate-500">Display name</label>
                        <input
                          defaultValue={r.countryName}
                          key={`name-${r._id}-${r.countryName}`}
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            if (v && v !== r.countryName) void patchRow(r.countryCode, { countryName: v });
                          }}
                          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-500">Currency (ISO 4217)</label>
                        <input
                          defaultValue={r.currencyCode}
                          key={`cur-${r._id}-${r.currencyCode}`}
                          onBlur={(e) => {
                            const v = e.target.value.trim().toUpperCase();
                            if (/^[A-Z]{3}$/.test(v) && v !== r.currencyCode) void patchRow(r.countryCode, { currencyCode: v });
                          }}
                          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono uppercase"
                          maxLength={3}
                        />
                      </div>
                      <div>
                        <label className="flex items-center gap-1 text-xs font-medium text-slate-500">
                          <MessageCircle className="h-3 w-3" /> WhatsApp line 1 (E.164)
                        </label>
                        <input
                          defaultValue={r.whatsappNumber || ''}
                          key={`wa-${r._id}-${r.whatsappNumber}`}
                          placeholder="+27123456789"
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            if (v !== (r.whatsappNumber || '')) void patchRow(r.countryCode, { whatsappNumber: v });
                          }}
                          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono"
                        />
                        <div className="mt-2 flex flex-wrap gap-2">
                          {r.whatsappNumber ? (
                            <>
                              <button
                                type="button"
                                onClick={() => void copyText(`wa-${r.countryCode}`, r.whatsappNumber || '')}
                                className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-xs font-medium text-slate-800 hover:bg-slate-200"
                              >
                                {copied === `wa-${r.countryCode}` ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                                Copy number
                              </button>
                              {wa ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => void copyText(`wame-${r.countryCode}`, wa)}
                                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-900 hover:bg-emerald-200"
                                  >
                                    Copy wa.me
                                  </button>
                                  <a
                                    href={wa}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                                  >
                                    Open WhatsApp
                                  </a>
                                </>
                              ) : null}
                            </>
                          ) : (
                            <span className="text-xs text-amber-700">Set a number for quick links.</span>
                          )}
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-500">WhatsApp line 1 label</label>
                        <input
                          defaultValue={r.whatsappLabel || ''}
                          key={`lbl-${r._id}-${r.whatsappLabel}`}
                          placeholder="e.g. RSA disputes line"
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            if (v !== (r.whatsappLabel || '')) void patchRow(r.countryCode, { whatsappLabel: v || '' });
                          }}
                          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="text-xs font-medium text-slate-500">
                          MacGyver Twilio pool — line 1 (WhatsApp replies only)
                        </label>
                        <select
                          defaultValue={r.macgyverWaTwilioPool1 || ''}
                          key={`pool1-${r._id}-${r.macgyverWaTwilioPool1 || ''}`}
                          disabled={saving === r.countryCode}
                          onChange={(e) =>
                            void patchRow(r.countryCode, { macgyverWaTwilioPool1: e.target.value || '' })
                          }
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                        >
                          {MACGYVER_POOL_OPTIONS.map((o) => (
                            <option key={o.value || 'default'} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="flex items-center gap-1 text-xs font-medium text-slate-500">
                          <MessageCircle className="h-3 w-3" /> WhatsApp line 2 — MacGyver (E.164)
                        </label>
                        <input
                          defaultValue={r.whatsappNumber2 || ''}
                          key={`wa2-${r._id}-${r.whatsappNumber2 || ''}`}
                          placeholder="+267… second approved sender"
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            if (v !== (r.whatsappNumber2 || '')) void patchRow(r.countryCode, { whatsappNumber2: v });
                          }}
                          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono"
                        />
                        <div className="mt-2 flex flex-wrap gap-2">
                          {r.whatsappNumber2 ? (
                            <>
                              <button
                                type="button"
                                onClick={() => void copyText(`wa2-${r.countryCode}`, r.whatsappNumber2 || '')}
                                className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-xs font-medium text-slate-800 hover:bg-slate-200"
                              >
                                {copied === `wa2-${r.countryCode}` ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                                Copy line 2
                              </button>
                              {wa2 ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => void copyText(`wame2-${r.countryCode}`, wa2)}
                                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-900 hover:bg-emerald-200"
                                  >
                                    Copy wa.me (2)
                                  </button>
                                  <a
                                    href={wa2}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                                  >
                                    Open WhatsApp (2)
                                  </a>
                                </>
                              ) : null}
                            </>
                          ) : (
                            <span className="text-xs text-slate-500">Optional — second MacGyver sender.</span>
                          )}
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-500">WhatsApp line 2 label</label>
                        <input
                          defaultValue={r.whatsappLabel2 || ''}
                          key={`lbl2-${r._id}-${r.whatsappLabel2 || ''}`}
                          placeholder="e.g. MacGyver alternate line"
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            if (v !== (r.whatsappLabel2 || '')) void patchRow(r.countryCode, { whatsappLabel2: v || '' });
                          }}
                          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="text-xs font-medium text-slate-500">
                          MacGyver Twilio pool — line 2 (WhatsApp replies only)
                        </label>
                        <select
                          defaultValue={r.macgyverWaTwilioPool2 || ''}
                          key={`pool2-${r._id}-${r.macgyverWaTwilioPool2 || ''}`}
                          disabled={saving === r.countryCode}
                          onChange={(e) =>
                            void patchRow(r.countryCode, { macgyverWaTwilioPool2: e.target.value || '' })
                          }
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                        >
                          {MACGYVER_POOL_OPTIONS.map((o) => (
                            <option key={`${o.value}-l2`} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="sm:col-span-2">
                        <label className="text-xs font-medium text-slate-500">Support / dispute notes (internal)</label>
                        <textarea
                          defaultValue={r.supportNotes || ''}
                          key={`notes-${r._id}`}
                          rows={2}
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            if (v !== (r.supportNotes || '')) void patchRow(r.countryCode, { supportNotes: v || '' });
                          }}
                          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-500">Sort order</label>
                        <input
                          type="number"
                          defaultValue={r.sortOrder}
                          key={`sort-${r._id}-${r.sortOrder}`}
                          onBlur={(e) => {
                            const n = Number(e.target.value);
                            if (Number.isFinite(n) && n !== r.sortOrder) void patchRow(r.countryCode, { sortOrder: n });
                          }}
                          className="mt-1 w-32 rounded-xl border border-slate-200 px-3 py-2 text-sm"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>

        {createOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
              <h3 className="text-lg font-semibold text-slate-900">Add country</h3>
              <p className="mt-1 text-sm text-slate-600">ISO country code + currency. WhatsApp can be filled later.</p>
              <form onSubmit={handleCreate} className="mt-4 space-y-3">
                <div>
                  <label className="text-xs font-medium text-slate-600">Country code (2 letters)</label>
                  <input
                    value={createForm.countryCode}
                    onChange={(e) => setCreateForm((f) => ({ ...f, countryCode: e.target.value.toUpperCase().slice(0, 2) }))}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm uppercase"
                    maxLength={2}
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">Country name</label>
                  <input
                    value={createForm.countryName}
                    onChange={(e) => setCreateForm((f) => ({ ...f, countryName: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">Currency (ISO 4217)</label>
                  <input
                    value={createForm.currencyCode}
                    onChange={(e) => setCreateForm((f) => ({ ...f, currencyCode: e.target.value.toUpperCase().slice(0, 3) }))}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm uppercase"
                    maxLength={3}
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">WhatsApp line 1 (E.164)</label>
                  <input
                    value={createForm.whatsappNumber}
                    onChange={(e) => setCreateForm((f) => ({ ...f, whatsappNumber: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm"
                    placeholder="+260…"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">Line 1 label</label>
                  <input
                    value={createForm.whatsappLabel}
                    onChange={(e) => setCreateForm((f) => ({ ...f, whatsappLabel: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">MacGyver pool — line 1</label>
                  <select
                    value={createForm.macgyverWaTwilioPool1}
                    onChange={(e) => setCreateForm((f) => ({ ...f, macgyverWaTwilioPool1: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    {MACGYVER_POOL_OPTIONS.map((o) => (
                      <option key={o.value || 'def'} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">WhatsApp line 2 — MacGyver (optional)</label>
                  <input
                    value={createForm.whatsappNumber2}
                    onChange={(e) => setCreateForm((f) => ({ ...f, whatsappNumber2: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm"
                    placeholder="Second approved sender"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">Line 2 label</label>
                  <input
                    value={createForm.whatsappLabel2}
                    onChange={(e) => setCreateForm((f) => ({ ...f, whatsappLabel2: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">MacGyver pool — line 2</label>
                  <select
                    value={createForm.macgyverWaTwilioPool2}
                    onChange={(e) => setCreateForm((f) => ({ ...f, macgyverWaTwilioPool2: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    {MACGYVER_POOL_OPTIONS.map((o) => (
                      <option key={`${o.value}-c`} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">Notes</label>
                  <textarea
                    value={createForm.supportNotes}
                    onChange={(e) => setCreateForm((f) => ({ ...f, supportNotes: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    rows={2}
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setCreateOpen(false)}
                    className="flex-1 rounded-xl border border-slate-200 py-2 text-sm font-medium text-slate-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving === 'new'}
                    className="flex-1 rounded-xl bg-emerald-600 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {saving === 'new' ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Create'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
