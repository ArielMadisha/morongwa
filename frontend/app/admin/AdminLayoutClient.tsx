'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { House, LayoutGrid, ChevronDown } from 'lucide-react';
import { AdminPermissionsProvider, useAdminPermissions } from '@/contexts/AdminPermissionsContext';
import { userHasWebsiteAdminAccess } from '@/lib/adminAccess';
import { useAuth } from '@/contexts/AuthContext';
import { groupedAdminNavModules } from '@/lib/adminNavModules';

function AdminModulesMenu() {
  const pathname = usePathname() || '';
  const { user, loading: authLoading } = useAuth();
  const { perms, loading: permLoading } = useAdminPermissions();

  const show = !authLoading && user && userHasWebsiteAdminAccess(user);
  if (!show) return null;

  const grouped = groupedAdminNavModules(permLoading ? null : perms);

  return (
    <details className="group relative">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm hover:border-sky-300 hover:bg-sky-50 [&::-webkit-details-marker]:hidden">
        <LayoutGrid className="h-4 w-4 shrink-0 text-sky-600" aria-hidden />
        Modules
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-500 transition group-open:rotate-180" aria-hidden />
      </summary>
      <div className="absolute right-0 z-[200] mt-1 max-h-[min(70vh,520px)] w-[min(100vw-1.5rem,22rem)] overflow-y-auto rounded-xl border border-slate-200 bg-white py-2 shadow-xl">
        {permLoading ? (
          <p className="px-3 py-4 text-sm text-slate-500">Loading permissions…</p>
        ) : grouped.length === 0 ? (
          <p className="px-3 py-4 text-sm text-slate-500">No modules assigned.</p>
        ) : (
          grouped.map(({ group, items }) => (
            <div key={group} className="border-b border-slate-100 last:border-0">
              <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{group}</p>
              <ul className="pb-1">
                {items.map((m) => {
                  const active = pathname === m.href || (m.href !== '/admin' && pathname.startsWith(`${m.href}/`));
                  return (
                    <li key={m.href}>
                      <Link
                        href={m.href}
                        className={`block px-3 py-2 text-sm leading-snug hover:bg-sky-50 ${
                          active ? 'bg-sky-50 font-semibold text-sky-900' : 'text-slate-800'
                        }`}
                      >
                        {m.title}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </div>
    </details>
  );
}

function AdminLayoutChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <div className="sticky top-0 z-[100] flex h-11 shrink-0 items-center justify-end gap-2 border-b border-slate-200 bg-white/95 px-3 backdrop-blur-sm">
        <AdminModulesMenu />
        <Link
          href="/wall"
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:border-sky-300 hover:bg-sky-50 hover:text-sky-900"
        >
          <House className="h-4 w-4 shrink-0" aria-hidden />
          Back to website
        </Link>
      </div>
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
}

export default function AdminLayoutClient({ children }: { children: React.ReactNode }) {
  return (
    <AdminPermissionsProvider>
      <AdminLayoutChrome>{children}</AdminLayoutChrome>
    </AdminPermissionsProvider>
  );
}
