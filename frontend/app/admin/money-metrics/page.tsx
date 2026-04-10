'use client';

import { useCallback, useMemo, useState } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { adminAPI } from '@/lib/api';
import Link from 'next/link';
import { ArrowLeft, Download, Loader2, TrendingUp } from 'lucide-react';
import toast from 'react-hot-toast';

type MoneyMetricsResponse = {
  period: { from: string; to: string };
  totalRevenue: number;
  moneyMetrics: {
    paygate: Record<string, number>;
    directWalletSend: Record<string, number>;
    wallet: Record<string, number>;
    moneyRequests: Record<string, number>;
    adminCommission: Record<string, number>;
  };
};

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

/** Local calendar date YYYY-MM-DD */
function toYmd(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseYmd(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const da = Number(m[3]);
  const dt = new Date(y, mo - 1, da);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== da) return null;
  return dt;
}

function startOfLocalDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function endOfLocalDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function flattenForCsv(obj: unknown, prefix = ''): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  if (obj === null || obj === undefined) {
    out[prefix || 'value'] = obj as null;
    return out;
  }
  if (typeof obj !== 'object' || Array.isArray(obj)) {
    out[prefix || 'value'] = obj as string | number | boolean;
    return out;
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(out, flattenForCsv(v, key));
    } else {
      out[key] = v as string | number | boolean | null;
    }
  }
  return out;
}

function buildCsv(rows: Record<string, string | number | boolean | null>[]) {
  const keys = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const header = keys.join(',');
  const line = (row: Record<string, string | number | boolean | null>) =>
    keys.map((k) => esc(row[k])).join(',');
  return [header, ...rows.map(line)].join('\r\n');
}

