import { Response, NextFunction } from "express";
import AdminPermission, { AdminSection } from "../data/models/AdminPermission";
import { AuthRequest } from "./auth";

function isSuperAdmin(req: AuthRequest): boolean {
  return req.user?.role?.includes("superadmin") ?? false;
}

type MatchResult =
  | { kind: "pass" }
  | { kind: "superadmin" }
  | { kind: "anyOf"; sections: readonly AdminSection[] }
  | { kind: "anySectionIfDelegated" };

/**
 * Longer `prefix` must appear first so `/tv-channel` wins over `/tv`.
 * `methods` omitted = all HTTP methods.
 */
const PREFIX_RULES: Array<{
  prefix: string;
  methods?: Set<string>;
  match: MatchResult;
}> = [
  { prefix: "/admins", match: { kind: "superadmin" } },
  { prefix: "/permissions/me", methods: new Set(["GET"]), match: { kind: "pass" } },
  { prefix: "/supplier-deletion-requests", match: { kind: "superadmin" } },

  { prefix: "/sponsored-video", match: { kind: "anyOf", sections: ["sponsored_video", "web_advertising"] } },
  /** Sponsored video analytics (mounted on admin API alongside `/sponsored-video/*`). */
  { prefix: "/reports", match: { kind: "anyOf", sections: ["sponsored_video", "web_advertising"] } },

  { prefix: "/money-metrics/detail", match: { kind: "anyOf", sections: ["money_metrics"] } },
  { prefix: "/money-metrics", match: { kind: "anyOf", sections: ["money_metrics"] } },
  { prefix: "/paygate-fees", match: { kind: "anyOf", sections: ["money_metrics"] } },
  { prefix: "/fnb", match: { kind: "anyOf", sections: ["money_metrics", "escrows"] } },

  { prefix: "/tv-channel", match: { kind: "anyOf", sections: ["tv_channel"] } },
  { prefix: "/live", match: { kind: "anyOf", sections: ["live_streaming"] } },
  { prefix: "/music/sound-library", match: { kind: "anyOf", sections: ["music_sound_library"] } },
  { prefix: "/country-profiles", match: { kind: "anyOf", sections: ["country_profiles"] } },

  { prefix: "/tv/", match: { kind: "anyOf", sections: ["tv_posts", "tv_comments", "tv_reports"] } },
  { prefix: "/tv", match: { kind: "anyOf", sections: ["tv_posts", "tv_comments", "tv_reports"] } },

  {
    prefix: "/products/supplier-options",
    methods: new Set(["GET"]),
    match: {
      kind: "anyOf",
      sections: ["products", "product_uploads", "suppliers", "supplier_uploads"],
    },
  },
  { prefix: "/products", match: { kind: "anyOf", sections: ["products", "product_uploads"] } },
  { prefix: "/dropship", match: { kind: "anyOf", sections: ["dropshipping", "products", "product_uploads"] } },
  { prefix: "/dropshipping-profit", match: { kind: "anyOf", sections: ["dropshipping", "orders", "products"] } },

  { prefix: "/suppliers", match: { kind: "anyOf", sections: ["suppliers", "supplier_uploads"] } },
  /** Narrower than `/stores` — must win first for delegated store admins without `users`. */
  { prefix: "/stores/user-options", methods: new Set(["GET"]), match: { kind: "anyOf", sections: ["stores"] } },
  { prefix: "/stores", match: { kind: "anyOf", sections: ["stores"] } },
  { prefix: "/orders", match: { kind: "anyOf", sections: ["orders"] } },
  { prefix: "/courier", match: { kind: "anyOf", sections: ["couriers", "orders"] } },
  { prefix: "/users", match: { kind: "anyOf", sections: ["users"] } },
  { prefix: "/tasks", match: { kind: "anyOf", sections: ["tasks"] } },
  { prefix: "/support", match: { kind: "anyOf", sections: ["support"] } },
  { prefix: "/policies", match: { kind: "anyOf", sections: ["policies"] } },

  { prefix: "/merchant-agents", match: { kind: "anyOf", sections: ["merchant_agents"] } },
  {
    prefix: "/wa-premenu-advert",
    match: { kind: "anyOf", sections: ["adverts", "sponsored_video", "web_advertising"] },
  },
  { prefix: "/adverts", match: { kind: "anyOf", sections: ["adverts"] } },
  { prefix: "/product-enquiries", match: { kind: "anyOf", sections: ["product_enquiries"] } },
  { prefix: "/messages", match: { kind: "anyOf", sections: ["messages_dm"] } },
  { prefix: "/broadcast", match: { kind: "anyOf", sections: ["user_broadcast"] } },

  { prefix: "/artist-verifications", match: { kind: "anyOf", sections: ["artist_accounts"] } },
  { prefix: "/artists", match: { kind: "anyOf", sections: ["artist_accounts"] } },
  { prefix: "/music", match: { kind: "anyOf", sections: ["artist_accounts", "music_sound_library"] } },

  { prefix: "/runners", match: { kind: "anyOf", sections: ["runner_applications"] } },

  { prefix: "/tuckshop-cash-agents", match: { kind: "anyOf", sections: ["tuckshop_cash_agents"] } },
  { prefix: "/fraud-onboarding-applications", match: { kind: "anyOf", sections: ["fraud_registration"] } },
  { prefix: "/fraud-registration-exceptions", match: { kind: "anyOf", sections: ["fraud_registration"] } },

  { prefix: "/landing-backgrounds", match: { kind: "anyOf", sections: ["landing_backgrounds"] } },
  { prefix: "/reseller", match: { kind: "anyOf", sections: ["reseller_stats"] } },
  { prefix: "/escrows", match: { kind: "anyOf", sections: ["escrows"] } },
  { prefix: "/payouts", match: { kind: "anyOf", sections: ["escrows"] } },

  { prefix: "/pricing", match: { kind: "superadmin" } },
  { prefix: "/audit", match: { kind: "superadmin" } },
  { prefix: "/coverage", match: { kind: "superadmin" } },

  { prefix: "/stats", methods: new Set(["GET"]), match: { kind: "anySectionIfDelegated" } },
];

