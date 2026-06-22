/**
 * First segment of `SupportTicket.category` (before `:`).
 * Delegated admins with the `support` section can be limited to these mains via `AdminPermission.supportCategories`.
 * Keep keys in sync with `frontend/lib/supportCategories.ts` (`SUPPORT_CATEGORIES` object keys).
 */
export const SUPPORT_CATEGORY_MAIN = [
  "music",
  "videos",
  "wallet",
  "products",
  "general",
  "suppliers",
  "catalog",
  "tasks",
  "livestream",
  "merchant",
] as const;

export type SupportMainCategory = (typeof SUPPORT_CATEGORY_MAIN)[number];
