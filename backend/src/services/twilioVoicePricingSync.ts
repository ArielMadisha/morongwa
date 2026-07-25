import fs from "fs";
import path from "path";
import { logger } from "./monitoring";

/** Geo-enabled Morongwa PSTN destinations + sample E.164 for mobile/landline Twilio quotes. */
export const VOICE_PRICING_DESTINATIONS: Record<
  string,
  { name: string; mobile: string; landline: string }
> = {
  ZA: { name: "South Africa", mobile: "+27821234567", landline: "+27111234567" },
  BW: { name: "Botswana", mobile: "+26771234567", landline: "+2673912345" },
  LS: { name: "Lesotho", mobile: "+26650123456", landline: "+26622312345" },
  NA: { name: "Namibia", mobile: "+264811234567", landline: "+26461234567" },
  SZ: { name: "Eswatini", mobile: "+26876123456", landline: "+26824041234" },
  ZW: { name: "Zimbabwe", mobile: "+263771234567", landline: "+263242123456" },
  ZM: { name: "Zambia", mobile: "+260971234567", landline: "+260211234567" },
  MZ: { name: "Mozambique", mobile: "+258841234567", landline: "+258211234567" },
};

export type TwilioPerMinUsd = { min: number; max: number; currency: string };

export type TwilioVoicePricingExport = {
  generatedAt: string;
  twilioOriginationNumber: string | null;
  twilioPriceUnit: string;
  twilioPricingSource: string;
  geoEnabledIso: string[];
  morongwaUserCharges: {
    currency: string;
    connectFeeZar: number;
    minWalletBalanceZar: number;
    billingNote: string;
    ratesPerMinuteZar: Record<string, { mobile: number; landline: number; note?: string }>;
  };
  twilioSampleMobileLandlinePerMinuteUsd: Array<{
    iso: string;
    country: string;
    twilioMobile: TwilioPerMinUsd | null;
    twilioLandline: TwilioPerMinUsd | null;
  }>;
  twilioAllCountriesPrefixRangeUsd: Array<{
    iso: string;
    country: string;
    currency: string;
    minPerMin: number | null;
    maxPerMin: number | null;
  }>;
};

const EXPORTS_DIR = path.resolve(__dirname, "../../exports");
const LATEST_JSON = path.join(EXPORTS_DIR, "twilio-voice-pricing-latest.json");
const CHARGES_JSON = path.join(EXPORTS_DIR, "morongwa-twilio-voice-charges.json");

let lastSyncAt: string | null = null;
let lastSyncOk = false;
let lastSyncError: string | null = null;
let cachedExport: TwilioVoicePricingExport | null = null;

export function getTwilioVoicePricingSyncStatus() {
  return {
    enabled: voicePricingSyncEnabled(),
    lastSyncAt,
    lastSyncOk,
    lastSyncError,
    exportPaths: { latest: LATEST_JSON, charges: CHARGES_JSON },
  };
}

export function voicePricingSyncEnabled(): boolean {
  if (String(process.env.VOICE_PRICING_SYNC_ENABLED || "").trim() === "0") return false;
  const sid = String(process.env.TWILIO_ACCOUNT_SID || "").trim();
  const tok = String(process.env.TWILIO_AUTH_TOKEN || "").trim();
  return Boolean(sid && tok);
}

function twilioAuthHeader(): string | null {
  const sid = String(process.env.TWILIO_ACCOUNT_SID || "").trim();
  const tok = String(process.env.TWILIO_AUTH_TOKEN || "").trim();
  if (!sid || !tok) return null;
  return `Basic ${Buffer.from(`${sid}:${tok}`).toString("base64")}`;
}

function perMinFromNumberJson(json: Record<string, unknown> | null): TwilioPerMinUsd | null {
  const prices = (json?.outbound_call_prices as Array<Record<string, unknown>>) || [];
  if (!prices.length) return null;
  const cur = String(json?.price_unit || "USD");
  const mins = prices
    .map((p) => Number(p.current_price ?? p.base_price))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (!mins.length) return null;
  return { min: Math.min(...mins), max: Math.max(...mins), currency: cur };
}

async function fetchJson(url: string, auth: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(url, { headers: { Authorization: auth } });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function priceDestination(
  dest: string,
  auth: string,
  from: string
): Promise<Record<string, unknown> | null> {
  const q = new URLSearchParams();
  if (from) q.set("OriginationNumber", from);
  const url =
    `https://pricing.twilio.com/v2/Voice/Numbers/${encodeURIComponent(dest)}` +
    (q.toString() ? `?${q}` : "");
  return fetchJson(url, auth);
}

async function listAllVoiceCountries(auth: string): Promise<Array<{ iso_country: string; country: string }>> {
  const out: Array<{ iso_country: string; country: string }> = [];
  let uri: string | null = "https://pricing.twilio.com/v2/Voice/Countries?PageSize=100";
  while (uri) {
    const data = await fetchJson(uri, auth);
    if (!data) break;
    const batch = (data.countries as Array<{ iso_country: string; country: string }>) || [];
    out.push(...batch);
    uri = (data.meta as { next_page_url?: string })?.next_page_url || null;
  }
  return out;
}

function morongwaChargesSnapshot() {
  const connectFeeZar = Number(process.env.VOICE_CONNECT_FEE_ZAR ?? 0.35);
  const minWalletBalanceZar = Number(process.env.VOICE_MIN_WALLET_BALANCE_ZAR ?? 5);
  return {
    currency: "ZAR",
    connectFeeZar: Number.isFinite(connectFeeZar) ? connectFeeZar : 0.35,
    minWalletBalanceZar: Number.isFinite(minWalletBalanceZar) ? minWalletBalanceZar : 5,
    billingNote:
      "User wallet debited: connectFeeZar + ratePerMinuteZar × ceil(durationSec/60). See voiceRates.ts.",
    ratesPerMinuteZar: {
      ZA: { mobile: 0.89, landline: 0.69 },
      BW: { mobile: 1.15, landline: 1.15 },
      LS: { mobile: 1.25, landline: 1.25 },
      NA: { mobile: 1.25, landline: 1.25 },
      SZ: { mobile: 1.2, landline: 1.25 },
      ZW: { mobile: 1.35, landline: 1.35 },
      ZM: { mobile: 1.35, landline: 1.35 },
      MZ: { mobile: 1.45, landline: 1.45 },
      INT: { mobile: 2.95, landline: 2.95, note: "All other country codes" },
    },
  };
}

function writeJsonAtomic(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmp, filePath);
}

