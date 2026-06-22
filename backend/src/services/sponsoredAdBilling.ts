/**
 * Prepaid advertiser billing: per-event charges (CPM/CPC/CPA) and gross → platform/partner attribution split.
 * Does not integrate payment gateways — top-ups remain explicit credits on the advertiser wallet.
 */
import Advertiser from "../data/models/Advertiser";
import AdTransaction from "../data/models/AdTransaction";
import { AppError } from "../middleware/errorHandler";

/** Audience multiplier applied to gross charge before debit (pricing policy). */
export const AUDIENCE_MULTIPLIER: Record<string, number> = {
  generic: 1.0,
  wallet: 1.3,
  runner: 1.5,
  merchant: 2.0,
  shopper: 1.2,
};

export function round2(n: number): number {
  return Math.round(Number(n || 0) * 100) / 100;
}

/** Percentage of gross charge attributed to platform (remainder = partner / incentive pool). */
export function platformSharePercent(): number {
  return Math.max(0, Math.min(100, Number(process.env.AD_PLATFORM_SHARE_PCT ?? 85)));
}

/**
 * Gross charge split for reporting — sums to gross when rounding is balanced.
 */
export function splitGrossAdvertiserCharge(gross: number): { platformShare: number; partnerShare: number } {
  const charge = round2(gross);
  const platformPct = platformSharePercent();
  const partnerPct = Math.max(0, 100 - platformPct);
  const platformShare = round2((charge * platformPct) / 100);
  const partnerShare = round2(charge - platformShare);
  return { platformShare, partnerShare };
}

/**
 * CPM: implied rate per impression = cpm/1000 × audience multiplier.
 * CPC / CPA: flat rate × multiplier.
 */
export function calcAdvertiserEventCharge(
  ad: {
    adType?: string;
    rateZarPerThousandImpressions?: number;
    cpmRate?: number;
    cpcRate?: number;
    cpaRate?: number;
  },
  eventType: "impression" | "click" | "conversion",
  audience: string
): number {
  const adType = String(ad?.adType || "CPM").toUpperCase();
  const mul = AUDIENCE_MULTIPLIER[audience] ?? 1.0;
  let base = 0;
  if (eventType === "impression" && (adType === "CPM" || adType === "HYBRID")) {
    const cpm = Number(ad?.cpmRate ?? ad?.rateZarPerThousandImpressions ?? 0);
    base = cpm > 0 ? cpm / 1000 : 0;
  }
  if (eventType === "click" && (adType === "CPC" || adType === "HYBRID")) {
    base = Math.max(0, Number(ad?.cpcRate || 0));
  }
  if (eventType === "conversion" && (adType === "CPA" || adType === "HYBRID")) {
    base = Math.max(0, Number(ad?.cpaRate || 0));
  }
  return round2(base * mul);
}

export function dateKeyFrom(d: Date): string {
  const x = new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function impressionRateLimitPerUserPerHour(): number {
  const n = Number(process.env.AD_IMPRESSION_MAX_PER_USER_PER_HOUR ?? 40);
  if (!Number.isFinite(n) || n < 1) return 40;
  return Math.min(500, Math.floor(n));
}

export async function creditAdvertiserWallet(params: {
  advertiser: InstanceType<typeof Advertiser>;
  amount: number;
  method: string;
  description?: string;
}): Promise<{ walletBalance: number }> {
  const amount = round2(Math.max(0, params.amount));
  if (amount <= 0) throw new AppError("amount must be positive", 400);
  const adv = params.advertiser;
  (adv as any).walletBalance = round2(Number((adv as any).walletBalance || 0) + amount);
  if ((adv as any).walletBalance > 0 && (adv as any).status === "paused") {
    (adv as any).status = "active";
  }
  await adv.save();
  await AdTransaction.create({
    advertiserId: adv._id,
    amount,
    type: "credit",
    eventType: "topup",
    description: params.description || `Advertiser wallet top-up via ${params.method}`,
    platformShare: 0,
    partnerShare: 0,
    balanceAfter: Number((adv as any).walletBalance || 0),
  });
  return { walletBalance: Number((adv as any).walletBalance || 0) };
}
