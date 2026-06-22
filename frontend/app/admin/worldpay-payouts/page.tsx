'use client';

import { useCallback, useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { adminAPI } from '@/lib/api';
import Link from 'next/link';
import {
  ArrowLeft,
  Globe,
  Loader2,
  Plus,
  Trash2,
  FlaskConical,
} from 'lucide-react';
import toast from 'react-hot-toast';

type Payee = {
  _id: string;
  label: string;
  countryCode: string;
  payeeKind: 'individual' | 'business';
  transactionTypeCode: string;
  bankDetails: Record<string, string | undefined>;
  beneficiaryIndividual?: { firstName?: string; lastName?: string };
  beneficiaryCompany?: { companyName?: string };
  expandableKeyValuePairs?: Record<string, string>;
  active?: boolean;
  lastPayoutTestAt?: string;
  lastPayoutTestHttpStatus?: number;
  lastPayoutTestSummary?: string;
};

function WorldpayPayoutsInner() {
  const [config, setConfig] = useState<{ ready?: boolean; mode?: string; wpApiVersion?: string; phase1Countries?: string[] } | null>(null);
  const [payees, setPayees] = useState<Payee[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [testAmounts, setTestAmounts] = useState<Record<string, string>>({});
  const [lastResponse, setLastResponse] = useState<unknown>(null);

  const [form, setForm] = useState({
    label: '',
    countryCode: 'ZA' as 'ZA' | 'BW' | 'ZM',
    payeeKind: 'individual' as 'individual' | 'business',
    transactionTypeCode: '',
    bankName: '',
    branchCode: '',
    beneficiaryAccountNumber: '',
    iban: '',
    swiftBic: '',
    firstName: '',
    lastName: '',
    companyName: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, p] = await Promise.all([
        adminAPI.getWorldpayAccountPayoutConfig(),
        adminAPI.getWorldpayPayees({ active: true }),
      ]);
      setConfig(c.data);
      const list = (p.data?.data ?? p.data) as Payee[];
      setPayees(Array.isArray(list) ? list : []);
    } catch (e: unknown) {
      const err = e as { response?: { status?: number; data?: { error?: string } } };
      if (err.response?.status === 403) {
        toast.error('Superadmin only');
      } else {
        toast.error(err.response?.data?.error || 'Failed to load');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const submitCreate = async () => {
    if (!form.label.trim() || !form.transactionTypeCode.trim() || !form.bankName.trim()) {
      toast.error('Label, transaction type code, and bank name are required');
      return;
    }
    if (form.payeeKind === 'individual' && (!form.firstName.trim() || !form.lastName.trim())) {
      toast.error('First and last name required for individual');
      return;
    }
    if (form.payeeKind === 'business' && !form.companyName.trim()) {
      toast.error('Company name required for business');
      return;
    }
    if (!form.beneficiaryAccountNumber.trim() && !form.iban.trim()) {
      toast.error('Provide either account number or IBAN');
      return;
    }
    setSaving(true);
    try {
      await adminAPI.createWorldpayPayee({
        label: form.label.trim(),
        countryCode: form.countryCode,
        payeeKind: form.payeeKind,
        transactionTypeCode: form.transactionTypeCode.trim(),
        bankDetails: {
          bankName: form.bankName.trim(),
          branchCode: form.branchCode.trim() || undefined,
          beneficiaryAccountNumber: form.beneficiaryAccountNumber.trim() || undefined,
          iban: form.iban.trim() || undefined,
          swiftBic: form.swiftBic.trim() || undefined,
        },
        beneficiaryIndividual:
          form.payeeKind === 'individual'
            ? { firstName: form.firstName.trim(), lastName: form.lastName.trim() }
            : undefined,
        beneficiaryCompany: form.payeeKind === 'business' ? { companyName: form.companyName.trim() } : undefined,
      });
      toast.success('Payee saved');
      setShowForm(false);
      setForm((f) => ({
        ...f,
        label: '',
        transactionTypeCode: '',
        bankName: '',
        branchCode: '',
        beneficiaryAccountNumber: '',
        iban: '',
        swiftBic: '',
        firstName: '',
        lastName: '',
        companyName: '',
      }));
      void load();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      toast.error(err.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async (id: string) => {
    if (!confirm('Deactivate this payee profile?')) return;
    try {
      await adminAPI.deleteWorldpayPayee(id);
      toast.success('Deactivated');
      void load();
    } catch {
      toast.error('Failed');
    }
  };

  const testPayout = async (id: string) => {
    const raw = testAmounts[id]?.trim();
    const sourceAmount = raw ? Number(raw) : undefined;
    if (raw && (Number.isNaN(sourceAmount) || (sourceAmount != null && sourceAmount <= 0))) {
      toast.error('Enter a positive ZAR source amount or leave empty for default 10.50');
      return;
    }
    setTestingId(id);
    setLastResponse(null);
    try {
      const res = await adminAPI.worldpayTestPayout(id, sourceAmount != null ? { sourceAmount } : {});
      setLastResponse(res.data);
      const http = (res.data as { httpStatus?: number })?.httpStatus;
      if (http != null && http < 400) toast.success(`Worldpay HTTP ${http}`);
      else toast.error(`Worldpay HTTP ${http ?? 'error'}`);
      void load();
    } catch (e: unknown) {
      const err = e as { response?: { data?: unknown; status?: number } };
      setLastResponse(err.response?.data);
      toast.error('Test payout failed');
    } finally {
      setTestingId(null);
    }
  };

  if (loading && !config) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-sky-50 via-white to-sky-100">
        <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-sky-100 text-slate-800">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <Link href="/admin" className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-sky-700 hover:text-sky-900">
          <ArrowLeft className="h-4 w-4" />
          Admin home
        </Link>

        <div className="mb-8 flex items-start gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
            <Globe className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Worldpay payouts</h1>
            <p className="mt-1 text-sm text-slate-600">
              Superadmin: store payee bank profiles (ZA, BW, ZM) and send test payouts via Account Payouts API (Try or Live from{' '}
              <code className="text-xs">WORLDPAY_ACCESS_MODE</code>). Funding currency is ZAR.
            </p>
          </div>
        </div>

        <div className="mb-6 rounded-2xl border border-white/60 bg-white/90 p-5 shadow-lg">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Integration status</p>
          <div className="mt-2 flex flex-wrap gap-4 text-sm">
            <span>
              Ready:{' '}
              <strong className={config?.ready ? 'text-emerald-700' : 'text-amber-700'}>
                {config?.ready ? 'yes' : 'no'}
              </strong>
            </span>
            <span>
              Mode: <strong>{config?.mode ?? '—'}</strong>
            </span>
            <span>
              WP-Api-Version: <strong>{config?.wpApiVersion ?? '—'}</strong>
            </span>
            <span>Countries: {(config?.phase1Countries ?? []).join(', ') || '—'}</span>
          </div>
          {!config?.ready && (
            <p className="mt-3 text-xs text-amber-800">
              Set <code className="text-xs">WORLDPAY_ACCOUNT_PAYOUT_ENABLED=1</code>, Reference ID, Credential, and 6-digit entity
              values in backend <code className="text-xs">.env</code>.
            </p>
          )}
        </div>

        <div className="mb-6 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowForm(!showForm)}
            className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
          >
            <Plus className="h-4 w-4" />
            {showForm ? 'Close form' : 'Add payee'}
          </button>
        </div>

        {showForm && (
          <div className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">New payee</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="text-xs font-medium text-slate-600">
                Label
                <input
                  className="mt-1 w-full rounded border border-slate-200 px-3 py-2 text-sm"
                  value={form.label}
                  onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                />
              </label>
              <label className="text-xs font-medium text-slate-600">
                Country
                <select
                  className="mt-1 w-full rounded border border-slate-200 px-3 py-2 text-sm"
                  value={form.countryCode}
                  onChange={(e) => setForm((f) => ({ ...f, countryCode: e.target.value as 'ZA' | 'BW' | 'ZM' }))}
                >
                  <option value="ZA">South Africa (ZA → ZAR)</option>
                  <option value="BW">Botswana (BW → BWP)</option>
                  <option value="ZM">Zambia (ZM → ZMW)</option>
                </select>
              </label>
              <label className="text-xs font-medium text-slate-600">
                Payee type
                <select
                  className="mt-1 w-full rounded border border-slate-200 px-3 py-2 text-sm"
                  value={form.payeeKind}
                  onChange={(e) => setForm((f) => ({ ...f, payeeKind: e.target.value as 'individual' | 'business' }))}
                >
                  <option value="individual">Individual</option>
                  <option value="business">Registered business</option>
                </select>
              </label>
              <label className="text-xs font-medium text-slate-600">
                transactionTypeCode (from Worldpay onboarding)
                <input
                  className="mt-1 w-full rounded border border-slate-200 px-3 py-2 text-sm font-mono"
                  value={form.transactionTypeCode}
                  onChange={(e) => setForm((f) => ({ ...f, transactionTypeCode: e.target.value }))}
                />
              </label>
              <label className="text-xs font-medium text-slate-600 md:col-span-2">
                Bank name
                <input
                  className="mt-1 w-full rounded border border-slate-200 px-3 py-2 text-sm"
                  value={form.bankName}
                  onChange={(e) => setForm((f) => ({ ...f, bankName: e.target.value }))}
                />
              </label>
              <label className="text-xs font-medium text-slate-600">
                Branch / sort code (optional)
                <input
                  className="mt-1 w-full rounded border border-slate-200 px-3 py-2 text-sm"
                  value={form.branchCode}
                  onChange={(e) => setForm((f) => ({ ...f, branchCode: e.target.value }))}
                />
              </label>
              <label className="text-xs font-medium text-slate-600">
                Account number (or use IBAN)
                <input
                  className="mt-1 w-full rounded border border-slate-200 px-3 py-2 text-sm"
                  value={form.beneficiaryAccountNumber}
                  onChange={(e) => setForm((f) => ({ ...f, beneficiaryAccountNumber: e.target.value }))}
                />
              </label>
              <label className="text-xs font-medium text-slate-600">
                IBAN (optional)
                <input
                  className="mt-1 w-full rounded border border-slate-200 px-3 py-2 text-sm"
                  value={form.iban}
                  onChange={(e) => setForm((f) => ({ ...f, iban: e.target.value }))}
                />
              </label>
              <label className="text-xs font-medium text-slate-600">
                SWIFT/BIC (optional)
                <input
                  className="mt-1 w-full rounded border border-slate-200 px-3 py-2 text-sm"
                  value={form.swiftBic}
                  onChange={(e) => setForm((f) => ({ ...f, swiftBic: e.target.value }))}
                />
              </label>
              {form.payeeKind === 'individual' ? (
                <>
                  <label className="text-xs font-medium text-slate-600">
                    First name
                    <input
                      className="mt-1 w-full rounded border border-slate-200 px-3 py-2 text-sm"
                      value={form.firstName}
                      onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                    />
                  </label>
                  <label className="text-xs font-medium text-slate-600">
                    Last name
                    <input
                      className="mt-1 w-full rounded border border-slate-200 px-3 py-2 text-sm"
                      value={form.lastName}
                      onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                    />
                  </label>
                </>
              ) : (
                <label className="text-xs font-medium text-slate-600 md:col-span-2">
                  Company name
                  <input
                    className="mt-1 w-full rounded border border-slate-200 px-3 py-2 text-sm"
                    value={form.companyName}
                    onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))}
                  />
                </label>
              )}
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={() => void submitCreate()}
              className="mt-4 rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save payee'}
            </button>
          </div>
        )}

        <div className="rounded-2xl border border-white/60 bg-white/90 p-6 shadow-lg">
          <h2 className="text-lg font-semibold text-slate-900">Payees</h2>
          {payees.length === 0 ? (
            <p className="mt-4 text-sm text-slate-600">No payees yet. Add one above.</p>
          ) : (
            <ul className="mt-4 divide-y divide-slate-100">
              {payees.map((p) => (
                <li key={p._id} className="py-4 first:pt-0">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="font-semibold text-slate-900">{p.label}</p>
                      <p className="text-xs text-slate-500">
                        {p.countryCode} · {p.payeeKind} · type {p.transactionTypeCode}
                      </p>
                      <p className="mt-1 text-xs text-slate-600">
                        {p.bankDetails?.bankName}
                        {p.bankDetails?.branchCode ? ` · ${p.bankDetails.branchCode}` : ''}
                      </p>
                      {p.lastPayoutTestAt && (
                        <p className="mt-1 text-xs text-slate-500">
                          Last test: {new Date(p.lastPayoutTestAt).toLocaleString()} · HTTP {p.lastPayoutTestHttpStatus ?? '—'}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="ZAR amount (default 10.50)"
                        className="w-44 rounded border border-slate-200 px-2 py-1 text-sm"
                        value={testAmounts[p._id] ?? ''}
                        onChange={(e) => setTestAmounts((m) => ({ ...m, [p._id]: e.target.value }))}
                      />
                      <button
                        type="button"
                        disabled={testingId === p._id || !config?.ready}
                        onClick={() => void testPayout(p._id)}
                        className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-800 hover:bg-indigo-100 disabled:opacity-50"
                      >
                        {testingId === p._id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <FlaskConical className="h-3 w-3" />
                        )}
                        Test payout
                      </button>
                      <button
                        type="button"
                        onClick={() => void deactivate(p._id)}
                        className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-3 w-3" />
                        Deactivate
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {lastResponse != null && (
          <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-900 p-4 text-left shadow-lg">
            <p className="text-xs font-medium text-slate-400">Last response</p>
            <pre className="mt-2 max-h-96 overflow-auto text-xs text-emerald-100">
              {JSON.stringify(lastResponse, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

export default function WorldpayPayoutsPage() {
  return (
    <ProtectedRoute allowedRoles={['superadmin']}>
      <WorldpayPayoutsInner />
    </ProtectedRoute>
  );
}
