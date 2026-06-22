import Setting from "../data/models/Setting";

export const WA_PREMENU_ADVERT_SETTING_KEY = "wa_premenu_advert";

export type WaAdvertCampaignKey = "marketplace" | "resellers" | "wallet" | "employment";

export type WaAdvertTier = "bronze" | "silver" | "gold";

export type WaPreMenuAdvertCampaignMode = "auto" | WaAdvertCampaignKey;

/** Persisted shape (partial updates allowed). */
export interface WaPreMenuAdvertConfigValue {
  tier?: WaAdvertTier;
  campaignMode?: WaPreMenuAdvertCampaignMode;
  /** Full replacement copy per campaign (bronze; also fallback script for captions). */
  textOverrides?: Partial<Record<WaAdvertCampaignKey, string>>;
  silverMediaUrl?: string;
  silverCaption?: string;
  goldMediaUrl?: string;
  goldCaption?: string;
  /** Gold: shown as a leading line on the media caption. */
  goldFeaturedPartnerLabel?: string;
  /** ACBPayWallet (main menu option 5): two HTTPS video URLs; one is chosen at random when the user picks 5. */
  acbpayMediaUrlA?: string;
  acbpayMediaUrlB?: string;
}

export interface WaPreMenuAdvertConfigResolved {
  tier: WaAdvertTier;
  campaignMode: WaPreMenuAdvertCampaignMode;
  textOverrides: Partial<Record<WaAdvertCampaignKey, string>>;
  silverMediaUrl: string;
  silverCaption: string;
  goldMediaUrl: string;
  goldCaption: string;
  goldFeaturedPartnerLabel: string;
  acbpayMediaUrlA: string;
  acbpayMediaUrlB: string;
}

export const WA_AD_CAMPAIGN_SCRIPTS: Record<WaAdvertCampaignKey, string> = {
  marketplace: [
    "🛍️ With QwertyHub, you don't need stock!",
    "One tap = your store.",
    "Earn instantly, no boxes, no hassle.",
  ].join("\n"),
  resellers: [
    "💬 Turn your WhatsApp chats into income!",
    "Share your QwertyHub store link, earn commissions.",
    "No inventory, just conversations.",
  ].join("\n"),
  wallet: [
    "💳 ACBPayWallet puts power in your pocket.",
    "Pay bills, shop, and transfer money instantly.",
    "Secure. Fast. Empowering.",
  ].join("\n"),
  employment: [
    "💼 Need extra income?",
    "Join Errands Runners today — earn instantly, no stock required.",
    "Your hustle, your rewards.",
  ].join("\n"),
};

function getJohannesburgWeekdayAndMonth(d: Date): { weekday: number; month: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Johannesburg",
    weekday: "short",
    month: "numeric",
  }).formatToParts(d);
  const weekdayStr = parts.find((p) => p.type === "weekday")?.value || "Mon";
  const month = Number(parts.find((p) => p.type === "month")?.value || "1");
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { weekday: weekdayMap[weekdayStr] ?? 1, month };
}

export function resolveWaAdvertCampaign(now: Date): WaAdvertCampaignKey {
  const { weekday, month } = getJohannesburgWeekdayAndMonth(now);
  if ([1, 4, 11].includes(month)) return "marketplace";
  if ([2, 6, 9].includes(month)) return "resellers";
  if ([3, 8, 12].includes(month)) return "wallet";
  if (weekday === 1 || weekday === 2) return "marketplace";
  if (weekday === 3 || weekday === 4) return "resellers";
  if (weekday === 5 || weekday === 6) return "wallet";
  return "employment";
}

const CAMPAIGNS: WaAdvertCampaignKey[] = ["marketplace", "resellers", "wallet", "employment"];

function clampStr(s: unknown, max: number): string {
  const t = String(s ?? "").trim();
  if (!t) return "";
  return t.length > max ? t.slice(0, max) : t;
}

