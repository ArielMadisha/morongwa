import Setting from "../data/models/Setting";

export type MerchantFeePolicy = {
  currency: string;
  defaultFee: number;
  maxFee: number;
};

export const DEFAULT_POLICY_BY_COUNTRY: Record<string, MerchantFeePolicy> = {
  ZA: { currency: "ZAR", defaultFee: 5, maxFee: 10 },
  LS: { currency: "LSL", defaultFee: 5, maxFee: 10 },
  BW: { currency: "BWP", defaultFee: 5, maxFee: 10 },
  ZM: { currency: "ZMW", defaultFee: 5, maxFee: 10 },
  ZW: { currency: "USD", defaultFee: 0.5, maxFee: 2 },
};

const FALLBACK_POLICY: MerchantFeePolicy = { currency: "ZAR", defaultFee: 5, maxFee: 10 };
export const MERCHANT_FEE_POLICY_SETTING_KEY = "merchant_fee_policy_v1";

let cache: { at: number; policy: Record<string, MerchantFeePolicy> } | null = null;
const CACHE_TTL_MS = 60_000;

function normalizePolicyMap(input: unknown): Record<string, MerchantFeePolicy> {
  const out: Record<string, MerchantFeePolicy> = { ...DEFAULT_POLICY_BY_COUNTRY };
  if (!input || typeof input !== "object") return out;
  for (const [rawCc, rawPolicy] of Object.entries(input as Record<string, unknown>)) {
    const cc = String(rawCc || "").trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(cc)) continue;
    const p = rawPolicy as Partial<MerchantFeePolicy>;
    const currency = String(p?.currency || out[cc]?.currency || FALLBACK_POLICY.currency).trim().toUpperCase().slice(0, 3);
    const defaultFee = Number.isFinite(Number(p?.defaultFee)) ? Math.max(0, Number(p?.defaultFee)) : out[cc]?.defaultFee ?? FALLBACK_POLICY.defaultFee;
    const maxFeeRaw = Number.isFinite(Number(p?.maxFee)) ? Number(p?.maxFee) : out[cc]?.maxFee ?? FALLBACK_POLICY.maxFee;
    const maxFee = Math.max(defaultFee, maxFeeRaw);
    out[cc] = { currency, defaultFee, maxFee };
  }
  return out;
}

export async function getMerchantFeePolicyMap(): Promise<Record<string, MerchantFeePolicy>> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.policy;
  const row = await Setting.findOne({ key: MERCHANT_FEE_POLICY_SETTING_KEY }).select("value").lean();
  const policy = normalizePolicyMap((row as any)?.value);
  cache = { at: Date.now(), policy };
  return policy;
}

export async function setMerchantFeePolicyMap(
  next: Record<string, MerchantFeePolicy>,
  updatedBy?: string
): Promise<Record<string, MerchantFeePolicy>> {
  const normalized = normalizePolicyMap(next);
  await Setting.findOneAndUpdate(
    { key: MERCHANT_FEE_POLICY_SETTING_KEY },
    {
      $set: {
        value: normalized,
        description: "Per-country merchant service fee defaults/caps",
        ...(updatedBy ? { updatedBy } : {}),
      },
    },
    { upsert: true, new: true }
  );
  cache = { at: Date.now(), policy: normalized };
  return normalized;
}

export function getMerchantFeePolicy(countryCode?: string | null): MerchantFeePolicy {
  const cc = String(countryCode || "").trim().toUpperCase();
  return DEFAULT_POLICY_BY_COUNTRY[cc] || FALLBACK_POLICY;
}

export async function getMerchantFeePolicyResolved(countryCode?: string | null): Promise<MerchantFeePolicy> {
  const cc = String(countryCode || "").trim().toUpperCase();
  const map = await getMerchantFeePolicyMap();
  return map[cc] || FALLBACK_POLICY;
}

export function clampMerchantServiceFee(amount: number, countryCode?: string | null): number {
  const { maxFee } = getMerchantFeePolicy(countryCode);
  if (!Number.isFinite(amount)) return 0;
  return Math.max(0, Math.min(maxFee, Number(amount)));
}

export async function clampMerchantServiceFeeResolved(amount: number, countryCode?: string | null): Promise<number> {
  const { maxFee } = await getMerchantFeePolicyResolved(countryCode);
  if (!Number.isFinite(amount)) return 0;
  return Math.max(0, Math.min(maxFee, Number(amount)));
}

