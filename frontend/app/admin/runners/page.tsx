'use client';

import { useState, useEffect } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { adminAPI } from '@/lib/api';
import Link from 'next/link';
import { User } from '@/lib/types';
import {
  ArrowLeft,
  Car,
  FileCheck,
  Shield,
  Loader2,
  CheckCircle,
  XCircle,
  ExternalLink,
} from 'lucide-react';
import toast from 'react-hot-toast';

function hasRole(r: any, v: string) {
  return Array.isArray(r) ? r.includes(v) : r === v;
}

function RunnersManagement() {
  const [runners, setRunners] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'verified'>('pending');

  useEffect(() => {
    fetchRunners();
  }, []);

  const fetchRunners = async () => {
    try {
      const response = await adminAPI.getAllUsers({ role: 'runner', limit: 200 });
      const list = response.data?.users ?? response.data ?? [];
      setRunners(Array.isArray(list) ? list : []);
    } catch (error) {
      toast.error('Failed to load runners');
      setRunners([]);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyPdp = async (userId: string) => {
    try {
      await adminAPI.verifyRunnerPdp(userId);
      toast.success('PDP verified');
      fetchRunners();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to verify PDP');
    }
  };

  const handleVerifyVehicle = async (userId: string, vehicleIndex: number) => {
    try {
      await adminAPI.verifyRunnerVehicle(userId, vehicleIndex);
      toast.success('Vehicle verified');
      fetchRunners();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to verify vehicle');
    }
  };

  const filtered = runners.filter((r) => {
    if (filter === 'verified') return r.runnerVerified;
    if (filter === 'pending') return hasRole(r.role, 'runner') && !r.runnerVerified;
    return true;
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-sky-100 text-slate-800">
      <header className="border-b border-white/60 bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-sky-600">Morongwa</p>
            <h1 className="mt-1 text-3xl font-semibold text-slate-900">Runner applications</h1>
            <p className="mt-1 text-sm text-slate-600">Verify PDP and vehicle documents. Pending runners need admin approval.</p>
          </div>
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to admin
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6 flex gap-2">
          {(['pending', 'verified', 'all'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                filter === f
                  ? 'bg-sky-600 text-white shadow-md'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {f === 'pending' ? 'Pending verification' : f === 'verified' ? 'Verified' : 'All runners'}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-slate-100 bg-white/80 p-12 text-center">
            <Car className="mx-auto h-12 w-12 text-slate-300" />
            <p className="mt-4 text-lg font-semibold text-slate-900">
              {filter === 'pending' ? 'No pending runners' : filter === 'verified' ? 'No verified runners yet' : 'No runners'}
            </p>
            <p className="text-sm text-slate-600 mt-1">
              {filter === 'pending' ? 'Runners will appear here when they apply and upload documents.' : ''}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {filtered.map((runner) => (
              <div
                key={runner._id}
                className="rounded-2xl border border-slate-100 bg-white/90 p-6 shadow-lg shadow-sky-50"
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">{runner.name}</h2>
                    <p className="text-sm text-slate-600">{runner.email}</p>
                    <div className="mt-2 flex items-center gap-2">
                      {runner.runnerVerified ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                          <CheckCircle className="h-3 w-3" />
                          Verified
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                          <Shield className="h-3 w-3" />
                          Pending verification
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
                    <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mb-2">
                      <FileCheck className="h-4 w-4 text-sky-600" />
                      PDP (Professional Driving Permit)
                    </h3>
                    {runner.pdp ? (
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {(runner.pdp as any).verified ? (
                            <CheckCircle className="h-5 w-5 text-emerald-600" />
                          ) : (
                            <XCircle className="h-5 w-5 text-amber-500" />
                          )}
                          <span className="text-sm">{(runner.pdp as any).verified ? 'Verified' : 'Pending'}</span>
                          <a
                            href={(runner.pdp as any).path}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sky-600 hover:underline text-sm"
                          >
                            <ExternalLink className="h-4 w-4 inline" />
                          </a>
                        </div>
                        {!(runner.pdp as any).verified && (
                          <button
                            onClick={() => handleVerifyPdp(runner._id)}
                            className="px-3 py-1.5 rounded-lg bg-sky-600 text-white text-xs font-semibold hover:bg-sky-700"
                          >
                            Verify PDP
                          </button>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500">Not uploaded</p>
                    )}
                  </div>

                  <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
                    <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mb-2">
                      <Car className="h-4 w-4 text-sky-600" />
                      Vehicles ({(runner.vehicles?.length ?? 0)})
                    </h3>
                    {runner.vehicles && runner.vehicles.length > 0 ? (
                      <ul className="space-y-2">
                        {runner.vehicles.map((v, idx) => (
                          <li key={idx} className="flex items-center justify-between gap-2 text-sm">
                            <div className="flex items-center gap-2">
                              {v.verified ? (
                                <CheckCircle className="h-4 w-4 text-emerald-600" />
                              ) : (
                                <XCircle className="h-4 w-4 text-amber-500" />
                              )}
                              <span>{v.make || v.model || v.plate || `Vehicle ${idx + 1}`}</span>
                              {v.verified && <span className="text-emerald-600">(verified)</span>}
                            </div>
                            {!v.verified && (
                              <button
                                onClick={() => handleVerifyVehicle(runner._id, idx)}
                                className="px-3 py-1.5 rounded-lg bg-sky-600 text-white text-xs font-semibold hover:bg-sky-700"
                              >
                                Verify
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-slate-500">No vehicles registered</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default function ProtectedRunnersManagement() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'superadmin']}>
      <RunnersManagement />
    </ProtectedRoute>
  );
}
