import crypto from "crypto";
import mongoose from "mongoose";
import MoneyRequest from "../data/models/MoneyRequest";
import Wallet from "../data/models/Wallet";
import AuditLog from "../data/models/AuditLog";
import Payment from "../data/models/Payment";
import { initiatePayment } from "./payment";
import User from "../data/models/User";
import { sendNotification } from "./notification";
import { sendSms } from "./otpDelivery";

export function generateMoneyRequestActionToken(): string {
  return crypto.randomBytes(16).toString("hex");
}

async function notifyMoneyRequestPaid(mr: InstanceType<typeof MoneyRequest>): Promise<void> {
  try {
    const [requester, payer] = await Promise.all([
      User.findById(mr.fromUser).select("name phone").lean(),
      User.findById(mr.toUser).select("name").lean(),
    ]);
    const payerName = String((payer as any)?.name || "Payer");
    const requesterName = String((requester as any)?.name || "Requester");
    const amountText = `R${Number(mr.amount || 0).toFixed(2)}`;

    await sendNotification({
      userId: String(mr.fromUser),
      type: "money_request_paid",
      message: `${payerName} paid your request of ${amountText}.`,
      channel: "realtime",
    });
    await sendNotification({
      userId: String(mr.toUser),
      type: "money_request_payment_sent",
      message: `You paid ${requesterName} ${amountText}.`,
      channel: "realtime",
    });

    const requesterPhone = String((requester as any)?.phone || "").trim();
    if (requesterPhone) {
      await sendSms({
        phone: requesterPhone,
        text: `ACBPayWallet: ${payerName} paid your request of ${amountText}.`,
        channel: "whatsapp",
      }).catch(() => {});
    }
  } catch {
    // non-fatal notification path
  }
}

/** Settle MR when payer wallet has enough (debit payer, credit requester). */
export async function settleMoneyRequestFromWallet(params: {
  mr: InstanceType<typeof MoneyRequest>;
  payeeId: mongoose.Types.ObjectId;
}): Promise<{ ok: true; payerBalance: number } | { ok: false; reason: string }> {
  const { mr, payeeId } = params;
  if (mr.status !== "pending") return { ok: false, reason: "Request is no longer pending." };
  if (new Date() > mr.expiresAt) {
    mr.status = "expired";
    await mr.save();
    return { ok: false, reason: "This request has expired." };
  }
  if (String(mr.toUser) !== String(payeeId)) {
    return { ok: false, reason: "You are not the payer for this request." };
  }

  const payerWallet = await Wallet.findOne({ user: payeeId });
  const recipientWallet = await Wallet.findOne({ user: mr.fromUser });
  if (!payerWallet || payerWallet.balance < mr.amount) {
    return { ok: false, reason: "INSUFFICIENT_BALANCE" };
  }

  const recWallet = recipientWallet || (await Wallet.create({ user: mr.fromUser }));

  payerWallet.balance -= mr.amount;
  payerWallet.transactions.push({
    type: "debit",
    amount: -mr.amount,
    reference: mr.reference,
    createdAt: new Date(),
  });
  await payerWallet.save();

  recWallet.balance += mr.amount;
  recWallet.transactions.push({
    type: "credit",
    amount: mr.amount,
    reference: mr.reference,
    createdAt: new Date(),
  });
  await recWallet.save();

  mr.status = "paid";
  mr.paidAt = new Date();
  await mr.save();

  await AuditLog.create({
    action: "WALLET_PAY_REQUEST",
    user: payeeId,
    meta: { amount: mr.amount, fromUser: mr.fromUser, requestId: mr._id, channel: "whatsapp" },
  });
  await notifyMoneyRequestPaid(mr);

  return { ok: true, payerBalance: payerWallet.balance };
}

/** After top-up webhook credits **payer** wallet, attempt MR payment if still pending (legacy path). */
export async function trySettleMoneyRequestAfterTopup(userId: mongoose.Types.ObjectId, moneyRequestId: string): Promise<void> {
  const mr = await MoneyRequest.findById(moneyRequestId);
  if (!mr || mr.status !== "pending") return;
  if (String(mr.toUser) !== String(userId)) return;
  await settleMoneyRequestFromWallet({ mr, payeeId: userId });
}

