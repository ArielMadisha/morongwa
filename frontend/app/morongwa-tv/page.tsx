'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Tv } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useCartAndStores } from '@/lib/useCartAndStores';
import { AppSidebar, AppSidebarMenuButton } from '@/components/AppSidebar';
import { ProfileDropdown } from '@/components/ProfileDropdown';

function MorongwaTVPageContent() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const { cartCount, hasStore } = useCartAndStores(!!user);

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-blue-50 to-white text-slate-900 flex">
      <AppSidebar
        variant="wall"
        userName={user?.name}
        cartCount={cartCount}
        hasStore={hasStore}
        onLogout={handleLogout}
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
      />
      <div className="flex-1 flex flex-col min-w-0 overflow-visible">
        <header className="bg-white/85 backdrop-blur-md border-b border-slate-100 shadow-sm flex-shrink-0 overflow-visible">
          <div className="px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <AppSidebarMenuButton onClick={() => setMenuOpen(true)} />
                <p className="text-sm text-slate-600 truncate">Welcome back, {user?.name}</p>
              </div>
              <div className="shrink-0">
                <ProfileDropdown userName={user?.name} onLogout={handleLogout} />
              </div>
            </div>
          </div>
        </header>
        <div className="flex-1 flex gap-6 pt-6 min-h-0">
          <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8">
            <div className="rounded-2xl border border-slate-100 bg-white/90 backdrop-blur p-12 text-center">
              <Tv className="h-16 w-16 text-slate-300 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-slate-700 mb-2">MorongwaTV</h2>
              <p className="text-slate-600">Content coming soon.</p>
            </div>
          </main>
          <aside className="hidden lg:block w-56 xl:w-64 shrink-0 pr-4 lg:pr-6 pt-8">
            <div className="sticky top-24 h-48 rounded-xl border border-dashed border-slate-200 bg-slate-50/50" aria-hidden="true" />
          </aside>
        </div>
      </div>
    </div>
  );
}

export default function MorongwaTVPage() {
  return (
    <ProtectedRoute>
      <MorongwaTVPageContent />
    </ProtectedRoute>
  );
}
