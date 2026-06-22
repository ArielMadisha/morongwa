/** Mirrors GET /api/admin/permissions/me (delegated admin + super-admin). */
export type AdminPermissionsMe = {
  isSuperAdmin: boolean;
  sections: string[];
  supportCategories: string[];
};

/** True if super-admin, or delegated admin with at least one of the listed sections. */
export function canAccessAdminSection(
  p: AdminPermissionsMe | null | undefined,
  anyOf: readonly string[]
): boolean {
  if (!p) return false;
  if (p.isSuperAdmin) return true;
  if (anyOf.length === 0) return false;
  const have = new Set(p.sections || []);
  return anyOf.some((s) => have.has(s));
}

/** Gate for admin UI modules (nav + quick actions). */
export type AdminNavGate =
  | { kind: 'always' }
  | { kind: 'superAdminOnly' }
  | { kind: 'sections'; sections: readonly string[] };

/**
 * Whether an admin module should be shown.
 * `always` is true even when `perms` is still loading (e.g. Dashboard link).
 */
export function adminModuleVisible(perms: AdminPermissionsMe | null | undefined, gate: AdminNavGate): boolean {
  if (gate.kind === 'always') return true;
  if (!perms) return false;
  if (gate.kind === 'superAdminOnly') return perms.isSuperAdmin;
  return canAccessAdminSection(perms, gate.sections);
}
