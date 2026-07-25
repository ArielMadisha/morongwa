import mongoose from "mongoose";
import Wallet from "../data/models/Wallet";
import VoiceCall from "../data/models/VoiceCall";
import { onWalletSaved } from "./walletBalanceSideEffects";
import { logger } from "./monitoring";

export function computeBilledAmountZar(params: {
  durationSec: number;
  ratePerMinuteZar: number;
  connectFeeZar: number;
}): number {
  const minutes = Math.max(1, Math.ceil(Math.max(0, params.durationSec) / 60));
  const raw = params.connectFeeZar + params.ratePerMinuteZar * minutes;
  return Math.round(raw * 100) / 100;
}

/** Debit wallet once per completed call (idempotent by reference). */
export async function debitWalletForVoiceCall(callId: mongoose.Types.ObjectId): Promise<void> {
  const call = await VoiceCall.findById(callId);
  if (!call || call.walletDebited || call.status !== "completed") return;

  const amount = computeBilledAmountZar({
    durationSec: call.durationSec,
    ratePerMinuteZar: call.ratePerMinuteZar,
    connectFeeZar: call.connectFeeZar,
  });

  if (amount <= 0) {
    call.billedAmountZar = 0;
    call.walletDebited = true;
    await call.save();
    return;
  }

  const wallet = await Wallet.findOne({ user: call.user });
  if (!wallet) {
    logger.warn("Voice call billing: wallet missing", { callId: String(callId) });
    return;
  }

  const ref = call.reference;
  const already = wallet.transactions.some((t) => t.reference === ref);
  if (already) {
    call.walletDebited = true;
    call.billedAmountZar = amount;
    await call.save();
    return;
  }

  if (wallet.balance < amount) {
    const debit = Math.min(wallet.balance, amount);
    wallet.balance = 0;
    wallet.transactions.push({ type: "debit", amount: -debit, reference: ref, createdAt: new Date() });
    call.billedAmountZar = debit;
    call.errorMessage = "Partial debit — insufficient wallet balance at call end";
  } else {
    wallet.balance -= amount;
    wallet.transactions.push({ type: "debit", amount: -amount, reference: ref, createdAt: new Date() });
    call.billedAmountZar = amount;
  }

  call.walletDebited = true;
  await wallet.save();
  await onWalletSaved(wallet);
  await call.save();

  logger.info("Voice call billed", {
    callId: String(callId),
    userId: String(call.user),
    amount: call.billedAmountZar,
    durationSec: call.durationSec,
  });
}
