'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Shield, FileCheck, Car, AlertCircle, ArrowRight, CheckCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import SiteHeader from '@/components/SiteHeader';
import { authAPI } from '@/lib/api';
import toast from 'react-hot-toast';

const RUNNER_REQUIREMENTS = [
  {
    icon: FileCheck,
    title: 'Valid driver\'s licence with PDP',
    desc: 'Professional Driving Permit (PrDP) required for transporting goods and passengers.',
  },
  {
    icon: Shield,
    title: 'Clear criminal record',
    desc: 'Obtain a police clearance certificate from our recommended supplier. You pay directly; results are shared with admin.',
    supplierLink: '/support', // Recommended supplier - contact support for details
  },
  {
    icon: Car,
    title: 'Vehicle inspection (CarScan)',
    desc: 'Automated vehicle inspection report via CarScan or similar. Results shared with admin.',
  },
];

function RunnerApplyContent() {
  const { user, refreshUser } = useAuth();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const hasRunnerRole = user?.role && (Array.isArray(user.role) ? user.role.includes('runner') : user.role === 'runner');

  const handleApply = async () => {
    setSubmitting(true);
    try {
      await authAPI.requestRunnerRole();
      await refreshUser();
      toast.success('Runner application submitted. Complete verification for admin approval.');
      router.push('/dashboard/runner');
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Failed to apply';
      if (msg.toLowerCase().includes('already')) {
        router.push('/dashboard/runner');
        return;
      }
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (hasRunnerRole) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-blue-50 to-white">
        <SiteHeader />
        <main className="max-w-2xl mx-auto px-4 py-16 text-center">
          <CheckCircle className="h-16 w-16 text-emerald-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-slate-900">You&apos;re a runner</h1>
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
          <p className="text-slate-600 mt-2">Complete these requirements (Bolt-style verification) to accept tasks and earn.</p>

          <div className="mt-8 space-y-6">
            {RUNNER_REQUIREMENTS.map((req) => (
              <div key={req.title} className="flex gap-4 p-4 rounded-xl border border-slate-100 bg-slate-50/50">
                <div className="shrink-0 w-12 h-12 rounded-xl bg-sky-100 flex items-center justify-center">
                  <req.icon className="h-6 w-6 text-sky-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900">{req.title}</h3>
                  <p className="text-sm text-slate-600 mt-1">{req.desc}</p>
                  {req.supplierLink && (
                    <Link href={req.supplierLink} className="text-sm text-sky-600 hover:underline mt-2 inline-block">
                      View recommended supplier →
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 p-4 rounded-xl bg-amber-50 border border-amber-200 flex gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">
              Verification is automated where possible. Criminal record and vehicle inspection results will be shared with admin for review.
            </p>
          </div>

          <div className="mt-8 flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleApply}
              disabled={submitting}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-sky-600 text-white rounded-xl font-semibold hover:bg-sky-700 disabled:opacity-50"
            >
              {submitting ? 'Submitting...' : 'Start runner application'}
              <ArrowRight className="h-5 w-5" />
            </button>
            <Link
              href="/wall"
              className="px-6 py-3 border border-slate-200 rounded-xl font-medium text-slate-700 hover:bg-slate-50 text-center"
            >
              Cancel
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
