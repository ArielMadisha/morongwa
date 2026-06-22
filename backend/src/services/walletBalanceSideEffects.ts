/**
 * After any Wallet `.save()`, sync balance to Socket.IO (web/mobile) and optionally WhatsApp (WA-registered users).
 */
import twilio from "twilio";
import type { IWallet } from "../data/models/Wallet";
import Wallet from "../data/models/Wallet";
import User from "../data/models/User";
import { normalizePhone } from "../utils/phoneValidation";
import { logger } from "./monitoring";
import { getTwilioCredentialsForPrimaryWhatsappSender } from "../utils/twilioWaCredentials";
import { emitWalletBalanceSync } from "./notification";
import { dispatchSatelliteEvent } from "./satelliteSync";

const WA_DEBOUNCE_MS = Math.max(
  800,
  Math.min(8000, parseInt(process.env.WALLET_WA_PUSH_DEBOUNCE_MS || "2200", 10) || 2200)
);

const waPushTimers = new Map<string, NodeJS.Timeout>();

function waPhoneToDigitsForPush(input: string): string {
  const raw = String(input || "")
    .trim()
    .replace(/^whatsapp:/i, "");
  let digits = normalizePhone(raw);
  if (digits.startsWith("267") && digits.length >= 11) return digits;
  if (digits.startsWith("27") && digits.length >= 11) return digits;
  if (/^7[1-9]\d{6}$/.test(digits)) digits = `267${digits}`;
  else if (/^07[1-9]\d{6}$/.test(digits)) digits = `267${digits.slice(1)}`;
  else if (/^0[6789]\d{8}$/.test(digits)) digits = `27${digits.slice(1)}`;
  return digits;
}

function shouldOfferWhatsappWalletPush(u: {
  email?: string;
  registeredViaWhatsappAt?: Date;
}): boolean {
  if (u.registeredViaWhatsappAt) return true;
  return /^wa_\d+@morongwa\.local$/i.test(String(u.email || ""));
}

function resolveWhatsappTargetDigits(u: { email?: string; phone?: string }): string | null {
  const p = String(u.phone || "").trim();
  if (p) {
    const d = waPhoneToDigitsForPush(p);
    if (d.length >= 10) return d;
  }
  const m = /^wa_(\d+)@morongwa\.local$/i.exec(String(u.email || ""));
  if (m?.[1] && m[1].length >= 10) return m[1];
  return null;
}

function lastTransactionSummary(doc: IWallet): { type: string; amount: number; reference?: string } | undefined {
  const arr = doc.transactions;
  if (!Array.isArray(arr) || arr.length === 0) return undefined;
  const t = arr[arr.length - 1] as { type?: string; amount?: number; reference?: string };
  if (!t?.type) return undefined;
  return {
    type: String(t.type),
    amount: Number(t.amount),
    reference: t.reference ? String(t.reference) : undefined,
  };
}

function describeTxLine(t?: { type: string; amount: number; reference?: string }): string {
  if (!t) return "";
  const amt = Math.abs(Number(t.amount));
  const signed =
    t.type === "debit" || Number(t.amount) < 0 ? `−R${amt.toFixed(2)}` : `+R${amt.toFixed(2)}`;
  const ref = t.reference ? ` · ${t.reference}` : "";
  return `${t.type} ${signed}${ref}`;
}

async function sendWhatsappWalletDigest(walletId: string): Promise<void> {
  if (String(process.env.WALLET_WA_PUSH || "1").trim() === "0") return;

  const doc = await Wallet.findById(walletId).lean();
  if (!doc?.user) return;

  const txArrEarly = (doc as any).transactions as unknown[] | undefined;
  if ((!txArrEarly || txArrEarly.length === 0) && Number((doc as any).balance ?? 0) === 0) {
    return;
  }

  const user = await User.findById(doc.user)
    .select("email phone registeredViaWhatsappAt name")
    .lean();
  if (!user || !shouldOfferWhatsappWalletPush(user as any)) return;

  const digits = resolveWhatsappTargetDigits(user as any);
  if (!digits) {
    logger.info("wallet WA push skipped: no phone digits", { userId: String(doc.user) });
    return;
  }

  const { sid, token } = getTwilioCredentialsForPrimaryWhatsappSender();
  const fromRaw = String(process.env.TWILIO_WHATSAPP_FROM || "").trim();
  if (!sid || !token || !fromRaw) return;

  const txArr = (doc as any).transactions as Array<{ type?: string; amount?: number; reference?: string }> | undefined;
  const last =
    Array.isArray(txArr) && txArr.length > 0 ? txArr[txArr.length - 1] : undefined;
  const lastSummary =
    last?.type != null
      ? describeTxLine({
          type: String(last.type),
          amount: Number(last.amount),
          reference: last.reference ? String(last.reference) : undefined,
        })
      : "";

  const bal = Number((doc as any).balance ?? 0);
  const lines = [
    "🔔 *ACBPayWallet update* (Qwertymates)",
    "",
    `New balance: *R${bal.toFixed(2)}*`,
  ];
  if (lastSummary) lines.push("", `Latest: ${lastSummary}`);
  lines.push("", "Tip: reply *5* on the main menu for wallet actions, or open the app / web wallet anytime.");

  try {
    const client = twilio(sid, token);
    const from = fromRaw.startsWith("whatsapp:") ? fromRaw : `whatsapp:${fromRaw}`;
    const to = `whatsapp:+${digits}`;
    await client.messages.create({
      from,
      to,
      body: lines.join("\n"),
    });
  } catch (e) {
    logger.warn("wallet WA push failed (non-fatal)", {
      userId: String(doc.user),
      error: String((e as any)?.message || e),
    });
  }
}

function scheduleWhatsappWalletDigest(walletId: string): void {
  const prev = waPushTimers.get(walletId);
  if (prev) clearTimeout(prev);
  const t = setTimeout(() => {
    waPushTimers.delete(walletId);
    void sendWhatsappWalletDigest(walletId);
  }, WA_DEBOUNCE_MS);
  waPushTimers.set(walletId, t);
}

/**
 * Called from Wallet model `post('save')` — keep lightweight; never throw.
 */
export function onWalletSaved(doc: IWallet): void {
  try {
    const userId = doc.user?.toString?.();
    const walletId = doc._id?.toString?.();
    if (!userId || !walletId) return;

    const tx = lastTransactionSummary(doc);
    emitWalletBalanceSync(userId, {
      balance: Number(doc.balance ?? 0),
      transaction: tx,
      updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : new Date().toISOString(),
    });

    void dispatchSatelliteEvent({
      type: "wallet.balance_updated",
      data: {
        userId,
        balance: Number(doc.balance ?? 0),
        transaction: tx,
        updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : new Date().toISOString(),
      },
    });

    scheduleWhatsappWalletDigest(walletId);
  } catch (e) {
    logger.warn("onWalletSaved side effects failed (non-fatal)", { error: String((e as any)?.message || e) });
  }
}