/** Card payment credited **requester's** wallet (and any wallet portion already moved). Mark MR paid — do not debit payer again. */
export async function finalizeMoneyRequestAfterDirectCard(moneyRequestId: string): Promise<void> {
  const mr = await MoneyRequest.findById(moneyRequestId);
  if (!mr || mr.status !== "pending") return;
  mr.status = "paid";
  mr.paidAt = new Date();
  await mr.save();
  await AuditLog.create({
    action: "WALLET_PAY_REQUEST_CARD_DIRECT",
    user: mr.toUser,
    meta: { amount: mr.amount, fromUser: mr.fromUser, requestId: mr._id, channel: "whatsapp" },
  });
  await notifyMoneyRequestPaid(mr);
}

export async function initiateTopupForMoneyRequest(params: {
  mr: InstanceType<typeof MoneyRequest>;
  payeeId: mongoose.Types.ObjectId;
  payeeEmail: string;
}): Promise<{
  paymentUrl: string | null;
  payGateRedirect?: { processUrl: string; payRequestId: string; checksum: string };
  reference: string;
  shortfall: number;
}> {
  const { mr, payeeId, payeeEmail } = params;
  const payerWallet = await Wallet.findOne({ user: payeeId });
  const requesterWallet = (await Wallet.findOne({ user: mr.fromUser })) || (await Wallet.create({ user: mr.fromUser }));

  const payerBal = Math.round(Number(payerWallet?.balance || 0) * 100) / 100;
  const mrAmount = Math.round(Number(mr.amount) * 100) / 100;
  const fromWallet = Math.min(Math.max(payerBal, 0), mrAmount);
  const shortfall = Math.round((mrAmount - fromWallet) * 100) / 100;

  if (fromWallet > 0) {
    const pw = payerWallet || (await Wallet.create({ user: payeeId }));
    const partRef = `WA-MR-PART-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    pw.balance = Math.round((pw.balance - fromWallet) * 100) / 100;
    pw.transactions.push({
      type: "debit",
      amount: -fromWallet,
      reference: partRef,
      createdAt: new Date(),
    });
    await pw.save();

    requesterWallet.balance = Math.round((requesterWallet.balance + fromWallet) * 100) / 100;
    requesterWallet.transactions.push({
      type: "credit",
      amount: fromWallet,
      reference: partRef,
      createdAt: new Date(),
    });
    await requesterWallet.save();
  }

  if (shortfall <= 0) {
    await finalizeMoneyRequestAfterDirectCard(String(mr._id));
    return { paymentUrl: null, reference: "", shortfall: 0 };
  }

  const reference = `TOPUP-MR-${String(mr._id)}-${Date.now()}`;
  const baseUrl = String(process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/$/, "");
  const backendUrl = String(process.env.BACKEND_URL || "http://localhost:4000").replace(/\/$/, "");

  await Payment.create({
    user: mr.fromUser,
    amount: shortfall,
    reference,
    status: "pending",
    metadata: {
      moneyRequestId: String(mr._id),
      directToRequester: true,
      payerId: String(payeeId),
      partialFromWallet: fromWallet,
    },
  });

  const actionToken = String((mr as any).actionToken || "").trim().toLowerCase();
  const returnToPublicRequest = actionToken
    ? `${baseUrl}/pay/request?requestId=${encodeURIComponent(String(mr._id))}&token=${encodeURIComponent(actionToken)}&ref=${encodeURIComponent(reference)}`
    : `${baseUrl}/pay/request`;

  const paymentResult = await initiatePayment({
    amount: shortfall,
    reference,
    email: payeeEmail,
    // Return to the same public request page (single-link flow, no login required).
    returnUrl: returnToPublicRequest,
    notifyUrl: `${backendUrl}/api/payments/webhook`,
  });

  if (!paymentResult.success || (!paymentResult.paymentUrl && !paymentResult.payGateRedirect)) {
    await Payment.deleteOne({ reference }).catch(() => {});
  }

  return {
    paymentUrl: paymentResult.paymentUrl || null,
    payGateRedirect: paymentResult.payGateRedirect,
    reference,
    shortfall,
  };
}
