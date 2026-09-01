import mongoose from "mongoose";
import Supplier from "../data/models/Supplier";
import AdminPermission from "../data/models/AdminPermission";
import type { IUser } from "../data/models/User";

/**
 * Scoped "product loader" capability.
 *
 * Approved suppliers / manufacturers / grocery + restaurant store owners get admin rights that are
 * limited to loading products for their own store(s) — nothing else in /api/admin.
 * Resellers own no approved Supplier document, so they get no capability here.
 *
 * Explicit grants (role `admin`/`superadmin`, or an AdminPermission row) always take precedence and
 * are evaluated before this capability, so previously granted accounts keep their existing rights.
 */
export const PRODUCT_LOADER_SECTION = "product_uploads" as const;

/** /api/admin paths a scoped product loader may reach (prefix match, `/api/admin` stripped). */
const SCOPED_PATH_PREFIXES = ["/permissions/me", "/products"] as const;

export type ProductLoaderGrant = {
  granted: boolean;
  supplierIds: string[];
};

export function userHasExplicitAdminRole(user: Pick<IUser, "role"> | null | undefined): boolean {
  const roles = user?.role || [];
  return roles.includes("admin") || roles.includes("superadmin");
}

/**
 * Suppliers this user owns that are approved. Scoped rights only exist when at least one is found.
 */
export async function resolveProductLoaderGrant(
  userId: mongoose.Types.ObjectId | string
): Promise<ProductLoaderGrant> {
  const ids = new Set<string>();

  const owned = await Supplier.find({ userId, status: "approved" }).select("_id").lean();
  for (const s of owned) ids.add(String(s._id));

  // Honour an explicit single-store grant even if the supplier is owned by another account.
  const perm = await AdminPermission.findOne({ userId }).select("scopedSupplierId").lean();
  const scoped = (perm as { scopedSupplierId?: unknown } | null)?.scopedSupplierId;
  if (scoped) ids.add(String(scoped));

  const supplierIds = [...ids];
  return { granted: supplierIds.length > 0, supplierIds };
}

/** True when the request path is inside the scoped product-loading surface. */
export function scopedProductLoaderPathAllowed(path: string): boolean {
  const p = (String(path || "/").split("?")[0] || "/").trim();
  const norm = p.startsWith("/") ? p : `/${p}`;
  return SCOPED_PATH_PREFIXES.some((prefix) => norm === prefix || norm.startsWith(`${prefix}/`));
}
