/**
 * Normalize Botswana phone numbers to E.164 (+267…).
 * OSM tags may use "7XXXXXXXX", "+267 …", "00267…", etc.
 */

export function normalizeBotswanaPhone(raw: string | undefined | null): string | undefined {
  if (raw == null || typeof raw !== "string") return undefined;
  const first = raw.split(/[;/|]/)[0].trim();
  if (!first) return undefined;

  let s = first.replace(/[\s().-]/g, "");
  if (!s) return undefined;

  if (s.startsWith("00")) s = `+${s.slice(2)}`;
  if (s.startsWith("+267")) {
    const rest = s.slice(4).replace(/\D/g, "");
    if (rest.length < 7 || rest.length > 12) return undefined;
    return `+267${rest}`;
  }
  if (s.startsWith("267")) {
    const rest = s.slice(3).replace(/\D/g, "");
    if (rest.length < 7 || rest.length > 12) return undefined;
    return `+267${rest}`;
  }
  // Local leading 0 (e.g. 07…)
  if (/^0\d{7,11}$/.test(s)) {
    const rest = s.slice(1).replace(/\D/g, "");
    return `+267${rest}`;
  }
  const digits = s.replace(/\D/g, "");
  if (digits.length >= 8 && digits.length <= 12) {
    if (digits.startsWith("267")) return `+${digits}`;
    return `+267${digits}`;
  }
  return undefined;
}

export function phoneFromOsmTags(tags: Record<string, string> | undefined): string | undefined {
  if (!tags) return undefined;
  const keys = ["contact:phone", "phone", "contact:mobile", "mobile"] as const;
  for (const k of keys) {
    const v = tags[k];
    if (v && typeof v === "string") {
      const n = normalizeBotswanaPhone(v);
      if (n) return n;
    }
  }
  return undefined;
}
