/** Shared text rules for Tshwane local errands (WhatsApp + mobile API). */

const LOCAL_ERRAND_PICKUP_TEXT_MIN_LEN = 12;
const LOCAL_ERRAND_DELIVERY_TEXT_MIN_LEN = 16;

export function stripWaInvisibleChars(input: string): string {
  return String(input || "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF\u2060\u00AD\u061C\u202A-\u202E\u2066-\u2069]/g, "")
    .replace(/\uFE0F/g, "")
    .trim();
}

function isLocalErrandSkipToken(lower: string): boolean {
  return ["skip", "none", "no", "n/a", "-", "na", "nil"].includes(lower);
}

export function isSubstantialLocalErrandPickupText(raw: string): boolean {
  const t = stripWaInvisibleChars(String(raw || ""));
  const lower = t.toLowerCase();
  if (!t || isLocalErrandSkipToken(lower)) return false;
  if (t.length < LOCAL_ERRAND_PICKUP_TEXT_MIN_LEN) return false;
  const words = t.split(/\s+/).filter(Boolean);
  return words.length >= 2;
}

export function isSubstantialLocalErrandDeliveryText(raw: string): boolean {
  const t = stripWaInvisibleChars(String(raw || ""));
  const lower = t.toLowerCase();
  if (!t || isLocalErrandSkipToken(lower)) return false;
  if (t.length < LOCAL_ERRAND_DELIVERY_TEXT_MIN_LEN) return false;
  const words = t.split(/\s+/).filter(Boolean);
  return words.length >= 2;
}
