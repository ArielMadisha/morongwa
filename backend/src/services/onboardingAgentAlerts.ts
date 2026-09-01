import { sendSms } from "./otpDelivery";
import { formatPhoneE164 } from "../utils/phoneE164";
import { logger } from "./monitoring";

/**
 * Hard guarantee — every WhatsApp Onboarding Agent application alerts this number
 * (Jobs menu → Register as Onboarding Agent).
 */
const REQUIRED_ONBOARDING_OPS_WHATSAPP = "+27661294468";

/**
 * Staff WhatsApp numbers for new Onboarding Agent applications.
 * - Always includes +27661294468.
 * - ONBOARDING_OPS_WHATSAPP — optional comma-separated extras (merged, de-duped).
 */
export function resolveOnboardingOpsWhatsAppPhones(): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string) => {
    const e164 = formatPhoneE164(raw.trim());
    if (!e164 || seen.has(e164)) return;
    seen.add(e164);
    out.push(e164);
  };
  push(REQUIRED_ONBOARDING_OPS_WHATSAPP);
  const raw = String(process.env.ONBOARDING_OPS_WHATSAPP || "").trim();
  if (raw) {
    for (const part of raw.split(/[,;]+/)) {
      if (part.trim()) push(part);
    }
  }
  return out;
}

export type OnboardingAgentAlertMeta = {
  agentFullName?: string;
  agentIdPassport?: string;
  bankAccount?: string;
  phone?: string;
  userId?: string;
  auditLogId?: string;
};

/** Non-blocking WhatsApp alert to ops phones when a Jobs onboarding application is submitted. */
export async function alertOnboardingAgentApplicationReceived(
  meta: OnboardingAgentAlertMeta
): Promise<void> {
  const phones = resolveOnboardingOpsWhatsAppPhones();
  if (!phones.length) return;

  const name = String(meta.agentFullName || "—").trim() || "—";
  const idPass = String(meta.agentIdPassport || "—").trim() || "—";
  const bank = String(meta.bankAccount || "").trim();
  const applicantPhone = String(meta.phone || "—").trim() || "—";
  const bankLine = bank
    ? bank.length > 180
      ? `${bank.slice(0, 180)}…`
      : bank
    : "(not provided)";

  const text = [
    "🆕 Onboarding Agent application (WhatsApp Jobs)",
    "",
    `Name: ${name}`,
    `ID / Passport: ${idPass}`,
    `Bank: ${bankLine}`,
    `Applicant WA: +${String(applicantPhone).replace(/\D/g, "") || applicantPhone}`,
    meta.userId ? `User: ${meta.userId}` : "",
    "",
    "Admin: /admin/onboarding-agents",
  ]
    .filter(Boolean)
    .join("\n");

  for (const phone of phones) {
    try {
      await sendSms({ phone, text, channel: "whatsapp" });
    } catch (err: unknown) {
      logger.warn("Onboarding agent ops WhatsApp alert failed (non-fatal)", {
        phone,
        error: String((err as { message?: string })?.message || err),
      });
    }
  }
}
