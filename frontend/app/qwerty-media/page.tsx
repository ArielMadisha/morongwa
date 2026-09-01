'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShellHeader } from '@/components/AppShellHeader';
import { AppSidebarMenuButton } from '@/components/AppSidebar';
import { MediaBlendedFeed } from '@/components/media/MediaBlendedFeed';
import { MediaPageShell } from '@/components/media/MediaPageShell';
import { MediaSectionTabs } from '@/components/media/MediaSectionTabs';
import { ProfileHeaderButton } from '@/components/ProfileHeaderButton';
import { SearchButton } from '@/components/SearchButton';
import { useAuth } from '@/contexts/AuthContext';
import { useCartAndStores } from '@/lib/useCartAndStores';

export default function QwertyMediaPage() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const { cartCount, hasStore } = useCartAndStores(!!user);

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  return (
    <MediaPageShell
      menuOpen={menuOpen}
      setMenuOpen={setMenuOpen}
      user={user as any}
      cartCount={cartCount}
      hasStore={hasStore}
      onLogout={handleLogout}
      header={
        <AppShellHeader
          homeHref="/wall"
          center={
            <div className="flex min-w-0 items-center gap-2">
              <AppSidebarMenuButton onClick={() => setMenuOpen((v) => !v)} />
              <h1 className="truncate text-base font-semibold text-slate-900 sm:text-lg">QwertyMedia</h1>
            </div>
          }
          actions={
            <>
              <SearchButton />
              <ProfileHeaderButton />
            </>
          }
        />
      }
    >
      {(scrollRoot) => (
        <>
          <MediaSectionTabs active="hub" />
          <MediaBlendedFeed currentUserId={user?._id || user?.id} scrollRoot={scrollRoot} />
        </>
      )}
    </MediaPageShell>
  );
}
