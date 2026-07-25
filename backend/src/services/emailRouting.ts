const DEFAULT_DISPUTES_INBOX_EMAIL = "disputes@qwertymates.com";
const DEFAULT_HR_INBOX_EMAIL = "hr@qwertymates.com";
const DEFAULT_ORDERS_INBOX_BOTSWANA = "botswana@qwertymates.com";
const DEFAULT_ORDERS_INBOX_ZAMBIA = "zambia@qwertymates.com";

/** Parse comma/semicolon-separated email list (lowercased, deduped). */
export function parseEmailRecipientList(raw: string | undefined): string[] {
  const parts = String(raw || "")
    .split(/[,;]/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set(parts)];
}

export function resolveDisputesInboxEmail(): string {
  return (
    String(process.env.DISPUTES_INBOX_EMAIL || DEFAULT_DISPUTES_INBOX_EMAIL).trim() ||
    DEFAULT_DISPUTES_INBOX_EMAIL
  );
}

export function resolveHrInboxEmail(): string {
  return String(process.env.HR_INBOX_EMAIL || DEFAULT_HR_INBOX_EMAIL).trim() || DEFAULT_HR_INBOX_EMAIL;
}

/** Regional marketplace order inbox — added alongside primary + orders@ CC (never replaces). */
export function resolveRegionalOrdersInbox(countryCode?: string): string | null {
  const cc = String(countryCode || "")
    .trim()
    .toUpperCase();
  if (cc === "BW") {
    return (
      String(process.env.ORDERS_INBOX_BOTSWANA || DEFAULT_ORDERS_INBOX_BOTSWANA).trim() ||
      DEFAULT_ORDERS_INBOX_BOTSWANA
    );
  }
  if (cc === "ZM") {
    return (
      String(process.env.ORDERS_INBOX_ZAMBIA || DEFAULT_ORDERS_INBOX_ZAMBIA).trim() ||
      DEFAULT_ORDERS_INBOX_ZAMBIA
    );
  }
  return null;
}

/** Employment / applications — route copies to hr@ in addition to platform ops. */
const HR_NOTIFICATION_TYPE_PATTERNS = [
  /^TUCKSHOP_CASH_AGENT/i,
  /^SUPPLIER_APPLICATION/i,
  /^ARTIST_APPLICATION/i,
  /^ARTIST_APPLY/i,
  /^JOB_/i,
  /^EMPLOYMENT/i,
  /^WA_.*AGENT/i,
  /^HR_/i,
];

export function shouldNotifyHrInbox(notificationType: string): boolean {
  const t = String(notificationType || "").trim();
  if (!t) return false;
  return HR_NOTIFICATION_TYPE_PATTERNS.some((re) => re.test(t));
}

/** Merge optional regional inbox into a recipient list (deduped). */
export function withRegionalOrdersRecipient(recipients: string[], countryCode?: string): string[] {
  const regional = resolveRegionalOrdersInbox(countryCode);
  const merged = [...parseEmailRecipientList(recipients.join(",")), ...(regional ? [regional] : [])];
  return [...new Set(merged.map((e) => e.toLowerCase()))];
}
