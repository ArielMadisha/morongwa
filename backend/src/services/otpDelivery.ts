import twilio from "twilio";
import { logger } from "./monitoring";
import { formatPhoneE164, canonicalPhoneDigits, countryIsoFromCanonicalDigits } from "../utils/phoneE164";
import { resolveWhatsappSendProfile } from "../utils/twilioWaCredentials";
import { AppError } from "../middleware/errorHandler";

type OtpChannel = "sms" | "whatsapp";

function getTwilioClient() {
  const sid = process.env.TWILIO_ACCOUNT_SID || "";
  const token = process.env.TWILIO_AUTH_TOKEN || "";
  if (!sid || !token) return null;
  return twilio(sid, token);
}

/**
 * Country-specific SMS From numbers (E.164). Checked before the global Messaging Service /
 * TWILIO_SMS_FROM so ZA merchants are not stuck on a US long code (Twilio 30003).
 * Order matters: BW (+267) / LS (+266) before ZA (+27).
 */
function resolveRegionalSmsFromForDigits(digits: string): string {
  const d = String(digits || "").replace(/\D/g, "");
  if (d.startsWith("267")) {
    return String(process.env.TWILIO_SMS_FROM_BW || "").trim();
  }
  if (d.startsWith("266")) {
    return String(process.env.TWILIO_SMS_FROM_LS || "").trim();
  }
  if (d.startsWith("27")) {
    return String(process.env.TWILIO_SMS_FROM_ZA || "").trim();
  }
  return "";
}

function messagingServiceSid(): string {
  return String(process.env.TWILIO_SMS_MESSAGING_SERVICE_SID || "").trim();
}

/**
 * Prefer regional From when set; otherwise Messaging Service; else global TWILIO_SMS_FROM.
 * Regional From must win so a US-only Messaging Service cannot override TWILIO_SMS_FROM_ZA.
 */
export function resolveSmsSendParams(digits: string): {
  from?: string;
  messagingServiceSid?: string;
  source: "regional" | "messaging_service" | "global_from" | "none";
} {
  const regional = resolveRegionalSmsFromForDigits(digits);
  if (regional) return { from: regional, source: "regional" };
  const msgService = messagingServiceSid();
  if (msgService) return { messagingServiceSid: msgService, source: "messaging_service" };
  const globalFrom = String(process.env.TWILIO_SMS_FROM || "").trim();
  if (globalFrom) return { from: globalFrom, source: "global_from" };
  return { source: "none" };
}

/** True when destination is ZA (+27) but no dedicated ZA SMS sender is configured. */
export function zaSmsSenderMissingForDigits(digits: string): boolean {
  const d = String(digits || "").replace(/\D/g, "");
  if (!d.startsWith("27") || d.startsWith("267") || d.startsWith("266")) return false;
  return !String(process.env.TWILIO_SMS_FROM_ZA || "").trim();
}

export function mapTwilioDeliveryError(err: unknown, channel: OtpChannel = "sms"): AppError {
  const e = err as { code?: number; message?: string; status?: number; moreInfo?: string };
  const code = Number(e?.code || 0);
  const raw = String(e?.message || "Failed to send verification message");
  const via = channel === "whatsapp" ? "WhatsApp" : "SMS";

  if (code === 21211 || code === 21614) {
    return new AppError(
      `That phone number does not look valid for ${via}. Use full international format, e.g. +27 82 123 4567 or +267 71 234 567.`,
      400
    );
  }
  if (code === 21408 || code === 21612) {
    return new AppError(
      `${via} cannot be delivered to this number from our provider yet. Try ${channel === "sms" ? "WhatsApp" : "SMS"} verification or email registration.`,
      503
    );
  }
  if (code === 21610) {
    return new AppError(
      `This number is not verified for ${via} on our messaging trial. Try ${channel === "sms" ? "WhatsApp" : "SMS"} or contact support.`,
      400
    );
  }
  if (code === 63007) {
    return new AppError(
      "WhatsApp verification sender is not configured correctly. Try SMS or email registration, or contact support.",
      503
    );
  }
  if (code === 63016 || code === 63024) {
    return new AppError(
      "Open WhatsApp and message Qwertymates first, then request the code again — or use SMS / email registration.",
      400
    );
  }
  if (code === 20429 || e?.status === 429) {
    return new AppError(`${via} provider is busy. Please wait a minute and try again.`, 429);
  }
  if (/not configured/i.test(raw)) {
    return new AppError(raw, 503);
  }
  logger.error(`Twilio OTP/${via} delivery failed`, { code, message: raw, moreInfo: e?.moreInfo });
  return new AppError(
    `We could not send the verification ${via} message right now. Try ${channel === "sms" ? "WhatsApp" : "SMS"} or email registration, or try again shortly.`,
    503
  );
}

