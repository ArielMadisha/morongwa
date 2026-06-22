import crypto from "crypto";
import mongoose from "mongoose";
import SponsoredVideoAd, { type SponsoredVideoPlacement } from "../data/models/SponsoredVideoAd";
import SponsoredVideoImpression from "../data/models/SponsoredVideoImpression";
import { logger } from "./monitoring";
import {
  getWaPreMenuAdvertConfigResolved,
  resolveWaAdvertCampaign,
  type WaAdvertCampaignKey,
  WA_AD_CAMPAIGN_SCRIPTS,
  publicBundledWaPremenuSampleVideoUrl,
} from "./waPreMenuAdvertConfig";

const WA_VIDEO_EXT = /\.(mp4|mov|m4v)(\?|#|$)/i;

/** Matches `WaAdAction` in `waFlow.ts` (kept here to avoid circular imports). */
export type WaSponsoredAction =
  | "open_main_menu"
  | "open_about"
  | "open_wallet"
  | "open_marketplace"
  | "open_errands"
  | "open_mystore"
  | "open_cart"
  | "open_jobs"
  | "open_merchant_apply";

export function isSponsoredVideoUrl(url: string): boolean {
  const u = String(url || "")
    .trim()
    .split("?")[0]
    .split("#")[0];
  return /^https:\/\//i.test(String(url || "").trim()) && WA_VIDEO_EXT.test(u);
}

/** Creative must be a public HTTPS video URL. */
export function isSponsoredCreativeUrl(url: string): boolean {
  return isSponsoredVideoUrl(url);
}

/** Primary placement key for a WhatsApp submenu entry (used with SponsoredVideoAd.placements). */
export function waPlacementKeyForSponsoredAction(action: string): SponsoredVideoPlacement {
  const a = String(action || "").trim();
  switch (a) {
    case "open_main_menu":
      return "wa_premenu_main";
    case "open_about":
      return "wa_menu_about";
    case "open_wallet":
      return "wa_menu_wallet";
    case "open_marketplace":
      return "wa_menu_marketplace";
    case "open_errands":
      return "wa_menu_errands";
    case "open_mystore":
      return "wa_menu_mystore";
    case "open_cart":
      return "wa_menu_cart";
    case "open_jobs":
      return "wa_menu_jobs";
    case "open_merchant_apply":
      return "wa_wallet_merchant";
    default:
      return "wa_premenu_main";
  }
}

/** Prefer ads whose `moduleCategory` matches the destination feature. */
export function moduleCategoryForWaSponsoredAction(action: string): "wallet" | "marketplace" | "errands" | "jobs" | "merchant" | "general" {
  const a = String(action || "").trim();
  switch (a as WaSponsoredAction) {
    case "open_main_menu":
      return "general";
    case "open_about":
      return "general";
    case "open_wallet":
      return "wallet";
    case "open_marketplace":
      return "marketplace";
    case "open_errands":
      return "errands";
    case "open_mystore":
      return "merchant";
    case "open_cart":
      return "marketplace";
    case "open_jobs":
      return "jobs";
    case "open_merchant_apply":
      return "merchant";
    default:
      return "general";
  }
}

export type SponsoredPick = {
  adId: string;
  advertiserId: string;
  videoUrl: string;
  caption: string;
  placementKey: SponsoredVideoPlacement;
  rateZarPerThousandImpressions: number;
};

function withinSchedule(now: Date, start?: Date | null, end?: Date | null): boolean {
  if (start && now.getTime() < new Date(start).getTime()) return false;
  if (end && now.getTime() > new Date(end).getTime()) return false;
  return true;
}

const LEGACY_PLACEMENT_ALIASES: Partial<Record<SponsoredVideoPlacement, SponsoredVideoPlacement[]>> = {
  wa_menu_about: ["wa_premenu_main"],
  wa_menu_wallet: ["wa_premenu_main"],
  wa_menu_marketplace: ["wa_premenu_main"],
  wa_menu_errands: ["wa_premenu_main"],
  wa_menu_mystore: ["wa_premenu_main"],
  wa_menu_cart: ["wa_premenu_main"],
  wa_menu_jobs: ["wa_premenu_main", "wa_premenu_acbpay"],
  wa_wallet_merchant: ["wa_premenu_acbpay", "wa_premenu_main"],
};

function placementKeysWithLegacy(primary: SponsoredVideoPlacement): SponsoredVideoPlacement[] {
  const extra = LEGACY_PLACEMENT_ALIASES[primary] || [];
  return [primary, ...extra].filter((v, i, a) => a.indexOf(v) === i);
}

function scoreModuleRow(row: any, wanted: string): number {
  const mc = String(row?.moduleCategory || "general").toLowerCase();
  if (mc === wanted) return 2;
  if (mc === "general") return 1;
  return 0;
}

function sortByModuleThenPriority(rows: any[], wanted: string): any[] {
  return [...rows].sort((a, b) => {
    const ds = scoreModuleRow(b, wanted) - scoreModuleRow(a, wanted);
    if (ds !== 0) return ds;
    const pb = Number(b?.priority || 0) - Number(a?.priority || 0);
    if (pb !== 0) return pb;
    return Number(b?.weight || 0) - Number(a?.weight || 0);
  });
}

/**
 * Weighted random among active, approved ads for the placement.
 * Returns a single creative or null — WhatsApp pre-menu sends one video per menu branch per invocation.
 */
export async function selectSponsoredVideoForPlacement(
  placement: SponsoredVideoPlacement,
  now = new Date(),
  opts?: { moduleCategory?: string }
): Promise<SponsoredPick | null> {
  const wantedMc = String(opts?.moduleCategory || "").toLowerCase() || "general";
  const keys = placementKeysWithLegacy(placement);

  const baseMatch: any = {
    active: true,
    approved: true,
    weight: { $gt: 0 },
    placements: { $in: keys },
  };

  let rows = await SponsoredVideoAd.find(baseMatch)
    .select(
      "_id advertiserId title videoUrl caption weight startDate endDate rateZarPerThousandImpressions cpmRate priority moduleCategory"
    )
    .lean();

  if (!rows.length) {
    rows = await SponsoredVideoAd.find({
      active: true,
      approved: true,
      weight: { $gt: 0 },
    })
      .select(
        "_id advertiserId title videoUrl caption weight startDate endDate rateZarPerThousandImpressions cpmRate priority moduleCategory"
      )
      .lean();
  }

  const eligible = (rows as any[]).filter((r) => withinSchedule(now, r.startDate, r.endDate));
  const withUrl = eligible.filter((r) => isSponsoredVideoUrl(String(r.videoUrl || "")));
  if (!withUrl.length) return null;

  const preferred = sortByModuleThenPriority(withUrl, wantedMc);
  const pool =
    preferred.filter((r) => scoreModuleRow(r, wantedMc) >= 2).length > 0
      ? preferred.filter((r) => scoreModuleRow(r, wantedMc) >= 2)
      : preferred.filter((r) => scoreModuleRow(r, wantedMc) >= 1).length > 0
        ? preferred.filter((r) => scoreModuleRow(r, wantedMc) >= 1)
        : preferred;

  let total = 0;
  const weights = pool.map((r) => {
    const w = Math.max(0, Number(r.weight) || 0);
    total += w;
    return { r, w };
  });
  if (total <= 0) return null;

  let t = Math.random() * total;
  for (const { r, w } of weights) {
    t -= w;
    if (t <= 0) {
      return {
        adId: String(r._id),
        advertiserId: String(r.advertiserId),
        videoUrl: String(r.videoUrl).trim(),
        caption: String(r.caption || "").trim(),
        placementKey: placement,
        rateZarPerThousandImpressions: Math.max(
          0,
          Number(r.cpmRate || r.rateZarPerThousandImpressions) || 0
        ),
      };
    }
  }
  const last = weights[weights.length - 1].r;
  return {
    adId: String(last._id),
    advertiserId: String(last.advertiserId),
    videoUrl: String(last.videoUrl).trim(),
    caption: String(last.caption || "").trim(),
    placementKey: placement,
    rateZarPerThousandImpressions: Math.max(
      0,
      Number(last.cpmRate || last.rateZarPerThousandImpressions) || 0
    ),
  };
}

/**
 * Restores WhatsApp pre-menu video when Mongo has no matching SponsoredVideoAd:
 * uses Settings `wa_premenu_advert` (silver/gold/acbpay URLs) plus bundled qwertymates.com clips.
 * Returns empty ids — impressions are skipped (tracked ads only persist when Mongo picked a creative).
 */
export async function resolveWaFallbackSponsoredVideoPick(action: string): Promise<SponsoredPick | null> {
  const placement = waPlacementKeyForSponsoredAction(action);
  const cfg = await getWaPreMenuAdvertConfigResolved();
  const walletish =
    action === "open_wallet" || action === "open_merchant_apply" || action === "open_jobs";

  let videoUrl = "";
  let caption =
    String(cfg.silverCaption || "").trim() ||
    String(cfg.goldCaption || "").trim();

  const acUrls = [
    cfg.acbpayMediaUrlA,
    cfg.acbpayMediaUrlB,
  ].filter((u) => isSponsoredVideoUrl(String(u || "")));
  if (walletish && acUrls.length) {
    videoUrl = String(acUrls[Math.floor(Math.random() * acUrls.length)]!).trim();
  }

  const goldOk = isSponsoredVideoUrl(String(cfg.goldMediaUrl || ""));
  if (!videoUrl && goldOk && String(cfg.goldMediaUrl || "").trim()) {
    videoUrl = String(cfg.goldMediaUrl).trim();
    caption =
      [
        String(cfg.goldFeaturedPartnerLabel || "").trim(),
        caption || String(cfg.goldCaption || "").trim(),
      ]
        .filter(Boolean)
        .join("\n\n") ||
      caption ||
      WA_AD_CAMPAIGN_SCRIPTS.wallet;
  }

  const silverOk = isSponsoredVideoUrl(String(cfg.silverMediaUrl || ""));
  if (!videoUrl && silverOk) videoUrl = String(cfg.silverMediaUrl).trim();

  if (!videoUrl) {
    const sample = publicBundledWaPremenuSampleVideoUrl();
    if (isSponsoredVideoUrl(sample)) videoUrl = sample;
  }

  if (!isSponsoredVideoUrl(videoUrl)) return null;

  const modeKey: WaAdvertCampaignKey =
    cfg.campaignMode === "auto"
      ? resolveWaAdvertCampaign(new Date())
      : CAMPAIGN_MODE_OR_MARKET(cfg.campaignMode);

  const script =
    cfg.textOverrides?.[modeKey]?.trim() ||
    WA_AD_CAMPAIGN_SCRIPTS[modeKey as WaAdvertCampaignKey] ||
    WA_AD_CAMPAIGN_SCRIPTS.marketplace;
  if (!caption.trim()) caption = script;

  return {
    adId: "",
    advertiserId: "",
    videoUrl,
    caption: caption.trim() || script,
    placementKey: placement,
    rateZarPerThousandImpressions: 0,
  };
}

function CAMPAIGN_MODE_OR_MARKET(m: string): WaAdvertCampaignKey {
  const s = String(m || "").trim().toLowerCase();
  if (s === "marketplace" || s === "resellers" || s === "wallet" || s === "employment")
    return s as WaAdvertCampaignKey;
  return "marketplace";
}

/** True when SponsoredPick comes from Mongo and can record impressions / frequency by ad id. */
export function isTrackedSponsoredPick(pick: SponsoredPick | null | undefined): boolean {
  if (!pick?.videoUrl?.trim()) return false;
  const aid = String(pick.adId || "").trim();
  const bid = String(pick.advertiserId || "").trim();
  return !!(aid && bid && mongoose.isValidObjectId(aid) && mongoose.isValidObjectId(bid));
}

export function hashWaPhoneForMetrics(phoneInput: string): string {
  const digits = String(phoneInput || "").replace(/\D/g, "");
  if (!digits) return "";
  return crypto.createHash("sha256").update(`wa-impr:${digits}`).digest("hex").slice(0, 32);
}

export async function recordSponsoredVideoImpression(params: {
  adId: string;
  advertiserId: string;
  placementKey: string;
  menuKey?: string;
  phoneInput?: string;
  rateZarPerThousandImpressions: number;
}): Promise<void> {
  const earned =
    Number.isFinite(params.rateZarPerThousandImpressions) && params.rateZarPerThousandImpressions > 0
      ? Math.round((params.rateZarPerThousandImpressions / 1000) * 100) / 100
      : 0;
  try {
    await SponsoredVideoImpression.create({
      adId: params.adId,
      advertiserId: params.advertiserId,
      placementKey: params.placementKey,
      channel: "whatsapp",
      platform: "whatsapp",
      eventType: "impression",
      menuKey: params.menuKey ? String(params.menuKey).slice(0, 8) : undefined,
      earnedZarSnapshot: earned,
      phoneHash: params.phoneInput ? hashWaPhoneForMetrics(params.phoneInput) : undefined,
    });
  } catch (e) {
    logger.warn("SponsoredVideoImpression create failed", { error: String((e as any)?.message || e) });
  }
}
