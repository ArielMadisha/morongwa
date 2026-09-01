/** Resolve free-text peer field into wallet send/request API params. */
export function resolveWalletPeerTarget(raw: string): {
  toUserId?: string;
  toUsername?: string;
  toEmail?: string;
  toPhone?: string;
} {
  const value = String(raw || "").trim();
  if (!value) return {};
  if (/^[a-f0-9]{24}$/i.test(value)) return { toUserId: value };
  if (value.includes("@")) return { toEmail: value.toLowerCase() };
  const digits = value.replace(/\D/g, "");
  if (/^\+?\d[\d\s-]{7,}$/.test(value) && digits.length >= 8) return { toPhone: value };
  return { toUsername: value.toLowerCase() };
}
