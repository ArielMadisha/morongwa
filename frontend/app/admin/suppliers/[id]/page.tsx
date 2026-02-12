'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { adminAPI } from '@/lib/api';
import Link from 'next/link';
import { ArrowLeft, Building2, User, Loader2, CheckCircle, XCircle, Mail, Phone, FileText } from 'lucide-react';
import toast from 'react-hot-toast';

interface SupplierDetail {
  _id: string;
  userId: { name?: string; email?: string };
  status: string;
  type: string;
  storeName?: string;
  pickupAddress?: string;
  companyRegNo?: string;
  directorsIdDoc?: string;
  idDocument?: string;
  contactEmail?: string;
  contactPhone?: string;
  verificationFee?: number;
  verificationFeeWaived?: boolean;
  appliedAt?: string;
  reviewedAt?: string;
  rejectionReason?: string;
}

export default function AdminSupplierDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [supplier, setSupplier] = useState<SupplierDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [rejectReason, setRejectReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!id) return;
    adminAPI.getSupplier(id).then((res) => setSupplier(res.data?.data ?? res.data ?? null)).catch(() => setSupplier(null)).finally(() => setLoading(false));
  }, [id]);

  const handleApprove = async () => {
    if (!confirm('Approve this supplier? They will be able to list products.')) return;
    setSubmitting(true);
    try {
      await adminAPI.approveSupplier(id);
      toast.success('Supplier approved');
      setSupplier((s) => (s ? { ...s, status: 'approved' } : null));
    } catch (e: any) {
      toast.error(e.response?.data?.message ?? 'Failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    setSubmitting(true);
    try {
      await adminAPI.rejectSupplier(id, rejectReason);
      toast.success('Supplier rejected');
      setSupplier((s) => (s ? { ...s, status: 'rejected', rejectionReason: rejectReason } : null));
    } catch (e: any) {
      toast.error(e.response?.data?.message ?? 'Failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !supplier) {
    return (
      <ProtectedRoute allowedRoles={['admin', 'superadmin']}>
        <div className="min-h-screen flex items-center justify-center">
          {loading ? <Loader2 className="h-10 w-10 animate-spin text-sky-600" /> : <p className="text-slate-600">Supplier not found</p>}
        </div>
      </ProtectedRoute>
    );
  }

  const isPending = supplier.status === 'pending';

  return (
    <ProtectedRoute allowedRoles={['admin', 'superadmin']}>
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-sky-100 text-slate-800">
        <header className="border-b border-white/60 bg-white/70 backdrop-blur">
          <div className="mx-auto max-w-4xl px-6 py-6">
            <Link href="/admin/suppliers" className="inline-flex items-center gap-2 text-sky-600 hover:text-sky-700 text-sm font-medium mb-4">
              <ArrowLeft className="h-4 w-4" /> Back to suppliers
            </Link>
            <div className="flex items-center gap-3">
              {supplier.type === 'company' ? <Building2 className="h-10 w-10 text-sky-600" /> : <User className="h-10 w-10 text-sky-600" />}
              <div>
                <h1 className="text-2xl font-semibold text-slate-900">{supplier.userId?.name ?? 'Supplier'}</h1>
                <p className="text-slate-600">{supplier.userId?.email} · {supplier.type === 'company' ? 'Company' : 'Individual'}</p>
                <p className="text-sm text-slate-500 capitalize mt-1">Status: {supplier.status}</p>
              </div>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-4xl px-6 py-8">
          <div className="rounded-2xl border border-white/60 bg-white/80 shadow-xl shadow-sky-50 backdrop-blur p-6 space-y-6">
            <section>
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Contact details</h2>
              <div className="flex flex-wrap gap-4">
                <span className="flex items-center gap-2 text-slate-700"><Mail className="h-4 w-4" /> {supplier.contactEmail ?? '—'}</span>
                <span className="flex items-center gap-2 text-slate-700"><Phone className="h-4 w-4" /> {supplier.contactPhone ?? '—'}</span>
              </div>
            </section>

            {supplier.type === 'company' && (
              <section>
                <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Company</h2>
                <ul className="space-y-2 text-slate-700">
                  <li><strong>Company reg no:</strong> {supplier.companyRegNo ?? '—'}</li>
                  <li><strong>Directors ID document:</strong> {supplier.directorsIdDoc ? <span className="text-sky-600">{supplier.directorsIdDoc}</span> : '—'}</li>
                  {supplier.storeName && <li><strong>Store name:</strong> {supplier.storeName}</li>}
                </ul>
              </section>
            )}

            {supplier.type === 'individual' && (
              <section>
                <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Individual</h2>
                <ul className="space-y-2 text-slate-700">
                  <li><strong>ID document:</strong> {supplier.idDocument ? <span className="text-sky-600">{supplier.idDocument}</span> : '—'}</li>
                  {supplier.storeName && <li><strong>Store name:</strong> {supplier.storeName}</li>}
                </ul>
              </section>
            )}

            {(supplier.pickupAddress || supplier.verificationFee != null || supplier.verificationFeeWaived) && (
              <section>
                <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Other</h2>
                <ul className="space-y-2 text-slate-700">
                  {supplier.pickupAddress && <li><strong>Pickup address:</strong> {supplier.pickupAddress}</li>}
                  {supplier.verificationFee != null && <li><strong>Verification fee:</strong> R{supplier.verificationFee} (for future use)</li>}
                  {supplier.verificationFeeWaived && <li><strong>Verification fee waived:</strong> Yes</li>}
                </ul>
              </section>
            )}

            {supplier.rejectionReason && (
              <section>
                <h2 className="text-sm font-semibold text-red-600 uppercase tracking-wider mb-2">Rejection reason</h2>
                <p className="text-slate-700">{supplier.rejectionReason}</p>
              </section>
            )}

            {isPending && (
              <section className="pt-6 border-t border-slate-100">
                <h2 className="text-sm font-semibold text-slate-700 mb-3">Actions</h2>
                <div className="flex flex-wrap gap-4">
                  <button type="button" onClick={handleApprove} disabled={submitting} className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-white font-medium hover:bg-green-700 disabled:opacity-50">
                    <CheckCircle className="h-4 w-4" /> Approve
                  </button>
                  <div className="flex items-center gap-2">
                    <input type="text" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Rejection reason (optional)" className="rounded-lg border border-slate-200 px-3 py-2 text-sm w-64" />
                    <button type="button" onClick={handleReject} disabled={submitting} className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-white font-medium hover:bg-red-700 disabled:opacity-50">
                      <XCircle className="h-4 w-4" /> Reject
                    </button>
                  </div>
                </div>
              </section>
            )}
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
