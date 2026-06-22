/**
 * Registration abuse controls — bulk bots, virtual SMS numbers (+99899541…), junk display names.
 * See DOCS/SUSPICIOUS_USER_ACCOUNTS.md for incident samples.
 */
import User from "../data/models/User";
import { AppError } from "../middleware/errorHandler";
import { canonicalPhoneDigits } from "./phoneE164";
import { isValidForOtp, normalizePhone } from "./phoneValidation";
import { computePhoneLocale } from "./phoneCountryCurrency";

const KNOWN_JUNK_DISPLAY_NAMES = new Set(["fsfsd fsfsdf", "test test", "asdf asdf"]);

/** E.164 digit prefixes blocked for OTP + new registration (env extends defaults). */
const DEFAULT_BLOCKED_PHONE_PREFIXES = [
  "99899541", // Uzbekistan virtual-SMS farm (65+ junk accounts, Mar 2025)
  "998900", // Uzbekistan premium 0900-style (E.164)
];

function blockedPhonePrefixes(): string[] {
  const fromEnv = (process.env.REGISTRATION_BLOCK_PHONE_PREFIXES || "")
    .split(",")
    .map((p) => p.replace(/\D/g, ""))
    .filter(Boolean);
  const merged = new Set([...DEFAULT_BLOCKED_PHONE_PREFIXES, ...fromEnv]);
  return Array.from(merged);
}

export function isBlockedRegistrationPhonePrefix(digits: string): boolean {
  const d = String(digits || "").replace(/\D/g, "");
  if (!d) return false;
  return blockedPhonePrefixes().some((prefix) => d.startsWith(prefix));
}

/** Legacy spam imports used *@user.com placeholder emails. */
export function isDisposableRegistrationEmail(email: string): boolean {
  const e = String(email || "").trim().toLowerCase();
  if (!e.includes("@")) return false;
  const domain = e.split("@")[1] || "";
  if (domain === "user.com") return true;
  if (domain === "morongwa.local" && e.startsWith("wa_")) return false;
  return false;
}

/** Random keyboard mash or known junk labels (not real names). */
export function isJunkDisplayName(name: string): boolean {
  const raw = String(name || "").trim();
  if (!raw || raw.length < 2) return true;
  const lower = raw.toLowerCase();
  if (KNOWN_JUNK_DISPLAY_NAMES.has(lower)) return true;
  if (/^fsfsd\s+fsfsd/i.test(raw)) return true;

  const compact = lower.replace(/\s+/g, "");
  if (compact.length >= 18 && /^[a-z]+$/.test(compact)) {
    const vowels = (compact.match(/[aeiou]/g) || []).length;
    if (vowels / compact.length < 0.18) return true;
    if (/[bcdfghjklmnpqrstvwxyz]{8,}/i.test(compact)) return true;
  }

  if (/^[a-z]{10,}$/i.test(compact) && !/\s/.test(raw)) {
    const vowels = (compact.match(/[aeiou]/g) || []).length;
    if (vowels <= 2 && compact.length >= 12) return true;
  }

  return false;
}

export function registrationPhoneDigits(phone?: string): string {
  return canonicalPhoneDigits(phone || "") || normalizePhone(phone || "");
}

function maxRegistrationsPerPhonePrefixPerDay(): number {
  const n = Number(process.env.REGISTRATION_MAX_PER_PHONE_PREFIX_PER_DAY || 2);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 2;
}

function highRiskCountryCodes(): Set<string> {
  const raw = process.env.REGISTRATION_HIGH_RISK_COUNTRIES || "UZ";
  return new Set(
    raw
      .split(",")
      .map((c) => c.trim().toUpperCase())
      .filter((c) => /^[A-Z]{2}$/.test(c))
  );
}

async function countRecentRegistrationsForPhonePrefix(prefix: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const re = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
  return User.countDocuments({
    createdAt: { $gte: since },
    phone: re,
  });
}

export type RegistrationRiskAssessment = {
  allowed: boolean;
  reason?: string;
  flags: string[];
  score: number;
};

