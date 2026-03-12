import twilio from "twilio";
import { logger } from "./monitoring";

type OtpChannel = "sms" | "whatsapp";

function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("0")) return `+27${digits.slice(1)}`;
  if (digits.startsWith("27")) return `+${digits}`;
  if (digits.length >= 10 && !digits.startsWith("+")) return `+${digits}`;
  return phone.startsWith("+") ? phone : `+${digits}`;
}

function getTwilioClient() {
  const sid = process.env.TWILIO_ACCOUNT_SID || "";
  const token = process.env.TWILIO_AUTH_TOKEN || "";
  if (!sid || !token) return null;
  return twilio(sid, token);
}

export async function sendOtpCode(params: {
  phone: string;
  channel: OtpChannel;
  otp: string;
}) {
  const { phone, channel, otp } = params;
  const client = getTwilioClient();
  const to = toE164(phone);
  if (!to) {
    throw new Error("Invalid phone format");
  }

  const text = `Your Morongwa verification code is ${otp}. It expires in 5 minutes.`;

  // In development, allow fallback logging if Twilio is not configured.
  if (!client) {
    if (process.env.NODE_ENV !== "production") {
      logger.warn(`[DEV OTP] ${to} (${channel}): ${otp}`);
      return { sent: true, provider: "dev" as const };
    }
    throw new Error("Twilio is not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.");
  }

  const smsFrom = process.env.TWILIO_SMS_FROM || "";
  const whatsappFrom = process.env.TWILIO_WHATSAPP_FROM || "";

  if (channel === "sms") {
    if (!smsFrom) {
      throw new Error("TWILIO_SMS_FROM is not configured.");
    }
    const msg = await client.messages.create({
      to,
      from: smsFrom,
      body: text,
    });
    return { sent: true, provider: "twilio" as const, sid: msg.sid };
  }

  if (!whatsappFrom) {
    throw new Error("TWILIO_WHATSAPP_FROM is not configured.");
  }
  const msg = await client.messages.create({
    to: `whatsapp:${to}`,
    from: whatsappFrom.startsWith("whatsapp:") ? whatsappFrom : `whatsapp:${whatsappFrom}`,
    body: text,
  });
  return { sent: true, provider: "twilio" as const, sid: msg.sid };
}

/** Send custom SMS (e.g. payment verification, money request). */
export async function sendSms(params: { phone: string; text: string; channel?: "sms" | "whatsapp" }) {
  const { phone, text, channel = "sms" } = params;
  const client = getTwilioClient();
  const to = toE164(phone);
  if (!to) throw new Error("Invalid phone format");
  if (!client) {
    if (process.env.NODE_ENV !== "production") {
      logger.warn(`[DEV SMS] ${to}: ${text}`);
      return { sent: true, provider: "dev" as const };
    }
    throw new Error("Twilio is not configured.");
  }
  const smsFrom = process.env.TWILIO_SMS_FROM || "";
  const whatsappFrom = process.env.TWILIO_WHATSAPP_FROM || "";
  if (channel === "whatsapp" && whatsappFrom) {
    const msg = await client.messages.create({
      to: `whatsapp:${to}`,
      from: whatsappFrom.startsWith("whatsapp:") ? whatsappFrom : `whatsapp:${whatsappFrom}`,
      body: text,
    });
    return { sent: true, provider: "twilio" as const, sid: msg.sid };
  }
  if (smsFrom) {
    const msg = await client.messages.create({ to, from: smsFrom, body: text });
    return { sent: true, provider: "twilio" as const, sid: msg.sid };
  }
  throw new Error("TWILIO_SMS_FROM or TWILIO_WHATSAPP_FROM required.");
}

