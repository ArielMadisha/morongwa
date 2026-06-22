'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { userHasWebsiteAdminAccess } from '@/lib/adminAccess';
import { adminAPI } from '@/lib/api';
import type { AdminPermissionsMe } from '@/lib/adminSectionAccess';

type Ctx = {
  perms: AdminPermissionsMe | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

const AdminPermissionsContext = createContext<Ctx>({
  perms: null,
  loading: true,
  refresh: async () => {},
});

export function AdminPermissionsProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [perms, setPerms] = useState<AdminPermissionsMe | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (authLoading) return;
    if (!user || !userHasWebsiteAdminAccess(user)) {
      setPerms(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const r = await adminAPI.getPermissionsMe();
      setPerms(r.data);
    } catch {
      setPerms(null);
    } finally {
      setLoading(false);
    }
  }, [authLoading, user]);

  useEffect(() => {
    void load();
  }, [load]);

  const value = useMemo(() => ({ perms, loading, refresh: load }), [perms, loading, load]);

  return <AdminPermissionsContext.Provider value={value}>{children}</AdminPermissionsContext.Provider>;
}

export function useAdminPermissions(): Ctx {
  return useContext(AdminPermissionsContext);
}
