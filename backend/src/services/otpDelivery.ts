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

function resolveSmsFromForDigits(digits: string): string {
  const d = String(digits || "").replace(/\D/g, "");
  if (d.startsWith("267")) {
    const bw = String(process.env.TWILIO_SMS_FROM_BW || "").trim();
    if (bw) return bw;
  }
  if (d.startsWith("266")) {
    const ls = String(process.env.TWILIO_SMS_FROM_LS || "").trim();
    if (ls) return ls;
  }
  return String(process.env.TWILIO_SMS_FROM || "").trim();
}

function messagingServiceSid(): string {
  return String(process.env.TWILIO_SMS_MESSAGING_SERVICE_SID || "").trim();
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

  const smsFrom = resolveSmsFromForDigits(digits);
  const msgService = messagingServiceSid();

  try {
    if (!smsFrom && !msgService) {
      throw new AppError("SMS sender is not configured. Try WhatsApp verification instead.", 503);
    }
    const payload: Parameters<typeof client.messages.create>[0] = {
      to,
      body: text,
      ...(msgService ? { messagingServiceSid: msgService } : { from: smsFrom }),
    };
    const msg = await client.messages.create(payload);
    return { sent: true, provider: "twilio" as const, sid: msg.sid };
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

  const smsFrom = resolveSmsFromForDigits(digits);
  const msgService = messagingServiceSid();

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
    if (smsFrom || msgService) {
      const msg = await client.messages.create({
        to,
        body: text,
        ...(msgService ? { messagingServiceSid: msgService } : { from: smsFrom }),
      });
      return { sent: true, provider: "twilio" as const, sid: msg.sid };
    }
    throw new AppError("TWILIO_SMS_FROM or TWILIO_WHATSAPP_FROM required.", 503);
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
  return true;
}

export { countryIsoFromCanonicalDigits };
