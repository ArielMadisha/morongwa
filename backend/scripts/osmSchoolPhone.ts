/**
 * Parse OSM contact tags into E.164 using libphonenumber-js with a default region.
 */

import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

const PHONE_TAG_KEYS = ["contact:phone", "phone", "contact:mobile", "mobile"] as const;

export function phoneFromOsmTags(
  tags: Record<string, string> | undefined,
  defaultCountry: CountryCode
): string | undefined {
  if (!tags) return undefined;
  for (const k of PHONE_TAG_KEYS) {
    const v = tags[k];
    if (!v || typeof v !== "string") continue;
    const first = v.split(/[;/|]/)[0].trim();
    if (!first) continue;
    try {
      const p = parsePhoneNumberFromString(first, defaultCountry);
      if (p?.isValid()) return p.format("E.164");
    } catch {
      /* ignore */
    }
  }
  return undefined;
}
