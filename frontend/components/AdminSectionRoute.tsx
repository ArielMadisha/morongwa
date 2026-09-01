'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { useAdminPermissions } from '@/contexts/AdminPermissionsContext';
import { canAccessAdminSection } from '@/lib/adminSectionAccess';

/**
 * Admin page gate driven by API section permissions instead of the `admin` role, so approved store
 * owners with scoped product-loading rights can reach their own Load Products page.
 * Server-side section checks remain the source of truth.
 */
export function AdminSectionRoute({
  sections,
  children,
}: {
  sections: readonly string[];
  children: React.ReactNode;
}) {
  const { perms, loading } = useAdminPermissions();
  const router = useRouter();
  const allowed = canAccessAdminSection(perms, sections);

  useEffect(() => {
    if (!loading && !allowed) {
      const id = requestAnimationFrame(() => router.push('/wall'));
      return () => cancelAnimationFrame(id);
    }
  }, [loading, allowed, router]);

  return (
    <ProtectedRoute>
      {loading ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="h-12 w-12 animate-spin rounded-full border-2 border-sky-100 border-t-sky-500" />
        </div>
      ) : allowed ? (
        children
      ) : null}
    </ProtectedRoute>
  );
}
