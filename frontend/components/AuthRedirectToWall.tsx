'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Redirects authenticated users to /wall. Use on the home page
 * so logged-in users land on the wall as their main app.
 */
export function AuthRedirectToWall() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.replace('/wall');
    }
  }, [user, loading, router]);

  return null;
}