function MoneyMetricsPageInner() {
  const todayYmd = useMemo(() => toYmd(new Date()), []);
  const [preset, setPreset] = useState<'today' | '7d' | '30d' | 'custom'>('7d');
  const [fromYmd, setFromYmd] = useState(() => {
    const t = new Date();
    t.setDate(t.getDate() - 6);
    return toYmd(t);
  });
  const [toYmd, setToYmd] = useState(todayYmd);

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<MoneyMetricsResponse | null>(null);

  const applyPreset = useCallback(
    (p: 'today' | '7d' | '30d' | 'custom') => {
      setPreset(p);
      const now = new Date();
      if (p === 'today') {
        setFromYmd(toYmd(now));
        setToYmd(toYmd(now));
        return;
      }
      if (p === '7d') {
        const start = new Date(now);
        start.setDate(start.getDate() - 6);
        setFromYmd(toYmd(start));
        setToYmd(toYmd(now));
        return;
      }
      if (p === '30d') {
        const start = new Date(now);
        start.setDate(start.getDate() - 29);
        setFromYmd(toYmd(start));
        setToYmd(toYmd(now));
      }
    },
    []
  );

  const load = async () => {
    const a = parseYmd(fromYmd);
    const b = parseYmd(toYmd);
    if (!a || !b) {
      toast.error('Invalid from/to date');
      return;
    }
    if (b.getTime() < a.getTime()) {
      toast.error('End date must be on or after start date');
      return;
    }
    const fromIso = startOfLocalDay(a).toISOString();
    const toIso = endOfLocalDay(b).toISOString();

    setLoading(true);
    try {
      const res = await adminAPI.getMoneyMetrics({ from: fromIso, to: toIso });
      const payload = (res.data?.data ?? res.data) as MoneyMetricsResponse;
      setData(payload);
      toast.success('Metrics loaded');
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string; message?: string } }; message?: string };
      toast.error(err.response?.data?.error || err.response?.data?.message || err.message || 'Failed to load metrics');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const downloadCsv = () => {
    if (!data) {
      toast.error('Load metrics first');
      return;
    }
    const flat = flattenForCsv({
      periodFrom: data.period.from,
      periodTo: data.period.to,
      totalRevenue: data.totalRevenue,
      ...data.moneyMetrics,
    });
    const csv = buildCsv([flat]);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `money-metrics-${fromYmd}_to_${toYmd}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV downloaded');
  };

  const mm = data?.moneyMetrics;

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-sky-100 text-slate-800">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <Link
          href="/admin"
          className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-sky-700 hover:text-sky-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Admin home
        </Link>

        <div className="mb-8 flex items-start gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
            <TrendingUp className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Money metrics</h1>
            <p className="mt-1 text-sm text-slate-600">
              PayGate inflow, wallet activity, direct sends, money requests, and admin fee credits for the selected range.
              Total revenue uses successful PayGate <code className="text-xs">Payment</code> records in the period, with
              fallback to ledger <code className="text-xs">Transaction</code> type <code className="text-xs">payment</code>{' '}
              when needed. Wallet float is the current global total (not limited to the range).
            </p>
          </div>
        </div>

        <div className="mb-8 rounded-2xl border border-white/60 bg-white/90 p-6 shadow-lg">
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                { id: 'today' as const, label: 'Today' },
                { id: '7d' as const, label: '7 days' },
                { id: '30d' as const, label: '30 days' },
                { id: 'custom' as const, label: 'Custom' },
              ] as const
            ).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p.id)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  preset === p.id ? 'bg-sky-600 text-white shadow' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              From
              <input
                type="date"
                value={fromYmd}
                onChange={(e) => {
                  setPreset('custom');
                  setFromYmd(e.target.value);
                }}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              To
              <input
                type="date"
                value={toYmd}
                onChange={(e) => {
                  setPreset('custom');
                  setToYmd(e.target.value);
                }}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
              />
            </label>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="rounded-lg bg-sky-600 px-5 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Load'}
            </button>
            <button
              type="button"
              onClick={downloadCsv}
              disabled={!data}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
          </div>

          {data && (
            <p className="mt-4 text-xs text-slate-500">
              Period (server): {new Date(data.period.from).toLocaleString()} — {new Date(data.period.to).toLocaleString()}
            </p>
          )}
        </div>

        {data && (
          <>
            <div className="mb-6 rounded-2xl border border-emerald-100 bg-emerald-50/80 p-5 shadow-sm">
              <p className="text-xs uppercase tracking-[0.2em] text-emerald-700">Total revenue (period)</p>
              <p className="mt-2 text-3xl font-semibold text-emerald-900">
                R{Number(data.totalRevenue || 0).toFixed(2)}
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {[
                { label: 'Wallet float', value: `R${Number(mm?.wallet?.floatTotal || 0).toFixed(2)}`, sub: 'Current total balances' },
                { label: 'PayGate successful', value: `R${Number(mm?.paygate?.successfulAmount || 0).toFixed(2)}`, sub: `${Number(mm?.paygate?.successfulCount || 0)} tx` },
                { label: 'Direct disbursed', value: `R${Number(mm?.directWalletSend?.successfulAmount || 0).toFixed(2)}`, sub: `${Number(mm?.directWalletSend?.successfulCount || 0)} tx` },
                { label: 'Direct pending', value: `R${Number(mm?.directWalletSend?.pendingAmount || 0).toFixed(2)}`, sub: `${Number(mm?.directWalletSend?.pendingCount || 0)} awaiting` },
                { label: 'Money requests paid', value: `R${Number(mm?.moneyRequests?.paidAmount || 0).toFixed(2)}`, sub: `${Number(mm?.moneyRequests?.paidCount || 0)} requests` },
                { label: 'Money requests pending', value: `R${Number(mm?.moneyRequests?.pendingAmount || 0).toFixed(2)}`, sub: `${Number(mm?.moneyRequests?.pendingCount || 0)} open` },
                { label: 'Admin PayGate fee earned', value: `R${Number(mm?.adminCommission?.paygateFeeCreditsAmount || 0).toFixed(2)}`, sub: `${Number(mm?.adminCommission?.paygateFeeCreditsCount || 0)} credits` },
                { label: 'Expected fee vs successful', value: `R${Number(mm?.adminCommission?.expectedFeeAmountFromSuccessfulPaygate || 0).toFixed(2)}`, sub: `R${Number(mm?.adminCommission?.paygateFlatFee || 0).toFixed(2)} per tx` },
              ].map((card) => (
                <div key={card.label} className="rounded-xl border border-slate-100 bg-white/90 p-4 shadow-sm">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{card.label}</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">{card.value}</p>
                  <p className="mt-1 text-xs font-medium text-sky-700">{card.sub}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function AdminMoneyMetricsPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'superadmin']}>
      <MoneyMetricsPageInner />
    </ProtectedRoute>
  );
}
