/**
 * Human-readable wallet history lines for ACBPay Wallet.
 * Uses `type` + `reference` patterns produced by backend (payments, wallet, tasks, checkout, agents, VAS, WhatsApp).
 */

export type WalletTxInput = {
  type?: string;
  reference?: string;
  amount?: number;
  orderBreakdown?: unknown;
};

function refStr(tx: WalletTxInput): string {
  return String(tx?.reference || "").trim();
}

function shortRef(r: string, max = 28): string {
  if (!r) return "";
  if (r.length <= max) return r;
  return `${r.slice(0, 12)}…${r.slice(-8)}`;
}

const OBJECT_ID_RE = /^[a-f0-9]{24}$/i;

/** Secondary line: reference + context for disputes / support. */
export function getWalletTransactionSubtitle(tx: WalletTxInput): string | null {
  const r = refStr(tx);
  const parts: string[] = [];
  if (r) parts.push(`Ref ${shortRef(r, 40)}`);
  if (tx?.type === "debit" && r.startsWith("ORDER-") && tx.orderBreakdown && typeof tx.orderBreakdown === "object") {
    const ob = tx.orderBreakdown as { items?: Array<{ title?: string }> };
    const titles = (ob.items || []).map((i) => String(i?.title || "").trim()).filter(Boolean);
    if (titles.length) parts.push(titles.slice(0, 2).join(", ") + (titles.length > 2 ? "…" : ""));
  }
  return parts.length ? parts.join(" · ") : null;
}

export function getWalletTransactionTitle(tx: WalletTxInput): string {
  const type = String(tx?.type || "").toLowerCase();
  const r = refStr(tx);

  if (type === "topup") {
    if (r.startsWith("ADDCARD-")) return "Add saved card (R1 tokenization credit)";
    if (r.startsWith("TOPUP-MR-")) return "Top-up toward a money request";
    if (r.startsWith("TOPUP-")) return "Wallet top-up (PayGate)";
    return "Wallet top-up";
  }

  if (type === "payout") {
    if (r.startsWith("PAYOUT-")) return "Withdrawal to bank (requested)";
    return "Withdrawal to bank (requested)";
  }

  if (type === "escrow") {
    if (OBJECT_ID_RE.test(r)) return "Errand / task — funds held in escrow";
    return "Funds held (escrow)";
  }

  if (type === "refund") {
    if (OBJECT_ID_RE.test(r)) return "Errand / task — escrow refunded";
    if (r) return "Refund to wallet";
    return "Refund to wallet";
  }

  if (type === "credit") {
    if (r.startsWith("QR-")) return "Payment received (QR / in-store)";
    if (r.startsWith("TOPUP-MR-")) return "Money request — card top-up credited to wallet";
    if (r.startsWith("TOPUP-") || r.startsWith("PAY-")) return "PayGate payment — credited to your wallet";
    if (r.startsWith("CHECKOUT-") && r.includes("-OWNER")) return "QwertyMusic — your share of sale";
    if (r.startsWith("CHECKOUT-") && r.includes("-ADMIN")) return "QwertyMusic — platform fee share";
    if (r.startsWith("CHECKOUT-")) return "Payment received (marketplace checkout)";
    if (r.startsWith("AGENT-WD-")) return "Agent float — customer cash withdrawal";
    if (r.startsWith("DONATE-")) return "Tip / donation received";
    if (r.startsWith("REQ-")) return "Money request — received from payer";
    if (r.startsWith("PAYGATE-FEE-")) return "PayGate processing fee (platform)";
    if (r.startsWith("MUSIC-") && r.endsWith("-OWNER")) return "QwertyMusic — sale proceeds";
    if (r.startsWith("MUSIC-") && r.endsWith("-ADMIN")) return "QwertyMusic — platform commission";
    if (r.startsWith("WA-SEND-PART-") || r.startsWith("WA-MR-PART-")) return "WhatsApp — wallet transfer received";
    if (OBJECT_ID_RE.test(r)) return "Errand / task — runner payout";
    return "Wallet credit";
  }

  if (type === "debit") {
    if (r.startsWith("ORDER-")) return "QwertyHub — marketplace order";
    if (r.startsWith("CHECKOUT-")) return "Paid merchant (wallet checkout)";
    if (r.startsWith("MUSIC-")) return "QwertyMusic — purchase";
    if (r.startsWith("QR-")) return "Paid merchant (QR / scan)";
    if (r.startsWith("DONATE-")) return "Tip / donation sent";
    if (r.startsWith("AGENT-WD-")) return "Cash withdrawal via merchant agent";
    if (r.startsWith("REQ-")) return "Money request — you paid the requester";
    if (r.startsWith("WA-SEND-PART-")) return "WhatsApp — wallet send to recipient";
    if (r.startsWith("WA-MR-PART-")) return "Money request — paid from your wallet";
    if (r.startsWith("TOPUP-MR-")) return "Top-up linked to money request (card)";
    if (r.startsWith("VAS-AIRTIME-")) return "Prepaid airtime";
    if (r.startsWith("VAS-DATA-")) return "Prepaid mobile data";
    if (r.startsWith("VAS-ELECTRICITY-")) return "Prepaid electricity";
    if (r.startsWith("VAS-")) return "Prepaid purchase (VAS)";
    return "Wallet debit";
  }

  return "Transaction";
}