function isHttpsUrl(s: string): boolean {
  const u = s.trim();
  return /^https:\/\//i.test(u);
}

/** Shipped with the Next.js app as `frontend/public/wa-adverts/qwertyhub-sample-ad.mp4` (short sample clip for Twilio). */
const WA_PREMENU_BUNDLED_SAMPLE_PATH = "/wa-adverts/qwertyhub-sample-ad.mp4";
const WA_PREMENU_ACBPAY_A_PATH = "/wa-adverts/acbpay-usage-a.mp4";
const WA_PREMENU_ACBPAY_B_PATH = "/wa-adverts/acbpay-usage-b.mp4";

function publicFrontendAssetUrl(assetPath: string): string {
  const raw = String(process.env.FRONTEND_URL || "https://www.qwertymates.com").trim();
  const withProto = raw.startsWith("http://") || raw.startsWith("https://") ? raw : `https://${raw}`;
  const p = assetPath.startsWith("/") ? assetPath : `/${assetPath}`;
  return `${withProto.replace(/\/$/, "")}${p}`;
}

/** Public HTTPS URL for the bundled pre-menu sample (Twilio fetches this before the main menu). */
export function publicBundledWaPremenuSampleVideoUrl(): string {
  return publicFrontendAssetUrl(WA_PREMENU_BUNDLED_SAMPLE_PATH);
}

export function publicBundledAcbpayVideoUrlA(): string {
  return publicFrontendAssetUrl(WA_PREMENU_ACBPAY_A_PATH);
}

export function publicBundledAcbpayVideoUrlB(): string {
  return publicFrontendAssetUrl(WA_PREMENU_ACBPAY_B_PATH);
}

export function mergeWaPreMenuAdvertDefaults(v?: WaPreMenuAdvertConfigValue | null): WaPreMenuAdvertConfigResolved {
  const raw = v || {};
  const tierRaw = String(raw.tier || "").toLowerCase();
  const tier: WaAdvertTier =
    tierRaw === "silver" || tierRaw === "gold" || tierRaw === "bronze" ? (tierRaw as WaAdvertTier) : "silver";
  const modeRaw = String(raw.campaignMode || "auto").toLowerCase();
  const campaignMode: WaPreMenuAdvertCampaignMode =
    modeRaw === "auto" || (CAMPAIGNS as string[]).includes(modeRaw) ? (modeRaw as WaPreMenuAdvertCampaignMode) : "auto";

  const textOverrides: Partial<Record<WaAdvertCampaignKey, string>> = {};
  for (const k of CAMPAIGNS) {
    const o = (raw.textOverrides as any)?.[k];
    const c = clampStr(o, 4000);
    if (c) textOverrides[k] = c;
  }

  const silverMediaUrl = clampStr(raw.silverMediaUrl, 2000);
  const goldMediaUrl = clampStr(raw.goldMediaUrl, 2000);
  const silverCaption = clampStr(raw.silverCaption, 1600);
  const goldCaption = clampStr(raw.goldCaption, 1600);
  const goldFeaturedPartnerLabel = clampStr(raw.goldFeaturedPartnerLabel, 400);
  const acbpayAIn = clampStr(raw.acbpayMediaUrlA, 2000);
  const acbpayBIn = clampStr(raw.acbpayMediaUrlB, 2000);

  let resolvedSilver = silverMediaUrl && isHttpsUrl(silverMediaUrl) ? silverMediaUrl : "";
  const resolvedGold = goldMediaUrl && isHttpsUrl(goldMediaUrl) ? goldMediaUrl : "";
  if ((tier === "silver" || tier === "gold") && !resolvedSilver) {
    const bundled = publicBundledWaPremenuSampleVideoUrl();
    if (bundled && isHttpsUrl(bundled)) resolvedSilver = bundled;
  }

  let acbpayA = acbpayAIn && isHttpsUrl(acbpayAIn) ? acbpayAIn : "";
  let acbpayB = acbpayBIn && isHttpsUrl(acbpayBIn) ? acbpayBIn : "";
  if (tier === "silver" || tier === "gold") {
    if (!acbpayA) {
      const d = publicBundledAcbpayVideoUrlA();
      if (d && isHttpsUrl(d)) acbpayA = d;
    }
    if (!acbpayB) {
      const d = publicBundledAcbpayVideoUrlB();
      if (d && isHttpsUrl(d)) acbpayB = d;
    }
  }

  return {
    tier,
    campaignMode,
    textOverrides,
    silverMediaUrl: resolvedSilver,
    goldMediaUrl: resolvedGold,
    silverCaption,
    goldCaption,
    goldFeaturedPartnerLabel,
    acbpayMediaUrlA: acbpayA,
    acbpayMediaUrlB: acbpayB,
  };
}