export function matchDelegatedAdminRoute(method: string, path: string): MatchResult {
  const m = method.toUpperCase();
  const p = (path.split("?")[0] || "/").trim();
  const norm = p.startsWith("/") ? p : `/${p}`;

  const ordered = [...PREFIX_RULES].sort((a, b) => b.prefix.length - a.prefix.length);
  for (const rule of ordered) {
    if (rule.methods && !rule.methods.has(m)) continue;
    if (norm === rule.prefix || norm.startsWith(`${rule.prefix}/`)) {
      return rule.match;
    }
  }

  return { kind: "anyOf", sections: [] };
}

/**
 * After `authenticate` + `authorize("admin","superadmin")`:
 * - superadmin: always allowed
 * - admin with no AdminPermission row: allowed (legacy full admin)
 * - admin with AdminPermission row: must match route → section mapping (unknown paths denied)
 */
export async function enforceDelegatedAdminSectionAccess(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      next();
      return;
    }
    if (isSuperAdmin(req)) {
      next();
      return;
    }

    const perm = await AdminPermission.findOne({ userId: req.user._id }).select("sections").lean();
    if (!perm) {
      next();
      return;
    }

    const path = String((req as { path?: string }).path || req.url?.split("?")[0] || "/");
    const method = String(req.method || "GET");
    const decision = matchDelegatedAdminRoute(method, path);

    if (decision.kind === "pass") {
      next();
      return;
    }
    if (decision.kind === "superadmin") {
      res.status(403).json({ error: "Super-admin only" });
      return;
    }
    if (decision.kind === "anySectionIfDelegated") {
      const have = perm.sections || [];
      if (have.length > 0) {
        next();
        return;
      }
      res.status(403).json({ error: "Insufficient permissions" });
      return;
    }

    const have = new Set(perm.sections || []);
    if (decision.sections.some((s) => have.has(s))) {
      next();
      return;
    }
    res.status(403).json({ error: "Insufficient permissions for this section" });
  } catch (e) {
    next(e);
  }
}
