'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { adminAPI, API_BASE } from '@/lib/api';
import toast from 'react-hot-toast';
import { ArrowLeft, Loader2, Store, CheckCircle, XCircle, AlertTriangle, RefreshCw } from 'lucide-react';

interface RegistrationRow {
  _id: string;
  status?: string;
  commissionAmountZar?: number;
  tuckshopName?: string;
  ownerDetails?: string;
  address?: string;
  tuckshopContactPhone?: string;
  preferredPaymentMethod?: string;
  photoPath?: string;
  waPhoneDigits?: string;
  commissionNote?: string;
  rejectionReason?: string;
  registrationKind?: string;
  applicantIdPassport?: string;
  proofOfResidencePath?: string;
  companyCertificatePath?: string;
  locationLatitude?: number;
  locationLongitude?: number;
  fraudFlags?: string[];
  fraudRiskScore?: number;
  fraudScanAt?: string;
  fraudScanError?: string;
  registrationIncentiveDisplay?: string;
  createdAt?: string;
  reviewedAt?: string;
  applicantUser?: { name?: string; username?: string; phone?: string; email?: string };
}

function photoSrc(path?: string): string {
  const p = String(path || '').trim();
  if (!p) return '';
  if (/^https?:\/\//i.test(p)) return p;
  const base = String(API_BASE || '').replace(/\/$/, '');
  const rel = p.startsWith('/') ? p : `/${p}`;
  return `${base}${rel}`;
}

export default function AdminTuckshopCashAgentsPage() {
  const [rows, setRows] = useState<RegistrationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [actionId, setActionId] = useState<string | null>(null);

  const fetchRows = async () => {
    try {
      const res = await adminAPI.getTuckshopCashAgentRegistrations({
        status: statusFilter === 'all' ? 'all' : statusFilter,
      });
      const list = res.data?.data ?? [];
      setRows(Array.isArray(list) ? list : []);
    } catch {
      toast.error('Failed to load tuckshop registrations');
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchRows();
  }, [statusFilter]);

  const approve = async (id: string) => {
    const commissionNote = window.prompt('Optional commission / internal note (leave blank to skip):') ?? '';
    const amtStr = window.prompt('Commission amount logged (ZAR, for earnings dashboard — use 0 if none):', '0') ?? '0';
    const commissionAmountZar = Math.max(0, Math.round((Number(String(amtStr).replace(/,/g, '')) || 0) * 100) / 100);
    setActionId(id);
    try {
      await adminAPI.approveTuckshopCashAgent(id, {
        ...(commissionNote.trim() ? { commissionNote: commissionNote.trim() } : {}),
        commissionAmountZar,
      });
      toast.success('Approved — applicant notified on WhatsApp');
      fetchRows();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || e?.response?.data?.error || 'Approve failed');
    } finally {
      setActionId(null);
    }
  };

  const rescanFraud = async (id: string) => {
    setActionId(id);
    try {
      await adminAPI.rescanTuckshopRegistrationFraud(id);
      toast.success('Fraud signals refreshed');
      fetchRows();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || e?.response?.data?.error || 'Rescan failed');
    } finally {
      setActionId(null);
    }
  };

  const reject = async (id: string) => {
    const reason = window.prompt('Rejection reason (optional):') ?? '';
    setActionId(id);
    try {
      await adminAPI.rejectTuckshopCashAgent(id, reason.trim() ? { reason: reason.trim() } : {});
      toast.success('Rejected — applicant notified on WhatsApp');
      fetchRows();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || e?.response?.data?.error || 'Reject failed');
    } finally {
      setActionId(null);
    }
  };

  return (
    <ProtectedRoute allowedRoles={['admin', 'superadmin']}>
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-sky-50 text-slate-800">
        <header className="border-b border-white/60 bg-white/70 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
            <div>
              <p className="text-xs uppercase tracking-widest text-emerald-700">Qwertymates</p>
              <h1 className="mt-1 flex items-center gap-2 text-3xl font-semibold text-slate-900">
                <Store className="h-8 w-8 text-emerald-600" />
                Tuckshop cash agents
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                WhatsApp option 9 — Register Cash Agent. Location must be a verified WhatsApp GPS pin (not typed-only) so
                agents are routed to the real tuckshop; review pin + photo before approving.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/admin/fraud-registration-exceptions"
                className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900 shadow-sm hover:bg-amber-100"
              >
                <AlertTriangle className="h-4 w-4" /> Fraud signals report
              </Link>
              <Link
                href="/admin"
                className="inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:shadow-md"
              >
                <ArrowLeft className="h-4 w-4" /> Back to admin
              </Link>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-6 py-8">
          <div className="mb-6 flex flex-wrap gap-2">
            {['pending', 'approved', 'rejected', 'all'].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`rounded-lg px-4 py-2 text-sm font-medium capitalize ${
                  statusFilter === s ? 'bg-emerald-600 text-white' : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          <div className="overflow-hidden rounded-2xl border border-white/60 bg-white/80 shadow-xl shadow-emerald-50 backdrop-blur">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-10 w-10 animate-spin text-emerald-600" />
              </div>
            ) : rows.length === 0 ? (
              <div className="py-16 text-center text-slate-500">No registrations found.</div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {rows.map((r) => {
                  const img = photoSrc(r.photoPath);
                  const proofImg = photoSrc(r.proofOfResidencePath);
                  const certImg = photoSrc(r.companyCertificatePath);
                  const busy = actionId === r._id;
                  const fraudScore = typeof r.fraudRiskScore === 'number' ? r.fraudRiskScore : 0;
                  const fraudList = Array.isArray(r.fraudFlags) ? r.fraudFlags : [];
                  const kindLabel =
                    r.registrationKind === 'individual'
                      ? 'Individual'
                      : r.registrationKind === 'company'
                        ? 'Company'
                        : r.registrationKind === 'legacy'
                          ? 'Legacy'
                          : r.registrationKind || '—';
                  return (
                    <li key={r._id} className="p-5 hover:bg-white/90">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold uppercase text-slate-600">
                              {r.status || '—'}
                            </span>
                            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold uppercase text-sky-800">
                              {kindLabel}
                            </span>
                            <span className="text-xs text-slate-500">
                              {r.createdAt ? new Date(r.createdAt).toLocaleString() : ''}
                            </span>
                            {fraudList.length > 0 && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                                <AlertTriangle className="h-3.5 w-3.5" />
                                Risk {fraudScore}
                              </span>
                            )}
                          </div>
                          {r.registrationIncentiveDisplay && (
                            <p className="text-xs text-slate-600">
                              <span className="font-semibold text-slate-800">Payout reference:</span>{' '}
                              {r.registrationIncentiveDisplay}
                            </p>
                          )}
                          {fraudList.length > 0 && (
                            <p className="text-xs text-amber-900">
                              <span className="font-semibold">Fraud flags:</span> {fraudList.join(', ')}
                            </p>
                          )}
                          {r.fraudScanError && (
                            <p className="text-xs text-red-700">
                              <span className="font-semibold">Scan error:</span> {r.fraudScanError}
                            </p>
                          )}
                          <p className="text-lg font-semibold text-slate-900">{r.tuckshopName || '—'}</p>
                          {r.applicantIdPassport && (
                            <p className="text-sm text-slate-700">
                              <span className="font-medium text-slate-900">ID / Passport:</span> {r.applicantIdPassport}
                            </p>
                          )}
                          <p className="text-sm text-slate-700">
                            <span className="font-medium text-slate-900">Owner:</span> {r.ownerDetails || '—'}
                          </p>
                          <p className="text-sm text-slate-700">
                            <span className="font-medium text-slate-900">Address:</span> {r.address || '—'}
                          </p>
                          {typeof r.locationLatitude === 'number' &&
                            typeof r.locationLongitude === 'number' &&
                            Number.isFinite(r.locationLatitude) &&
                            Number.isFinite(r.locationLongitude) && (
                              <p className="text-sm text-slate-700">
                                <span className="font-medium text-slate-900">Verified GPS pin:</span>{' '}
                                <a
                                  href={`https://www.google.com/maps?q=${r.locationLatitude},${r.locationLongitude}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="font-semibold text-sky-700 underline hover:text-sky-900"
                                >
                                  Open in Google Maps
                                </a>
                                <span className="text-slate-500">
                                  {' '}
                                  ({r.locationLatitude.toFixed(6)}, {r.locationLongitude.toFixed(6)})
                                </span>
                              </p>
                            )}
                          <p className="text-sm text-slate-700">
                            <span className="font-medium text-slate-900">Tuckshop phone:</span> {r.tuckshopContactPhone || '—'}
                          </p>
                          <p className="text-sm text-slate-700">
                            <span className="font-medium text-slate-900">WA submitter:</span> +{r.waPhoneDigits || '—'}
                          </p>
                          <p className="text-sm text-slate-700">
                            <span className="font-medium text-slate-900">Payment:</span> {r.preferredPaymentMethod || '—'}
                          </p>
                          {typeof r.commissionAmountZar === 'number' && r.commissionAmountZar > 0 && (
                            <p className="text-sm text-emerald-800">
                              <span className="font-medium text-slate-900">Commission (ZAR):</span> R{r.commissionAmountZar.toFixed(2)}
                            </p>
                          )}
                          {(r.applicantUser?.username || r.applicantUser?.name) && (
                            <p className="text-xs text-slate-500">
                              Account: {r.applicantUser?.name || ''}{' '}
                              {r.applicantUser?.username ? `@${r.applicantUser.username}` : ''}
                            </p>
                          )}
                          {r.commissionNote && (
                            <p className="text-xs text-emerald-800">
                              <span className="font-semibold">Commission note:</span> {r.commissionNote}
                            </p>
                          )}
                          {r.rejectionReason && (
                            <p className="text-xs text-red-700">
                              <span className="font-semibold">Rejection:</span> {r.rejectionReason}
                            </p>
                          )}
                          {(proofImg || certImg) && (
                            <div className="flex flex-wrap gap-3 pt-1 text-xs">
                              {proofImg ? (
                                <a
                                  href={proofImg}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="font-semibold text-emerald-700 underline hover:text-emerald-900"
                                >
                                  Proof of residence
                                </a>
                              ) : null}
                              {certImg ? (
                                <a
                                  href={certImg}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="font-semibold text-emerald-700 underline hover:text-emerald-900"
                                >
                                  Company certificate
                                </a>
                              ) : null}
                            </div>
                          )}
                        </div>
                        <div className="flex w-full shrink-0 flex-col gap-3 lg:w-72">
                          {img ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={img} alt="Tuckshop" className="max-h-56 w-full rounded-xl border border-slate-200 object-cover" />
                          ) : (
                            <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-slate-200 text-xs text-slate-400">
                              No photo path
                            </div>
                          )}
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => rescanFraud(r._id)}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                          >
                            <RefreshCw className="h-4 w-4" />
                            Rescan fraud signals
                          </button>
                          {r.status === 'pending' && (
                            <div className="flex gap-2">
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => approve(r._id)}
                                className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                              >
                                <CheckCircle className="h-4 w-4" />
                                Approve
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => reject(r._id)}
                                className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                              >
                                <XCircle className="h-4 w-4" />
                                Reject
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
