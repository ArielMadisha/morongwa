import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

const DEFAULT_COUNTRIES: CountryCode[] = ["ZA", "BW", "LS", "NA", "SZ", "ZW", "ZM", "MZ"];

function countryTryOrder(digitsOnly: string): CountryCode[] {
  const d = String(digitsOnly || "").replace(/\D/g, "");
  if (d.startsWith("267") || (d.length === 8 && d.startsWith("7"))) {
    return ["BW", "ZA", "LS", "NA", "SZ", "ZW", "ZM", "MZ"];
  }
  if (d.startsWith("266")) return ["LS", "ZA", "BW", "NA", "SZ", "ZW", "ZM", "MZ"];
  if (d.startsWith("0")) return ["ZA", "BW", "LS", "NA", "SZ", "ZW", "ZM", "MZ"];
  return DEFAULT_COUNTRIES;
}

function isAcceptablePhone(pn: ReturnType<typeof parsePhoneNumberFromString>): boolean {
  if (!pn?.isValid()) return false;
  const t = pn.getType();
  if (!t) return true;
  return t === "MOBILE" || t === "FIXED_LINE_OR_MOBILE" || t === "FIXED_LINE";
}

/**
 * Canonical E.164 digits without "+" (e.g. 27821234567, 267718453737).
 * Used as OTP store key and for Twilio `to`.
 */
export function canonicalPhoneDigits(
  phone: string,
  defaultCountries: CountryCode[] = DEFAULT_COUNTRIES
): string | null {
  const raw = String(phone || "").trim();
  if (!raw) return null;

  const digitsOnly = raw.replace(/\D/g, "");
  if (!digitsOnly) return null;

  const intlCandidate = raw.startsWith("+") ? raw : `+${digitsOnly}`;
  const intl = parsePhoneNumberFromString(intlCandidate);
  if (isAcceptablePhone(intl)) return intl!.number.replace(/^\+/, "");

  if (digitsOnly.startsWith("0")) {
    for (const cc of countryTryOrder(digitsOnly)) {
      const local = parsePhoneNumberFromString(digitsOnly, cc);
      if (isAcceptablePhone(local)) return local!.number.replace(/^\+/, "");
    }
    return null;
  }

  for (const cc of countryTryOrder(digitsOnly)) {
    const local = parsePhoneNumberFromString(digitsOnly, cc);
    if (isAcceptablePhone(local)) return local!.number.replace(/^\+/, "");
  }

  return null;
}

export function formatPhoneE164(
  phone: string,
  defaultCountries?: CountryCode[]
): string | null {
  const digits = canonicalPhoneDigits(phone, defaultCountries);
  return digits ? `+${digits}` : null;
}

/** ISO country from canonical digits (ZA, BW, …). */
export function countryIsoFromCanonicalDigits(digits: string): string | null {
  const d = String(digits || "").replace(/\D/g, "");
  if (!d) return null;
  try {
    const pn = parsePhoneNumberFromString(`+${d}`);
    if (pn?.country) return pn.country;
  } catch {
    /* fall through */
  }
  if (d.startsWith("267")) return "BW";
  if (d.startsWith("27")) return "ZA";
  if (d.startsWith("266")) return "LS";
  return null;
}
