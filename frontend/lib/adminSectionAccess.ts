/** Mirrors GET /api/admin/permissions/me (delegated admin + super-admin). */
export type AdminPermissionsMe = {
  isSuperAdmin: boolean;
  sections: string[];
  supportCategories: string[];
  /** Primary store lock for Load Products (first scoped / owned supplier). */
  scopedSupplierId?: string | null;
  /** All suppliers this admin may load products for (own store(s) only unless super-admin). */
  scopedSupplierIds?: string[];
  /** True only for super-admin — may see/edit all catalog products. */
  productCatalogUnrestricted?: boolean;
  /**
   * Approved store owner (supplier / manufacturer / grocery / restaurant) whose admin rights are
   * limited to loading products for their own store(s). No other admin area is available.
   */
  productLoaderOnly?: boolean;
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
  // Product-loader-only accounts never see dashboard / platform modules, only their section modules.
  if (perms?.productLoaderOnly) {
    return gate.kind === 'sections' && canAccessAdminSection(perms, gate.sections);
  }
  if (gate.kind === 'always') return true;
  if (!perms) return false;
  if (gate.kind === 'superAdminOnly') return perms.isSuperAdmin;
  return canAccessAdminSection(perms, gate.sections);
}