export async function sendOtpCode(params: {
  phone: string;
  channel: OtpChannel;
  otp: string;
}) {
  const { phone, channel, otp } = params;
  const digits = canonicalPhoneDigits(phone);
  const to = formatPhoneE164(phone);
  if (!digits || !to) {
    throw new AppError(
      "Invalid phone number. Use international format, e.g. +27 82 123 4567 or +267 71 234 567.",
      400
    );
  }

  const brand = process.env.OTP_BRAND_NAME || "Qwertymates";
  const text = `Your ${brand} verification code is ${otp}. It expires in 5 minutes.`;

  if (channel === "whatsapp") {
    const profile = resolveWhatsappSendProfile(null, to, null);
    if (!profile) {
      throw new AppError("WhatsApp verification is not configured. Try SMS or email registration.", 503);
    }
    const waClient = twilio(profile.accountSid, profile.authToken);
    try {
      const msg = await waClient.messages.create({
        to: `whatsapp:${to}`,
        from: profile.whatsappFrom,
        body: text,
      });
      return { sent: true, provider: "twilio" as const, sid: msg.sid };
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw mapTwilioDeliveryError(err, "whatsapp");
    }
  }

  const client = getTwilioClient();
  if (!client) {
    if (process.env.NODE_ENV !== "production") {
      logger.warn(`[DEV OTP] ${to} (${channel}): ${otp}`);
      return { sent: true, provider: "dev" as const };
    }
    throw new AppError("Twilio is not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.", 503);
  }

  const sender = resolveSmsSendParams(digits);

  try {
    if (sender.source === "none") {
      throw new AppError("SMS sender is not configured. Try WhatsApp verification instead.", 503);
    }
    if (zaSmsSenderMissingForDigits(digits)) {
      logger.warn("SMS to ZA without TWILIO_SMS_FROM_ZA — US/global From often fails (Twilio 30003)", {
        to,
        senderSource: sender.source,
        from: sender.from || null,
      });
    }
    const payload: Parameters<typeof client.messages.create>[0] = {
      to,
      body: text,
      ...(sender.messagingServiceSid
        ? { messagingServiceSid: sender.messagingServiceSid }
        : { from: sender.from }),
    };
    const msg = await client.messages.create(payload);
    return { sent: true, provider: "twilio" as const, sid: msg.sid, from: sender.from || null };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw mapTwilioDeliveryError(err, "sms");
  }
}

/** Send custom SMS (e.g. payment verification, money request). */
export async function sendSms(params: { phone: string; text: string; channel?: "sms" | "whatsapp" }) {
  const { phone, text, channel = "sms" } = params;
  const digits = canonicalPhoneDigits(phone);
  const to = formatPhoneE164(phone);
  if (!to || !digits) throw new AppError("Invalid phone format", 400);

  const client = getTwilioClient();
  if (!client) {
    if (process.env.NODE_ENV !== "production") {
      logger.warn(`[DEV SMS] ${to}: ${text}`);
      return { sent: true, provider: "dev" as const };
    }
    throw new AppError("Twilio is not configured.", 503);
  }

  try {
    if (channel === "whatsapp") {
      const profile = resolveWhatsappSendProfile(null, to, null);
      if (!profile) throw new AppError("TWILIO_WHATSAPP_FROM is not configured.", 503);
      const waClient = twilio(profile.accountSid, profile.authToken);
      const msg = await waClient.messages.create({
        to: `whatsapp:${to}`,
        from: profile.whatsappFrom,
        body: text,
      });
      return { sent: true, provider: "twilio" as const, sid: msg.sid };
    }
    const sender = resolveSmsSendParams(digits);
    if (sender.source === "none") {
      throw new AppError("TWILIO_SMS_FROM or TWILIO_WHATSAPP_FROM required.", 503);
    }
    if (zaSmsSenderMissingForDigits(digits)) {
      logger.warn("SMS to ZA without TWILIO_SMS_FROM_ZA — US/global From often fails (Twilio 30003)", {
        to,
        senderSource: sender.source,
        from: sender.from || null,
      });
    }
    const msg = await client.messages.create({
      to,
      body: text,
      ...(sender.messagingServiceSid
        ? { messagingServiceSid: sender.messagingServiceSid }
        : { from: sender.from }),
    });
    return {
      sent: true,
      provider: "twilio" as const,
      sid: msg.sid,
      from: sender.from || null,
      senderSource: sender.source,
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw mapTwilioDeliveryError(err, channel);
  }
}

export function otpSmsChannelReady(): boolean {
  const twilioConfigured = !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);
  if (!twilioConfigured) return false;
  return !!(messagingServiceSid() || process.env.TWILIO_SMS_FROM);
}

export function otpSmsReadyForCountry(iso: string | null): boolean {
  if (!otpSmsChannelReady()) return false;
  if (!iso) return true;
  if (iso === "BW") return !!(process.env.TWILIO_SMS_FROM_BW || messagingServiceSid() || process.env.TWILIO_SMS_FROM);
  if (iso === "LS") return !!(process.env.TWILIO_SMS_FROM_LS || messagingServiceSid() || process.env.TWILIO_SMS_FROM);
  // ZA OTP can still attempt via US From, but merchant SMS last-resort needs TWILIO_SMS_FROM_ZA for reliable delivery.
  if (iso === "ZA") return !!(process.env.TWILIO_SMS_FROM_ZA || messagingServiceSid() || process.env.TWILIO_SMS_FROM);
  return true;
}

export { countryIsoFromCanonicalDigits };