/** Synchronous pre-checks (no DB). */
export function assessRegistrationRiskSync(input: {
  name: string;
  email?: string;
  phone?: string;
}): RegistrationRiskAssessment {
  const flags: string[] = [];
  let score = 0;

  const name = String(input.name || "").trim();
  const email = String(input.email || "").trim().toLowerCase();
  const phoneDigits = registrationPhoneDigits(input.phone);

  if (isJunkDisplayName(name)) {
    flags.push("JUNK_DISPLAY_NAME");
    score += 50;
  }

  if (email && isDisposableRegistrationEmail(email)) {
    flags.push("DISPOSABLE_EMAIL_DOMAIN");
    score += 40;
  }

  if (phoneDigits) {
    const otpCheck = isValidForOtp(phoneDigits);
    if (!otpCheck.valid) {
      flags.push("PREMIUM_OR_SHORTCODE_PHONE");
      score += 45;
    }
    if (isBlockedRegistrationPhonePrefix(phoneDigits)) {
      flags.push("BLOCKED_PHONE_PREFIX");
      score += 60;
    }
    const loc = computePhoneLocale(phoneDigits);
    if (loc.countryCode && highRiskCountryCodes().has(loc.countryCode)) {
      flags.push("HIGH_RISK_PHONE_COUNTRY");
      score += 8;
    }
  }

  const blocked =
    flags.includes("BLOCKED_PHONE_PREFIX") ||
    flags.includes("JUNK_DISPLAY_NAME") ||
    flags.includes("PREMIUM_OR_SHORTCODE_PHONE") ||
    flags.includes("DISPOSABLE_EMAIL_DOMAIN") ||
    score >= 50;

  let reason: string | undefined;
  if (flags.includes("BLOCKED_PHONE_PREFIX")) {
    reason =
      "This phone number range is not supported for registration. Use a standard mobile number or register with email.";
  } else if (flags.includes("JUNK_DISPLAY_NAME")) {
    reason = "Please enter your real name (not random characters or placeholder text).";
  } else if (flags.includes("PREMIUM_OR_SHORTCODE_PHONE")) {
    reason = otpCheckReason(phoneDigits);
  } else if (flags.includes("DISPOSABLE_EMAIL_DOMAIN")) {
    reason = "Please use a personal email address you control.";
  }

  return { allowed: !blocked, reason, flags, score: Math.min(100, score) };
}

function otpCheckReason(phoneDigits: string): string {
  const check = isValidForOtp(phoneDigits);
  return check.reason || "Premium and shortcode numbers are not supported for verification";
}

/** Full registration gate — throws AppError when blocked. */
export async function assertRegistrationAllowed(input: {
  name: string;
  email?: string;
  phone?: string;
}): Promise<RegistrationRiskAssessment> {
  const assessment = assessRegistrationRiskSync(input);
  if (!assessment.allowed) {
    throw new AppError(assessment.reason || "Registration not allowed", 400);
  }

  const phoneDigits = registrationPhoneDigits(input.phone);
  if (phoneDigits) {
    for (const prefix of blockedPhonePrefixes()) {
      if (!phoneDigits.startsWith(prefix)) continue;
      const recent = await countRecentRegistrationsForPhonePrefix(prefix);
      if (recent >= maxRegistrationsPerPhonePrefixPerDay()) {
        throw new AppError(
          "Too many sign-ups from this phone number range today. Try again tomorrow or use email registration.",
          429
        );
      }
    }
  }

  if (isJunkDisplayName(String(input.name || "").trim())) {
    throw new AppError("Please enter your real name (not random characters or placeholder text).", 400);
  }

  return assessment;
}

/** Mongo match extras for Qwerty Users / discovery — excludes known junk patterns. */
export function publicDiscoveryUserFilter(): Record<string, unknown> {
  return {
    email: { $not: /@user\.com$/i },
    name: {
      $not: /^(fsfsd\s+fsfsdf|[a-z]{18,})$/i,
    },
    $nor: [{ name: /^[bcdfghjklmnpqrstvwxyz]{14,}$/i }],
  };
}

export function isEligibleForPublicDiscovery(user: {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  active?: boolean | null;
  suspended?: boolean | null;
}): boolean {
  if (user.active === false || user.suspended) return false;
  if (isDisposableRegistrationEmail(String(user.email || ""))) return false;
  if (isJunkDisplayName(String(user.name || ""))) return false;
  const digits = registrationPhoneDigits(user.phone || undefined);
  if (digits && isBlockedRegistrationPhonePrefix(digits)) return false;
  return true;
}
