'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Loader2, UserCircle, Package, ArrowRight } from 'lucide-react';

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [selectedRole, setSelectedRole] = useState<'client' | 'runner' | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
      return;
    }

    if (!loading && user) {
      const roles = Array.isArray(user.role) ? user.role : [user.role];
      
      // Admin users go to admin dashboard
      if (roles.includes('admin') || roles.includes('superadmin')) {
        router.push('/admin');
        return;
      }

      // If user has only one role, redirect to that dashboard
      if (roles.length === 1) {
        if (roles[0] === 'client') {
          router.push('/dashboard/client');
        } else if (roles[0] === 'runner') {
          router.push('/dashboard/runner');
        }
        return;
      }

      // If user has multiple roles, show role selector (don't auto-redirect)
      // User will select their role below
    }
  }, [user, loading, router]);

  const handleRoleSelect = (role: 'client' | 'runner') => {
    console.log(`Selecting role: ${role}, navigating to /dashboard/${role}`);
    setSelectedRole(role);
    // Use native navigation as fallback
    window.location.href = `/dashboard/${role}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-sky-50 via-blue-50 to-white">
        <div className="relative p-6 bg-white/80 backdrop-blur-lg border border-slate-100 rounded-2xl shadow-xl">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_20%,rgba(59,130,246,0.12),transparent_45%),radial-gradient(circle_at_80%_0%,rgba(14,165,233,0.12),transparent_40%)]" />
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      </div>
    );
  }

  if (!user) return null;

  const roles = Array.isArray(user.role) ? user.role : [user.role];
  const hasBothRoles = roles.includes('client') && roles.includes('runner');
  
  console.log('Dashboard page - user:', user);
  console.log('Dashboard page - roles:', roles);
  console.log('Dashboard page - hasBothRoles:', hasBothRoles);

  // Only show role selector if user has both client and runner roles
  if (!hasBothRoles) {
    console.log('User does not have both roles, returning null');
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-sky-50 via-blue-50 to-white px-4">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -left-10 -top-24 h-72 w-72 rounded-full bg-gradient-to-br from-sky-200/60 to-blue-300/40 blur-3xl" />
        <div className="absolute right-[-6rem] top-6 h-80 w-80 rounded-full bg-gradient-to-tr from-cyan-200/60 via-blue-200/45 to-indigo-200/50 blur-3xl" />
      </div>

      <div className="relative z-10 max-w-2xl w-full">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">Welcome back, {user.name}!</h1>
          <p className="text-slate-600">Choose how you'd like to use Morongwa today</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <button
            onClick={() => handleRoleSelect('client')}
            className="cursor-pointer group relative bg-white rounded-2xl p-8 shadow-xl border border-slate-100 hover:border-blue-200 transition-all hover:scale-105 hover:shadow-2xl"
          >
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-blue-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative">
              <UserCircle className="h-16 w-16 text-blue-600 mb-4 mx-auto" />
              <h2 className="text-2xl font-bold text-slate-900 mb-2">Client Dashboard</h2>
              <p className="text-slate-600 mb-4">Post tasks, manage your errands, and track progress</p>
              <div className="flex items-center justify-center text-blue-600 font-semibold">
                Continue as Client
                <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </button>

          <button
            onClick={() => handleRoleSelect('runner')}
            className="cursor-pointer group relative bg-white rounded-2xl p-8 shadow-xl border border-slate-100 hover:border-emerald-200 transition-all hover:scale-105 hover:shadow-2xl"
          >
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-emerald-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative">
              <Package className="h-16 w-16 text-emerald-600 mb-4 mx-auto" />
              <h2 className="text-2xl font-bold text-slate-900 mb-2">Runner Dashboard</h2>
              <p className="text-slate-600 mb-4">Browse available tasks, earn money, and build your reputation</p>
              <div className="flex items-center justify-center text-emerald-600 font-semibold">
                Continue as Runner
                <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </button>
        </div>

        <p className="text-center text-sm text-slate-500 mt-6">
          You can switch between roles anytime from your profile settings
        </p>
      </div>
    </div>
  );
}
