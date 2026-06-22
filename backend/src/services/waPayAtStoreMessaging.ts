import twilio from "twilio";
import Wallet from "../data/models/Wallet";
import Escrow from "../data/models/Escrow";
import { normalizePhone } from "../utils/phoneValidation";
import { resolveWhatsappSendProfile } from "../utils/twilioWaCredentials";
import { logger } from "./monitoring";

/** Scannable ACBPAY:userId QR for in-store checkout (same payload as web wallet). */
export function buildAcbPayQrMediaUrl(userId: string): string {
  const qrPayload = `ACBPAY:${String(userId || "").trim()}`;
  return `https://quickchart.io/qr?text=${encodeURIComponent(qrPayload)}&size=640&format=png&ecLevel=M`;
}

type WalletSummary = { availableBalance: number; pendingInJobs: number; earnings: number };

async function getWalletSummary(userId: string): Promise<WalletSummary> {
  let wallet = await Wallet.findOne({ user: userId });
  if (!wallet) wallet = await Wallet.create({ user: userId });
  const pendingEscrowAgg = await Escrow.aggregate([
    { $match: { client: userId, status: "held" } },
    { $group: { _id: null, total: { $sum: "$totalHeld" } } },
  ]);
  const pendingInJobs = Number(pendingEscrowAgg?.[0]?.total || 0);
  const earnings = (wallet.transactions || []).reduce((sum: number, tx: { type?: string; amount?: number }) => {
    if (tx.type === "credit") return sum + Number(tx.amount || 0);
    return sum;
  }, 0);
  return {
    availableBalance: Number(wallet.balance || 0),
    pendingInJobs,
    earnings,
  };
}

export function buildPayAtStoreWaitingActions(): string {
  return [
    "1️⃣ Check for payment request",
    "2️⃣ Show my QR again",
    "0️⃣ Back to wallet menu",
  ].join("\n");
}

/** Caption under the QR image in Pay @ store (option 4) — merchant scans this code. */
export async function buildPayAtStoreQrCaption(userId: string, extraBlock = ""): Promise<string> {
  const summary = await getWalletSummary(userId);
  const parts = [
    "🏪 Pay @ store",
    "",
    `Available Balance: R${summary.availableBalance.toFixed(2)}`,
    `Pending (in jobs): R${summary.pendingInJobs.toFixed(2)}`,
    "",
    "📲 Show this QR at checkout.",
    "The merchant scans it, enters your total, then you confirm below (same as qwertymates.com/wallet).",
    "",
    buildPayAtStoreWaitingActions(),
  ];
  const extra = String(extraBlock || "").trim();
  if (extra) parts.push("", extra);
  return parts.join("\n");
}

export function buildPayAtStoreConfirmCaption(merchantName: string, amount: number): string {
  return [
    "🏪 Pay @ store — confirm payment",
    "",
    `${merchantName} is requesting R${amount.toFixed(2)}.`,
    "",
    "Your QR is above — already scanned by the merchant.",
    "",
    "1️⃣ Pay with wallet",
    "2️⃣ Decline",
    "0️⃣ Back",
  ].join("\n");
}

function waPhoneToDigits(input: string): string {
  const raw = String(input || "").trim().replace(/^whatsapp:/i, "");
  let digits = normalizePhone(raw);
  if (/^(267|27|263|260|264|266|268)/.test(digits)) return digits;
  if (digits.startsWith("0")) digits = `27${digits.slice(1)}`;
  return digits;
}

/** One WhatsApp image bubble: QR + caption (Pay @ store). */
export async function sendWaPayAtStoreQrMessage(
  phoneInput: string,
  userId: string,
  caption: string
): Promise<boolean> {
  const profile = resolveWhatsappSendProfile(null, phoneInput, null);
  if (!profile) return false;
  const digits = waPhoneToDigits(phoneInput);
  if (!digits) return false;
  const body = String(caption || "").trim();
  if (!body) return false;
  try {
    const client = twilio(profile.accountSid, profile.authToken);
    await client.messages.create({
      from: profile.whatsappFrom,
      to: `whatsapp:+${digits}`,
      mediaUrl: [buildAcbPayQrMediaUrl(userId)],
      body,
    });
    return true;
  } catch (e) {
    logger.warn("sendWaPayAtStoreQrMessage failed", { error: String((e as any)?.message || e), userId });
    return false;
  }
}
