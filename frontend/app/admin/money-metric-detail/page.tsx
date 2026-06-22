'use client';

import { Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { adminAPI } from '@/lib/api';

const VALID_METRICS = [
  'wallet_float',
  'paygate_successful',
  'direct_disbursed',
  'direct_pending',
  'money_requests_paid',
  'money_requests_pending',
  'admin_paygate_fee',
  'expected_fee',
] as const;

type MetricKey = (typeof VALID_METRICS)[number];

function isMetric(s: string | null): s is MetricKey {
  return !!s && (VALID_METRICS as readonly string[]).includes(s);
}

function fmtZar(n: unknown) {
  const x = Number(n);
  if (!Number.isFinite(x)) return '—';
  return `R${x.toFixed(2)}`;
}

function fmtDate(v: unknown) {
  if (v == null || v === '') return '—';
  const d = new Date(v as string);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString();
}

function formatColumnLabel(key: string) {
  if (key === 'userId') return 'User ID';
  if (key === 'walletId') return 'Wallet ID';
  if (key === 'impliedFee') return 'Flat fee (row)';
  return key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function MoneyMetricDetailInner() {
  const searchParams = useSearchParams();
  const metricParam = searchParams.get('metric');
  const metric = isMetric(metricParam) ? metricParam : null;

  const [page, setPage] = useState(1);
  const limit = 50;
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<{
    label?: string;
    hint?: string;
    total?: number;
    items?: Record<string, unknown>[];
    warning?: string;
    configuredFlatFee?: number;
  } | null>(null);

  useEffect(() => {
    setPage(1);
  }, [metric]);

  const load = useCallback(async () => {
    if (!metric) return;
    setLoading(true);
    try {
      const res = await adminAPI.getMoneyMetricDetail({ metric, page, limit });
      const raw = res.data as { data?: typeof data } & typeof data;
      const payload = (raw?.data ?? raw) as NonNullable<typeof data>;
      setData(payload);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string; message?: string } }; message?: string };
      toast.error(err.response?.data?.error || err.response?.data?.message || err.message || 'Failed to load');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [metric, page, limit]);

  useEffect(() => {
    if (metric) void load();
  }, [metric, page, load]);

  const total = Number(data?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const columns = useMemo(() => {
    if (!metric || !data?.items?.length) return [] as { key: string; label: string }[];
    const sample = data.items[0];
    const order: Record<MetricKey, string[]> = {
      wallet_float: ['balance', 'name', 'email', 'username', 'userId', 'walletId'],
      paygate_successful: ['createdAt', 'amount', 'reference', 'status', 'directWalletSend', 'userName', 'userEmail', 'userId'],
      direct_disbursed: ['createdAt', 'amount', 'reference', 'status', 'userName', 'userEmail', 'userId'],
      direct_pending: ['createdAt', 'amount', 'reference', 'status', 'userName', 'userEmail', 'userId'],
      money_requests_paid: ['amount', 'status', 'fromName', 'fromEmail', 'toName', 'toEmail', 'paidAt', 'createdAt', 'id'],
      money_requests_pending: ['amount', 'status', 'fromName', 'fromEmail', 'toName', 'toEmail', 'expiresAt', 'createdAt', 'id'],
      admin_paygate_fee: ['createdAt', 'amount', 'reference', 'type'],
      expected_fee: ['createdAt', 'amount', 'impliedFee', 'reference', 'status', 'userName', 'userEmail', 'userId'],
    };
    const preferred = order[metric];
    const keys = preferred.filter((k) => k in sample);
    const rest = Object.keys(sample).filter((k) => !keys.includes(k));
    return [...keys, ...rest].map((key) => ({ key, label: formatColumnLabel(key) }));
  }, [metric, data?.items]);

  if (!metric) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <Link href="/admin" className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-sky-700 hover:text-sky-900">
          <ArrowLeft className="h-4 w-4" />
          Admin home
        </Link>
        <div className="rounded-2xl border border-amber-100 bg-amber-50/90 p-6 text-amber-900">
          <p className="font-semibold">Missing or invalid metric</p>
          <p className="mt-2 text-sm">Open this page from a Money metrics card on the admin dashboard (or add ?metric=wallet_float).</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-sky-100 text-slate-800">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <Link href="/admin" className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-sky-700 hover:text-sky-900">
          <ArrowLeft className="h-4 w-4" />
          Admin home
        </Link>

        <div className="mb-6">
          <p className="text-xs uppercase tracking-[0.35em] text-sky-600">Finance</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">{data?.label ?? 'Money metric detail'}</h1>
          {data?.hint ? <p className="mt-2 text-sm text-slate-600">{data.hint}</p> : null}
          {data?.warning ? <p className="mt-2 text-sm text-amber-800">{data.warning}</p> : null}
          {metric === 'expected_fee' && data?.configuredFlatFee != null ? (
            <p className="mt-2 text-sm text-slate-600">
              Configured flat fee per successful PayGate tx: <span className="font-semibold">{fmtZar(data.configuredFlatFee)}</span>
            </p>
          ) : null}
        </div>

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-600">
            {total} row{total === 1 ? '' : 's'} · page {page} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
              Prev
            </button>
            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => p + 1)}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-40"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-white/60 bg-white/90 shadow-lg">
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
            </div>
          ) : !data?.items?.length ? (
            <p className="py-12 text-center text-slate-600">No rows for this metric.</p>
          ) : (
            <table className="min-w-full divide-y divide-slate-100 text-left text-sm">
              <thead className="bg-slate-50/90">
                <tr>
                  {columns.map((c) => (
                    <th key={c.key} className="whitespace-nowrap px-4 py-3 font-semibold text-slate-700">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((row, i) => (
                  <tr key={i} className="hover:bg-sky-50/40">
                    {columns.map((c) => {
                      const v = row[c.key];
                      let cell: ReactNode;
                      if (c.key === 'balance' || c.key === 'amount' || c.key === 'impliedFee') cell = fmtZar(v);
                      else if (c.key === 'createdAt' || c.key === 'updatedAt' || c.key === 'paidAt' || c.key === 'expiresAt')
                        cell = fmtDate(v);
                      else if (typeof v === 'boolean') cell = v ? 'yes' : 'no';
                      else if (v == null) cell = '—';
                      else cell = String(v);
                      return (
                        <td key={c.key} className="whitespace-nowrap px-4 py-2 text-slate-800">
                          {cell}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AdminMoneyMetricDetailPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'superadmin']}>
      <Suspense
        fallback={
          <div className="flex min-h-[40vh] items-center justify-center bg-gradient-to-br from-sky-50 via-white to-sky-100">
            <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
          </div>
        }
      >
        <MoneyMetricDetailInner />
      </Suspense>
    </ProtectedRoute>
  );
}
