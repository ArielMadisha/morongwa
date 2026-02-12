'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/?signin=1');
      return;
    }
    if (!loading && user) {
      const roles = Array.isArray(user.role) ? user.role : [user.role];
      if (roles.includes('admin') || roles.includes('superadmin')) {
        router.push('/admin');
        return;
      }
      router.push('/wall');
    }
  }, [user, loading, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-sky-50 via-blue-50 to-white">
      <div className="relative p-6 bg-white/80 backdrop-blur-lg border border-slate-100 rounded-2xl shadow-xl">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <p className="mt-2 text-sm text-slate-600">Taking you to your wall...</p>
      </div>
    </div>
  );
}
