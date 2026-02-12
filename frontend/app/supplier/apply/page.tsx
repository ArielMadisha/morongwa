'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Building2, User, Loader2, Mail, Phone, FileText, Upload, X } from 'lucide-react';
import { suppliersAPI } from '@/lib/api';
import ProtectedRoute from '@/components/ProtectedRoute';
import SiteHeader from '@/components/SiteHeader';
import toast from 'react-hot-toast';

export default function SupplierApplyPage() {
  const [type, setType] = useState<'company' | 'individual'>('individual');
  const [storeName, setStoreName] = useState('');
  const [pickupAddress, setPickupAddress] = useState('');
  const [companyRegNo, setCompanyRegNo] = useState('');
  const [directorsIdDoc, setDirectorsIdDoc] = useState('');
  const [idDocument, setIdDocument] = useState('');
  const [uploadingId, setUploadingId] = useState(false);
  const [uploadingDirectors, setUploadingDirectors] = useState(false);
  const idInputRef = useRef<HTMLInputElement>(null);
  const directorsInputRef = useRef<HTMLInputElement>(null);
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [verificationFeeWaived, setVerificationFeeWaived] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [existing, setExisting] = useState<{ status: string } | null>(null);

  useEffect(() => {
    suppliersAPI.getMe().then((res) => {
      const data = res.data?.data ?? res.data;
      if (data) {
        setExisting(data);
        setType((data as any).type ?? 'individual');
        setStoreName((data as any).storeName ?? '');
        setContactEmail((data as any).contactEmail ?? '');
        setContactPhone((data as any).contactPhone ?? '');
      }
    }).catch(() => setExisting(null));
  }, []);

  const handleFileUpload = async (file: File, field: 'idDocument' | 'directorsIdDoc') => {
    if (!file || file.size > 10 * 1024 * 1024) {
      toast.error('File must be under 10MB. PDF or image required.');
      return;
    }
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowed.includes(file.type)) {
      toast.error('Please upload a PDF or image (JPEG, PNG, GIF, WebP).');
      return;
    }
    if (field === 'idDocument') {
      setUploadingId(true);
    } else {
      setUploadingDirectors(true);
    }
    try {
      const { data } = await suppliersAPI.uploadDocument(file);
      if (field === 'idDocument') {
        setIdDocument(data.path);
        toast.success('ID document uploaded');
      } else {
        setDirectorsIdDoc(data.path);
        toast.success('Directors ID document uploaded');
      }
    } catch (e: any) {
      toast.error(e.response?.data?.message ?? 'Upload failed');
    } finally {
      if (field === 'idDocument') setUploadingId(false);
      else setUploadingDirectors(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactEmail.trim() || !contactPhone.trim()) {
      toast.error('Contact email and phone are required');
      return;
    }
    if (type === 'company' && (!companyRegNo.trim() || !directorsIdDoc.trim())) {
      toast.error('Company reg no and directors ID document are required for company');
      return;
    }
    if (type === 'individual' && !idDocument.trim()) {
      toast.error('ID document reference is required for individual');
      return;
    }
    setSubmitting(true);
    try {
      await suppliersAPI.apply({
        type,
        storeName: storeName.trim() || undefined,
        pickupAddress: pickupAddress.trim() || undefined,
        companyRegNo: type === 'company' ? companyRegNo.trim() : undefined,
        directorsIdDoc: type === 'company' ? directorsIdDoc.trim() : undefined,
        idDocument: type === 'individual' ? idDocument.trim() : undefined,
        contactEmail: contactEmail.trim(),
        contactPhone: contactPhone.trim(),
        verificationFeeWaived: type === 'individual' ? true : verificationFeeWaived,
      });
      toast.success('Application submitted. We will review and notify you.');
      setExisting({ status: 'pending' });
    } catch (e: any) {
      toast.error(e.response?.data?.message ?? 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-blue-50 to-white text-slate-900">
        <SiteHeader />
        <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <nav className="flex items-center gap-2 text-sm text-slate-600 mb-6">
            <Link href="/marketplace" className="text-sky-600 hover:underline">Marketplace</Link>
            <span>/</span>
            <span className="text-slate-800 font-medium">Become a supplier</span>
          </nav>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Become a supplier / seller</h1>
          <p className="text-slate-600 mb-4">Submit your details for verification. Companies and individuals welcome.</p>

          <div className="mb-8 rounded-xl border border-sky-100 bg-sky-50/50 p-4">
            <p className="text-sm font-semibold text-slate-800 mb-3">How it works</p>
            <ol className="space-y-2 text-sm text-slate-700 list-none">
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-600 text-white text-xs font-bold">1</span>
                <span><strong>Submit application</strong> — Choose individual or company, add contact and documents below.</span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-600 text-white text-xs font-bold">2</span>
                <span><strong>Admin reviews</strong> — We verify your details and approve or reject. You’ll get a supplier store once approved.</span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-600 text-white text-xs font-bold">3</span>
                <span><strong>Add products</strong> — Once approved, use <Link href="/supplier/products" className="text-sky-600 hover:underline font-medium">Add product</Link> to list items on the marketplace.</span>
              </li>
            </ol>
          </div>

          {existing?.status === 'pending' && (
            <div className="mb-6 rounded-xl bg-amber-50 border border-amber-200 p-4 text-amber-800 text-sm">
              Your application is pending review. We will notify you once verified.
            </div>
          )}
          {existing?.status === 'approved' && (
            <div className="mb-6 rounded-xl bg-green-50 border border-green-200 p-4 text-green-800 text-sm flex flex-wrap items-center justify-between gap-2">
              <span>You are an approved supplier. Load products to sell on the marketplace.</span>
              <Link href="/supplier/products" className="font-medium text-green-700 hover:underline whitespace-nowrap">Add product →</Link>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <p className="text-sm font-medium text-slate-700 mb-3">Applicant type</p>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="type" checked={type === 'individual'} onChange={() => setType('individual')} className="text-sky-600" />
                  <User className="h-4 w-4" /> Individual
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="type" checked={type === 'company'} onChange={() => setType('company')} className="text-sky-600" />
                  <Building2 className="h-4 w-4" /> Company
                </label>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Store name (optional)</label>
              <input type="text" value={storeName} onChange={(e) => setStoreName(e.target.value)} className="w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900" placeholder="My Store" />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-2"><Mail className="h-4 w-4" /> Contact email *</label>
              <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} required className="w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900" placeholder="seller@example.com" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-2"><Phone className="h-4 w-4" /> Contact phone *</label>
              <input type="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} required className="w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900" placeholder="+27..." />
            </div>

            {type === 'company' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Company registration number *</label>
                  <input type="text" value={companyRegNo} onChange={(e) => setCompanyRegNo(e.target.value)} required={type === 'company'} className="w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900" placeholder="e.g. 2020/123456/07" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-2"><FileText className="h-4 w-4" /> Directors identification document *</label>
                  <input type="hidden" name="directorsIdDoc" value={directorsIdDoc} />
                  <input ref={directorsInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,application/pdf,image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f, 'directorsIdDoc'); e.target.value = ''; }} />
                  <div className="flex gap-2 items-center">
                    <button type="button" onClick={() => directorsInputRef.current?.click()} disabled={uploadingDirectors} className="flex items-center gap-2 px-4 py-3 rounded-xl border border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 disabled:opacity-50">
                      {uploadingDirectors ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                      {uploadingDirectors ? 'Uploading...' : 'Upload document'}
                    </button>
                    {directorsIdDoc ? (
                      <span className="flex items-center gap-1">
                        <span className="text-sm text-slate-600 truncate max-w-[200px]">{directorsIdDoc.split('/').pop()}</span>
                        <button type="button" onClick={() => setDirectorsIdDoc('')} className="p-1 text-slate-400 hover:text-red-600" aria-label="Remove"><X className="h-4 w-4" /></button>
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">PDF or image (JPEG, PNG), max 10MB</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Verification fee (for future use)</label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={verificationFeeWaived} onChange={(e) => setVerificationFeeWaived(e.target.checked)} />
                    Waive verification fee for now
                  </label>
                </div>
              </>
            )}

            {type === 'individual' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-2"><FileText className="h-4 w-4" /> Seller identification document *</label>
                <input type="hidden" name="idDocument" value={idDocument} />
                <input ref={idInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,application/pdf,image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f, 'idDocument'); e.target.value = ''; }} />
                <div className="flex gap-2 items-center flex-wrap">
                  <button type="button" onClick={() => idInputRef.current?.click()} disabled={uploadingId} className="flex items-center gap-2 px-4 py-3 rounded-xl border border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 disabled:opacity-50">
                    {uploadingId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    {uploadingId ? 'Uploading...' : 'Upload ID document'}
                  </button>
                  {idDocument ? (
                    <span className="flex items-center gap-1">
                      <span className="text-sm text-slate-600 truncate max-w-[200px]">{idDocument.split('/').pop()}</span>
                      <button type="button" onClick={() => setIdDocument('')} className="p-1 text-slate-400 hover:text-red-600" aria-label="Remove"><X className="h-4 w-4" /></button>
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-slate-500">PDF or image (JPEG, PNG), max 10MB. No verification fee for individuals.</p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Pickup address (optional)</label>
              <textarea value={pickupAddress} onChange={(e) => setPickupAddress(e.target.value)} rows={2} className="w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900" placeholder="Address for order pickup" />
            </div>

            <button type="submit" disabled={submitting || existing?.status === 'pending'} className="w-full flex items-center justify-center gap-2 bg-sky-600 text-white py-4 rounded-xl font-semibold hover:bg-sky-700 disabled:opacity-50">
              {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : null} {existing?.status === 'pending' ? 'Application pending' : 'Submit application'}
            </button>
          </form>
        </main>
      </div>
    </ProtectedRoute>
  );
}
