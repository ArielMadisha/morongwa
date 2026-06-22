/** Roles that can use the /admin website (matches admin gate in app/admin/page.tsx). */
export const WEBSITE_ADMIN_ROLES = ['admin', 'superadmin'] as const;

export function userHasWebsiteAdminAccess(user: { role?: string | string[] } | null | undefined): boolean {
  if (!user?.role) return false;
  const roles = Array.isArray(user.role) ? user.role : [user.role];
  return roles.some((r) => (WEBSITE_ADMIN_ROLES as readonly string[]).includes(r));
}
