'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, ArrowRight, CheckCircle, Home, IdCard, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import SiteHeader from '@/components/SiteHeader';
import { authAPI, usersAPI } from '@/lib/api';
import {
  getRunnerCategoryConfig,
  parseRunnerCategory,
  RUNNER_CATEGORIES,
  type RunnerCategory,
} from '@/lib/runnerCategories';
import { getCitiesForCountry, RUNNER_SERVICE_COUNTRIES } from '@/lib/runnerServiceAreas';
import toast from 'react-hot-toast';

function RunnerApplyContent() {
  const { user, refreshUser } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialCategory = parseRunnerCategory(searchParams.get('type'));
  const [selectedCategory, setSelectedCategory] = useState<RunnerCategory>(initialCategory);
  const [serviceCountry, setServiceCountry] = useState('ZA');
  const [serviceCity, setServiceCity] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [idUploading, setIdUploading] = useState(false);
  const [residenceUploading, setResidenceUploading] = useState(false);
  const [pdpUploading, setPdpUploading] = useState(false);
  const [vehicleUploading, setVehicleUploading] = useState(false);

  const hasRunnerRole = user?.role && (Array.isArray(user.role) ? user.role.includes('runner') : user.role === 'runner');
  const config = getRunnerCategoryConfig(selectedCategory);
  const isStoreParcel = selectedCategory === 'store_parcel';
  const userId = user?._id || user?.id;
  const cityOptions = useMemo(() => getCitiesForCountry(serviceCountry), [serviceCountry]);

  const handleApply = async () => {
    if (isStoreParcel && (!serviceCountry || !serviceCity)) {
      toast.error('Please select your service country and city.');
      return;
    }
    setSubmitting(true);
    try {
      await authAPI.requestRunnerRole({
        runnerCategory: selectedCategory,
        runnerServiceCountry: isStoreParcel ? serviceCountry : undefined,
        runnerServiceCity: isStoreParcel ? serviceCity : undefined,
      });
      await refreshUser();
      toast.success('Application submitted. Upload your verification documents below.');
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Failed to apply';
      if (msg.toLowerCase().includes('already')) {
        await refreshUser();
        return;
      }
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleIdUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    if (!hasRunnerRole) {
      toast.error('Submit your application first, then upload documents.');
      return;
    }
    setIdUploading(true);
    try {
      await usersAPI.uploadRunnerIdDocument(userId, file);
      await refreshUser();
      toast.success('ID document uploaded.');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Upload failed');
    } finally {
      setIdUploading(false);
      e.target.value = '';
    }
  };

  const handleResidenceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    if (!hasRunnerRole) {
      toast.error('Submit your application first, then upload documents.');
      return;
    }
    setResidenceUploading(true);
    try {
      await usersAPI.uploadRunnerProofOfResidence(userId, file);
      await refreshUser();
      toast.success('Proof of residence uploaded.');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Upload failed');
    } finally {
      setResidenceUploading(false);
      e.target.value = '';
    }
  };

  const handlePdpUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    if (!hasRunnerRole) {
      toast.error('Submit your application first, then upload documents.');
      return;
    }
    setPdpUploading(true);
    try {
      await usersAPI.uploadPdp(userId, file);
      await refreshUser();
      toast.success('PDP uploaded.');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Upload failed');
    } finally {
      setPdpUploading(false);
      e.target.value = '';
    }
  };

  const handleVehicleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    if (!hasRunnerRole) {
      toast.error('Submit your application first, then upload documents.');
      return;
    }
    setVehicleUploading(true);
    try {
      await usersAPI.uploadVehicle(userId, {}, [file]);
      await refreshUser();
      toast.success('Vehicle document uploaded.');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Upload failed');
    } finally {
      setVehicleUploading(false);
      e.target.value = '';
    }
  };

  if (hasRunnerRole && user?.runnerVerified) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-blue-50 to-white">
        <SiteHeader />
        <main className="max-w-2xl mx-auto px-4 py-16 text-center">
          <CheckCircle className="h-16 w-16 text-emerald-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-slate-900">You&apos;re a verified runner</h1>
          <p className="text-slate-600 mt-2">Go to the Runner Cockpit to start accepting tasks.</p>
          <Link href="/dashboard/runner" className="inline-flex items-center gap-2 mt-6 px-6 py-3 bg-sky-600 text-white rounded-xl font-medium hover:bg-sky-700">
            Runner Cockpit
            <ArrowRight className="h-5 w-5" />
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-blue-50 to-white text-slate-900">
      <SiteHeader />
      <main className="max-w-2xl mx-auto px-4 py-12">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-8">
          <h1 className="text-2xl font-bold text-slate-900">Become a verified runner</h1>
          <p className="text-slate-600 mt-2">Choose how you want to run errands. Verification requirements differ by category.</p>

          {!hasRunnerRole && (
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {RUNNER_CATEGORIES.map((cat) => {
                const Icon = cat.icon;
                const active = selectedCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`rounded-xl border-2 p-4 text-left transition ${
                      active ? `${cat.border} bg-gradient-to-br ${cat.accent} shadow-sm` : 'border-slate-100 bg-slate-50/50 hover:border-slate-200'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="shrink-0 w-10 h-10 rounded-lg bg-white border border-slate-100 flex items-center justify-center">
                        <Icon className="h-5 w-5 text-sky-600" />
                      </div>
                      <div>
                        <h2 className="font-semibold text-slate-900">{cat.title}</h2>
                        <p className="text-sm text-slate-600 mt-0.5">{cat.summary}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <div className="mt-6 rounded-xl border border-slate-100 bg-slate-50/60 p-4">
            <p className="text-sm font-medium text-slate-800 mb-2">What you&apos;ll do</p>
            <ul className="text-sm text-slate-600 space-y-1 list-disc list-inside">
              {config.duties.map((duty) => (
                <li key={duty}>{duty}</li>
              ))}
            </ul>
          </div>

          {isStoreParcel && !hasRunnerRole && (
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-semibold text-slate-800">Service country</span>
                <select
                  value={serviceCountry}
                  onChange={(e) => {
                    setServiceCountry(e.target.value);
                    setServiceCity('');
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"
                >
                  {RUNNER_SERVICE_COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>{c.name}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-800">Service city / town</span>
                <select
                  value={serviceCity}
                  onChange={(e) => setServiceCity(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"
                  required
                >
                  <option value="">Select city…</option>
                  {cityOptions.map((city) => (
                    <option key={city.id} value={city.id}>{city.name}</option>
                  ))}
                </select>
              </label>
            </div>
          )}

          <div className="mt-8 space-y-4">
            <p className="text-sm font-semibold text-slate-800">Verification — upload documents</p>
            {isStoreParcel ? (
              <>
                <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/50">
                  <div className="flex items-start gap-3">
                    <IdCard className="h-6 w-6 text-sky-600 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <h3 className="font-semibold text-slate-900">ID or passport</h3>
                      <p className="text-sm text-slate-600 mt-1">Government-issued photo ID (PDF or image).</p>
                      {user?.runnerIdDocument ? (
                        <p className="text-sm text-emerald-700 mt-2 flex items-center gap-1">
                          <CheckCircle className="h-4 w-4" /> Uploaded — {user.runnerIdDocument.verified ? 'verified' : 'pending admin review'}
                        </p>
                      ) : (
                        <label className="inline-flex items-center gap-2 mt-3 px-4 py-2 bg-sky-100 text-sky-700 rounded-lg cursor-pointer hover:bg-sky-200 text-sm font-medium">
                          <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={handleIdUpload} disabled={idUploading} className="hidden" />
                          {idUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                          {idUploading ? 'Uploading…' : hasRunnerRole ? 'Upload ID or passport' : 'Upload after applying'}
                        </label>
                      )}
                    </div>
                  </div>
                </div>
                <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/50">
                  <div className="flex items-start gap-3">
                    <Home className="h-6 w-6 text-sky-600 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <h3 className="font-semibold text-slate-900">Proof of residence</h3>
                      <p className="text-sm text-slate-600 mt-1">Utility bill, bank statement, or lease in your name.</p>
                      {user?.runnerProofOfResidence ? (
                        <p className="text-sm text-emerald-700 mt-2 flex items-center gap-1">
                          <CheckCircle className="h-4 w-4" /> Uploaded — {user.runnerProofOfResidence.verified ? 'verified' : 'pending admin review'}
                        </p>
                      ) : (
                        <label className="inline-flex items-center gap-2 mt-3 px-4 py-2 bg-sky-100 text-sky-700 rounded-lg cursor-pointer hover:bg-sky-200 text-sm font-medium">
                          <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={handleResidenceUpload} disabled={residenceUploading} className="hidden" />
                          {residenceUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                          {residenceUploading ? 'Uploading…' : hasRunnerRole ? 'Upload proof of residence' : 'Upload after applying'}
                        </label>
                      )}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/50">
                  <h3 className="font-semibold text-slate-900">Driver&apos;s licence + PDP</h3>
                  <p className="text-sm text-slate-600 mt-1">Upload your Professional Driving Permit (PrDP).</p>
                  {user?.pdp ? (
                    <p className="text-sm text-emerald-700 mt-2 flex items-center gap-1">
                      <CheckCircle className="h-4 w-4" /> PDP uploaded — {user.pdp.verified ? 'verified' : 'pending'}
                    </p>
                  ) : (
                    <label className="inline-flex items-center gap-2 mt-3 px-4 py-2 bg-sky-100 text-sky-700 rounded-lg cursor-pointer hover:bg-sky-200 text-sm font-medium">
                      <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={handlePdpUpload} disabled={pdpUploading} className="hidden" />
                      {pdpUploading ? 'Uploading…' : hasRunnerRole ? 'Upload PDP' : 'Upload after applying'}
                    </label>
                  )}
                </div>
                <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/50">
                  <h3 className="font-semibold text-slate-900">Vehicle inspection</h3>
                  <p className="text-sm text-slate-600 mt-1">Licence + CarScan or similar inspection report.</p>
                  {(user?.vehicles?.length ?? 0) > 0 ? (
                    <p className="text-sm text-emerald-700 mt-2 flex items-center gap-1">
                      <CheckCircle className="h-4 w-4" /> {user?.vehicles?.length} vehicle(s) on file
                    </p>
                  ) : (
                    <label className="inline-flex items-center gap-2 mt-3 px-4 py-2 bg-sky-100 text-sky-700 rounded-lg cursor-pointer hover:bg-sky-200 text-sm font-medium">
                      <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={handleVehicleUpload} disabled={vehicleUploading} className="hidden" />
                      {vehicleUploading ? 'Uploading…' : hasRunnerRole ? 'Upload vehicle documents' : 'Upload after applying'}
                    </label>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="mt-6 p-4 rounded-xl bg-amber-50 border border-amber-200 flex gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">
              {hasRunnerRole
                ? 'Documents appear in Admin → Runners for review. You can also finish uploads in the Runner Cockpit.'
                : 'Submit your application first to unlock document uploads. Admin reviews each category before you can accept tasks.'}
            </p>
          </div>

          <div className="mt-8 flex flex-col sm:flex-row gap-3">
            {!hasRunnerRole ? (
              <button
                onClick={handleApply}
                disabled={submitting}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-sky-600 text-white rounded-xl font-semibold hover:bg-sky-700 disabled:opacity-50"
              >
                {submitting ? 'Submitting...' : `Apply as ${config.title}`}
                <ArrowRight className="h-5 w-5" />
              </button>
            ) : (
              <Link
                href="/dashboard/runner"
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-sky-600 text-white rounded-xl font-semibold hover:bg-sky-700"
              >
                Go to Runner Cockpit
                <ArrowRight className="h-5 w-5" />
              </Link>
            )}
            <Link
              href="/dashboard/runner"
              className="px-6 py-3 border border-slate-200 rounded-xl font-medium text-slate-700 hover:bg-slate-50 text-center"
            >
              {hasRunnerRole ? 'Back' : 'Cancel'}
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function RunnerApplyPage() {
  return (
    <ProtectedRoute>
      <RunnerApplyContent />
    </ProtectedRoute>
  );
}
