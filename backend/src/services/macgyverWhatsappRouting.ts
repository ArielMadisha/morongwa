import CountryOpsProfile from "../data/models/CountryOpsProfile";
import { detectCountryIsoFromPhoneDigits } from "../utils/phoneCountryCurrency";
import {
  buildMacGyverWhatsappSendProfile,
  normalizeMacGyverWaTwilioPool,
  type TwilioWhatsappSendProfile,
} from "../utils/twilioWaCredentials";

export type { TwilioWhatsappSendProfile };

/**
 * Resolve up to two outbound WhatsApp sender profiles for MacGyver replies in a country,
 * using Country Ops lines + per-line Twilio credential pools (WhatsApp only — main bot routing unchanged).
 */
export async function resolveMacGyverWhatsappOutboundProfilesForCountry(
  countryCode: string
): Promise<TwilioWhatsappSendProfile[]> {
  const cc = String(countryCode || "")
    .trim()
    .toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return [];

  const doc = await CountryOpsProfile.findOne({ countryCode: cc, active: true })
    .select("whatsappNumber whatsappNumber2 macgyverWaTwilioPool1 macgyverWaTwilioPool2")
    .lean();

  if (!doc) return [];

  const n1 = String((doc as any).whatsappNumber || "").trim();
  const n2 = String((doc as any).whatsappNumber2 || "").trim();

  const pool1Raw = String((doc as any).macgyverWaTwilioPool1 || "").trim();
  const pool1 = pool1Raw ? normalizeMacGyverWaTwilioPool(pool1Raw) : "wa_api";

  const pool2Raw = String((doc as any).macgyverWaTwilioPool2 || "").trim();
  const pool2 = pool2Raw ? normalizeMacGyverWaTwilioPool(pool2Raw) : n2 ? "twilio_subaccount" : "wa_api";

  const out: TwilioWhatsappSendProfile[] = [];
  const seen = new Set<string>();

  if (n1) {
    const p = buildMacGyverWhatsappSendProfile(n1, pool1);
    if (p && !seen.has(p.whatsappFrom)) {
      seen.add(p.whatsappFrom);
      out.push(p);
    }
  }
  if (n2) {
    const p = buildMacGyverWhatsappSendProfile(n2, pool2);
    if (p && !seen.has(p.whatsappFrom)) {
      seen.add(p.whatsappFrom);
      out.push(p);
    }
  }

  return out;
}

/** Infer ISO country from user digits, then load MacGyver outbound profiles for that territory. */
export async function resolveMacGyverWhatsappOutboundProfilesForUserPhoneDigits(
  userDigits: string
): Promise<TwilioWhatsappSendProfile[]> {
  const iso = detectCountryIsoFromPhoneDigits(userDigits);
  if (!iso) return [];
  return resolveMacGyverWhatsappOutboundProfilesForCountry(iso);
}

/** Stable pick when multiple MacGyver lines exist (e.g. hash customer chat id). */
export function pickMacGyverWhatsappProfileRoundRobin(
  profiles: TwilioWhatsappSendProfile[],
  seed: string
): TwilioWhatsappSendProfile | null {
  if (!profiles.length) return null;
  const s = String(seed || "seed");
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return profiles[h % profiles.length]!;
}