export function readTwilioVoicePricingExport(): TwilioVoicePricingExport | null {
  if (cachedExport) return cachedExport;
  try {
    if (!fs.existsSync(LATEST_JSON)) return null;
    const raw = fs.readFileSync(LATEST_JSON, "utf8");
    cachedExport = JSON.parse(raw) as TwilioVoicePricingExport;
    return cachedExport;
  } catch {
    return null;
  }
}

/** Fetch Twilio Pricing API and refresh export JSON (no human step). */
export async function syncTwilioVoicePricing(): Promise<TwilioVoicePricingExport> {
  const auth = twilioAuthHeader();
  if (!auth) {
    throw new Error("TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN required for voice pricing sync");
  }

  const from = String(process.env.TWILIO_VOICE_FROM || process.env.TWILIO_SMS_FROM || "").trim();
  const geoEnabledIso = ["ZA", "BW", "LS", "NA", "SZ", "ZW", "ZM", "MZ"];

  const twilioSampleMobileLandlinePerMinuteUsd: TwilioVoicePricingExport["twilioSampleMobileLandlinePerMinuteUsd"] =
    [];

  for (const [iso, info] of Object.entries(VOICE_PRICING_DESTINATIONS)) {
    const mob = await priceDestination(info.mobile, auth, from);
    const land = await priceDestination(info.landline, auth, from);
    twilioSampleMobileLandlinePerMinuteUsd.push({
      iso,
      country: info.name,
      twilioMobile: perMinFromNumberJson(mob),
      twilioLandline: perMinFromNumberJson(land),
    });
  }

  const countries = await listAllVoiceCountries(auth);
  const twilioAllCountriesPrefixRangeUsd: TwilioVoicePricingExport["twilioAllCountriesPrefixRangeUsd"] = [];

  for (const c of countries) {
    const iso = String(c.iso_country || "").trim();
    if (!iso) continue;
    const detail = await fetchJson(`https://pricing.twilio.com/v2/Voice/Countries/${iso}`, auth);
    if (!detail) continue;
    const prefixes = (detail.outbound_prefix_prices as Array<Record<string, unknown>>) || [];
    const prices = prefixes
      .map((p) => Number(p.current_price ?? p.base_price))
      .filter((n) => Number.isFinite(n) && n > 0);
    twilioAllCountriesPrefixRangeUsd.push({
      iso,
      country: String(detail.country || c.country || iso),
      currency: String(detail.price_unit || "USD"),
      minPerMin: prices.length ? Math.min(...prices) : null,
      maxPerMin: prices.length ? Math.max(...prices) : null,
    });
  }

  twilioAllCountriesPrefixRangeUsd.sort((a, b) => (a.country || "").localeCompare(b.country || ""));

  const payload: TwilioVoicePricingExport = {
    generatedAt: new Date().toISOString(),
    twilioOriginationNumber: from || null,
    twilioPriceUnit: "USD",
    twilioPricingSource: "Twilio Pricing API v2 (account-specific, auto-sync)",
    geoEnabledIso,
    morongwaUserCharges: morongwaChargesSnapshot(),
    twilioSampleMobileLandlinePerMinuteUsd,
    twilioAllCountriesPrefixRangeUsd,
  };

  writeJsonAtomic(LATEST_JSON, payload);
  writeJsonAtomic(CHARGES_JSON, payload);
  cachedExport = payload;
  lastSyncAt = payload.generatedAt;
  lastSyncOk = true;
  lastSyncError = null;

  logger.info("Twilio voice pricing sync completed", {
    countries: twilioAllCountriesPrefixRangeUsd.length,
    samples: twilioSampleMobileLandlinePerMinuteUsd.length,
  });

  return payload;
}

export async function runTwilioVoicePricingSyncSafe(): Promise<void> {
  if (!voicePricingSyncEnabled()) {
    logger.info("Twilio voice pricing sync skipped (disabled or missing credentials)");
    return;
  }
  try {
    await syncTwilioVoicePricing();
  } catch (err) {
    lastSyncOk = false;
    lastSyncError = err instanceof Error ? err.message : String(err);
    logger.warn("Twilio voice pricing sync failed", { error: lastSyncError });
  }
}