const CACHE_TTL_MS = 15_000;
let cache: { expiresAt: number; value: WaPreMenuAdvertConfigResolved } | null = null;

export function invalidateWaPreMenuAdvertConfigCache(): void {
  cache = null;
}

export async function getWaPreMenuAdvertConfigResolved(): Promise<WaPreMenuAdvertConfigResolved> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.value;
  const doc = await Setting.findOne({ key: WA_PREMENU_ADVERT_SETTING_KEY }).lean();
  const merged = mergeWaPreMenuAdvertDefaults((doc as any)?.value as WaPreMenuAdvertConfigValue | undefined);
  cache = { expiresAt: now + CACHE_TTL_MS, value: merged };
  return merged;
}

/** Deep-merge partial `body` onto `existing` then normalize (for admin PUT). */
export function mergeWaPreMenuAdvertPatch(
  existing: WaPreMenuAdvertConfigValue | null | undefined,
  body: Record<string, unknown>
): WaPreMenuAdvertConfigValue {
  const cur = existing || {};
  const next: WaPreMenuAdvertConfigValue = { ...cur };
  if ("tier" in body && body.tier != null) next.tier = String(body.tier).toLowerCase() as WaAdvertTier;
  if ("campaignMode" in body && body.campaignMode != null) next.campaignMode = String(body.campaignMode).toLowerCase() as any;
  if ("silverMediaUrl" in body) next.silverMediaUrl = body.silverMediaUrl == null ? undefined : String(body.silverMediaUrl);
  if ("silverCaption" in body) next.silverCaption = body.silverCaption == null ? undefined : String(body.silverCaption);
  if ("goldMediaUrl" in body) next.goldMediaUrl = body.goldMediaUrl == null ? undefined : String(body.goldMediaUrl);
  if ("goldCaption" in body) next.goldCaption = body.goldCaption == null ? undefined : String(body.goldCaption);
  if ("goldFeaturedPartnerLabel" in body)
    next.goldFeaturedPartnerLabel = body.goldFeaturedPartnerLabel == null ? undefined : String(body.goldFeaturedPartnerLabel);
  if ("acbpayMediaUrlA" in body) next.acbpayMediaUrlA = body.acbpayMediaUrlA == null ? undefined : String(body.acbpayMediaUrlA);
  if ("acbpayMediaUrlB" in body) next.acbpayMediaUrlB = body.acbpayMediaUrlB == null ? undefined : String(body.acbpayMediaUrlB);

  if ("textOverrides" in body) {
    if (body.textOverrides === null) {
      next.textOverrides = undefined;
    } else if (typeof body.textOverrides === "object" && body.textOverrides) {
      const o = { ...(cur.textOverrides || {}) } as Record<string, string>;
      for (const k of CAMPAIGNS) {
        if (Object.prototype.hasOwnProperty.call(body.textOverrides, k)) {
          const v = (body.textOverrides as any)[k];
          if (v == null || String(v).trim() === "") delete o[k];
          else o[k] = String(v).trim();
        }
      }
      next.textOverrides = Object.keys(o).length ? (o as any) : undefined;
    }
  }
  return next;
}
