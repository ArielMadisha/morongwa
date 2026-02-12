'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: string[];
}

export default function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      const returnTo = pathname ? `/login?returnTo=${encodeURIComponent(pathname)}` : '/login';
      router.push(returnTo);
    } else if (!loading && user && allowedRoles) {
      const userRoles = Array.isArray(user.role) ? user.role : [user.role];
      const hasAllowedRole = userRoles.some(role => allowedRoles.includes(role));
      if (!hasAllowedRole) {
        router.push('/wall');
      }
    }
  }, [user, loading, router, allowedRoles]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (allowedRoles) {
    // Handle role as array or string
    const userRoles = Array.isArray(user.role) ? user.role : [user.role];
    const hasAllowedRole = userRoles.some(role => allowedRoles.includes(role));
    if (!hasAllowedRole) {
      return null;
    }
  }

  return <>{children}</>;
}

// Named export for compatibility
export { ProtectedRoute };
