import AdminLayoutClient from './AdminLayoutClient';

/**
 * Wraps all /admin routes: global module menu (section-filtered for sub-admins) + back to site.
 */
export default function AdminSectionLayout({ children }: { children: React.ReactNode }) {
  return <AdminLayoutClient>{children}</AdminLayoutClient>;
}
