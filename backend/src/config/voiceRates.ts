/**
 * Per-minute PSTN voice rates billed from Qwertymates Wallet (ZAR).
 * Override via env JSON: VOICE_RATES_JSON={"ZA":{"mobile":0.89}}
 */
export type VoiceLineType = "mobile" | "landline";

export interface VoiceRateRow {
  mobile: number;
  landline: number;
  currency: string;
}

const DEFAULT_RATES: Record<string, VoiceRateRow> = {
  ZA: { mobile: 0.89, landline: 0.69, currency: "ZAR" },
  BW: { mobile: 1.15, landline: 1.15, currency: "ZAR" },
  LS: { mobile: 1.25, landline: 1.25, currency: "ZAR" },
  SZ: { mobile: 1.2, landline: 1.25, currency: "ZAR" },
  ZW: { mobile: 1.35, landline: 1.35, currency: "ZAR" },
  ZM: { mobile: 1.35, landline: 1.35, currency: "ZAR" },
  MZ: { mobile: 1.45, landline: 1.45, currency: "ZAR" },
  NA: { mobile: 1.25, landline: 1.25, currency: "ZAR" },
  INT: { mobile: 2.95, landline: 2.95, currency: "ZAR" },
};

function loadRates(): Record<string, VoiceRateRow> {
  try {
    const raw = String(process.env.VOICE_RATES_JSON || "").trim();
    if (!raw) return DEFAULT_RATES;
    const parsed = JSON.parse(raw) as Record<string, VoiceRateRow>;
    return { ...DEFAULT_RATES, ...parsed };
  } catch {
    return DEFAULT_RATES;
  }
}

export function voiceConnectFeeZar(): number {
  const n = Number(process.env.VOICE_CONNECT_FEE_ZAR ?? 0.35);
  return Number.isFinite(n) && n >= 0 ? n : 0.35;
}

export function voiceMinBalanceZar(): number {
  const n = Number(process.env.VOICE_MIN_WALLET_BALANCE_ZAR ?? 5);
  return Number.isFinite(n) && n > 0 ? n : 5;
}

/** Rough line-type guess from E.164 digits (billing estimate). */
export function guessLineType(e164Digits: string): VoiceLineType {
  const d = String(e164Digits || "").replace(/\D/g, "");
  if (d.startsWith("27") && /^27[678]\d{8}$/.test(d)) return "mobile";
  if (d.startsWith("267") && /^2677\d{7}$/.test(d)) return "mobile";
  if (d.startsWith("268") && /^2687[6789]\d{6}$/.test(d)) return "mobile";
  return "landline";
}

export function countryKeyFromDigits(e164Digits: string): string {
  const d = String(e164Digits || "").replace(/\D/g, "");
  if (d.startsWith("27")) return "ZA";
  if (d.startsWith("267")) return "BW";
  if (d.startsWith("266")) return "LS";
  if (d.startsWith("263")) return "ZW";
  if (d.startsWith("260")) return "ZM";
  if (d.startsWith("258")) return "MZ";
  if (d.startsWith("264")) return "NA";
  if (d.startsWith("268")) return "SZ";
  return "INT";
}

export function quoteVoiceMinuteRateZar(destinationDigits: string): {
  country: string;
  lineType: VoiceLineType;
  perMinute: number;
  connectFee: number;
  currency: string;
} {
  const rates = loadRates();
  const country = countryKeyFromDigits(destinationDigits);
  const lineType = guessLineType(destinationDigits);
  const row = rates[country] || rates.INT;
  const perMinute = lineType === "mobile" ? row.mobile : row.landline;
  return {
    country,
    lineType,
    perMinute,
    connectFee: voiceConnectFeeZar(),
    currency: row.currency,
  };
}

export function estimateCallCostZar(destinationDigits: string, estimatedMinutes = 1): number {
  const q = quoteVoiceMinuteRateZar(destinationDigits);
  return q.connectFee + q.perMinute * Math.max(1, estimatedMinutes);
}

export function voiceEnabled(): boolean {
  if (String(process.env.VOICE_ENABLED || "1").trim() === "0") return false;
  return voiceClientConfigured();
}

/** Twilio Voice SDK (browser/app WebRTC → PSTN). Requires API key + TwiML app. */
export function voiceClientConfigured(): boolean {
  if (String(process.env.VOICE_ENABLED || "1").trim() === "0") return false;
  const from = String(process.env.TWILIO_VOICE_FROM || process.env.TWILIO_SMS_FROM || "").trim();
  return !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_API_KEY_SID &&
    process.env.TWILIO_API_KEY_SECRET &&
    process.env.TWILIO_VOICE_APPLICATION_SID &&
    from
  );
}
