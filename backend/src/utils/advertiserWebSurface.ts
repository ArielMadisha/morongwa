/** Web-first sponsored placement mapping (does not alter WhatsApp Studio). */
import { SPONSORED_VIDEO_PLACEMENTS } from "../data/models/SponsoredVideoAd";

const ALLOWED = new Set<string>(SPONSORED_VIDEO_PLACEMENTS);

const WA_PLACEMENT_MAP: Record<string, string[]> = {
  wallet: ["wa_premenu_acbpay"],
  errands: ["wa_premenu_main"],
  marketplace: ["wa_premenu_main"],
  dashboard: ["wa_premenu_main"],
};

const WEB_PLACEMENT_MAP: Record<string, string[]> = {
  dashboard: ["web_home"],
  home: ["web_home"],
  wall: ["web_wall"],
  wallet: ["web_wallet"],
  marketplace: ["web_marketplace"],
  checkout: ["web_checkout"],
  errands: ["web_jobs"],
  jobs: ["web_jobs"],
  tv: ["web_tv"],
  general: ["web_home"],
};

function normalizePlacementTokens(input: unknown): string[] {
  if (Array.isArray(input)) {
    return input.map((x) => String(x || "").trim().toLowerCase()).filter(Boolean);
  }
  const single = String((input as string) || "").trim().toLowerCase();
  return single ? [single] : ["dashboard"];
}

/**
 * Resolves creative placements for advertiser self-serve POST /create.
 * - surface=web: web_* slots only
 * - surface=whatsapp (default): legacy WA menu mapping
 */
export function resolveAdvertiserCreativePlacements(body: {
  placement?: unknown;
  placements?: unknown;
  surface?: unknown;
}): string[] {
  const surface = String(body?.surface || "whatsapp").trim().toLowerCase();
  const tokens = normalizePlacementTokens(
    body?.placements != null ? body.placements : body?.placement != null ? body?.placement : "dashboard"
  );

  if (surface === "whatsapp" || surface === "wa") {
    const raw = tokens.flatMap((t) => WA_PLACEMENT_MAP[t] || ["wa_premenu_main"]);
    const uniq: string[] = [];
    const s2 = new Set<string>();
    for (const p of raw) {
      if (ALLOWED.has(p) && !s2.has(p)) {
        s2.add(p);
        uniq.push(p);
      }
    }
    return uniq.length ? uniq : ["wa_premenu_main"];
  }

  const out = tokens.flatMap((t) => {
    if (/^web_[a-z0-9_]+$/i.test(t)) return [t.toLowerCase()];
    return WEB_PLACEMENT_MAP[t] || WEB_PLACEMENT_MAP.general!;
  });

  const seen = new Set<string>();
  const webOnly = out.filter((p) => {
    if (!ALLOWED.has(p)) return false;
    if (!p.startsWith("web_")) return false;
    if (seen.has(p)) return false;
    seen.add(p);
    return true;
  });
  return webOnly.length ? webOnly : ["web_home"];
}

export function inferModuleCategoryFromPlacements(placements: string[]): "wallet" | "marketplace" | "errands" | "jobs" | "merchant" | "general" {
  const p = placements.map((x) => String(x || "").toLowerCase());
  if (p.some((x) => x.includes("wallet"))) return "wallet";
  if (p.some((x) => x.includes("marketplace"))) return "marketplace";
  if (p.some((x) => x.includes("errand"))) return "errands";
  if (p.some((x) => x.includes("jobs"))) return "jobs";
  if (p.some((x) => x.includes("merchant"))) return "merchant";
  return "general";
}

const MODULE_HINTS = new Set(["wallet", "marketplace", "errands", "jobs", "merchant", "general"]);

/** Legacy WhatsApp: derive module category from the abstract placement key (wallet, marketplace, …). */
export function inferModuleCategoryFromLegacyPlacementKey(body: {
  placement?: unknown;
  placements?: unknown;
}): "wallet" | "marketplace" | "errands" | "jobs" | "merchant" | "general" | null {
  const raw = Array.isArray(body?.placements) ? body.placements[0] : body?.placement;
  const p = String(raw ?? "dashboard").trim().toLowerCase();
  if (p === "dashboard") return "general";
  if (MODULE_HINTS.has(p)) return p as "wallet" | "marketplace" | "errands" | "jobs" | "merchant" | "general";
  return null;
}

export function advertiserWebGateOk(advertiser: {
  webOnboardingStatus?: string | null;
}): boolean {
  const s = String(advertiser?.webOnboardingStatus ?? "").trim().toLowerCase();
  if (!s) return true;
  return s === "approved";
}
