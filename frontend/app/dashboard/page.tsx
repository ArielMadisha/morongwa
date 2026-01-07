'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      if (user.role === 'client') {
        router.push('/dashboard/client');
      } else if (user.role === 'runner') {
        router.push('/dashboard/runner');
      } else if (user.role === 'admin') {
        router.push('/dashboard/admin');
      }
    } else if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
    </div>
  );
}
