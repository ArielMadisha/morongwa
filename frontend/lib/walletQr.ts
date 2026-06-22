/** Parse ACBPayWallet QR payload (ACBPAY:{userId} or raw 24-char id). */
export function parseAcbPayUserId(raw: string): string | null {
  const t = String(raw || '').trim();
  const prefixed = t.match(/^ACBPAY:([a-f0-9]{24})$/i);
  if (prefixed) return prefixed[1];
  if (/^[a-f0-9]{24}$/i.test(t)) return t;
  return null;
}
