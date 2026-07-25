import crypto from "crypto";
import Wallet from "../data/models/Wallet";
import WalletPaymentRequest from "../data/models/WalletPaymentRequest";
import AuditLog from "../data/models/AuditLog";
import { AppError } from "../middleware/errorHandler";
import { getOtpSecret } from "../utils/secrets";
import { emitWalletPaymentCompleted } from "./notification";

export type PendingStorePaymentRow = {
  _id: string;
  amount: number;
  merchantName: string;
  expiresAt: Date;
};

export async function listOpenPendingStorePaymentsForPayer(userId: string): Promise<PendingStorePaymentRow[]> {
  const now = new Date();
  const rows = await WalletPaymentRequest.find({
    fromUser: userId,
    status: "pending",
    otpExpiresAt: { $gt: now },
  })
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();
  return rows.map((pr) => ({
    _id: String(pr._id),
    amount: Number(pr.amount || 0),
    merchantName: String((pr.metadata as any)?.merchantName || "Store"),
    expiresAt: pr.otpExpiresAt as Date,
  }));
}

export async function getOpenPendingStorePaymentForPayer(
  userId: string,
  paymentRequestId: string
): Promise<PendingStorePaymentRow | null> {
  const pr = await WalletPaymentRequest.findById(paymentRequestId).lean();
  if (!pr) return null;
  if (String(pr.fromUser) !== String(userId)) return null;
  if (pr.status !== "pending") return null;
  if (new Date() > new Date(pr.otpExpiresAt)) return null;
  return {
    _id: String(pr._id),
    amount: Number(pr.amount || 0),
    merchantName: String((pr.metadata as any)?.merchantName || "Store"),
    expiresAt: pr.otpExpiresAt as Date,
  };
}

/** Payer confirms in-store QR charge with wallet balance (web + WhatsApp). */
export async function settlePendingStorePaymentWithWallet(
  payerUserId: string,
  paymentRequestId: string
): Promise<{ amount: number; merchantName: string; balance: number; reference: string }> {
  const pr = await WalletPaymentRequest.findById(paymentRequestId);
  if (!pr) throw new AppError("Payment request not found", 404);
  if (pr.status !== "pending") throw new AppError("Payment already completed or expired", 400);
  if (String(pr.fromUser) !== String(payerUserId)) {
    throw new AppError("You are not the payer for this payment", 403);
  }
  if (new Date() > pr.otpExpiresAt) {
    pr.status = "expired";
    await pr.save();
    throw new AppError("Payment request expired", 400);
  }

  const payerWallet = await Wallet.findOne({ user: pr.fromUser });
  const payeeWallet = await Wallet.findOne({ user: pr.toUser });
  if (!payerWallet || payerWallet.balance < pr.amount) {
    throw new AppError("Insufficient balance", 400);
  }
  const recipientWallet = payeeWallet || (await Wallet.create({ user: pr.toUser }));

  payerWallet.balance -= pr.amount;
  payerWallet.transactions.push({
    type: "debit",
    amount: -pr.amount,
    reference: pr.reference,
    createdAt: new Date(),
  });
  await payerWallet.save();

  recipientWallet.balance += pr.amount;
  recipientWallet.transactions.push({
    type: "credit",
    amount: pr.amount,
    reference: pr.reference,
    createdAt: new Date(),
  });
  await recipientWallet.save();

  pr.status = "completed";
  pr.completedAt = new Date();
  await pr.save();

  const merchantName = String((pr.metadata as any)?.merchantName || "Store");

  await AuditLog.create({
    action: "WALLET_QR_PAYMENT_WALLET",
    user: pr.fromUser,
    meta: { amount: pr.amount, toUser: pr.toUser, reference: pr.reference, channel: "wallet" },
  });

  emitWalletPaymentCompleted(String(pr.toUser), {
    paymentRequestId: String(pr._id),
    amount: pr.amount,
    status: "completed",
  });

  return {
    amount: pr.amount,
    merchantName,
    balance: payerWallet.balance,
    reference: String(pr.reference || ""),
  };
}

/** Payer confirms in-store charge with SMS OTP (Pay at Shop). */
export async function settlePendingStorePaymentWithOtp(
  payerUserId: string,
  paymentRequestId: string,
  otp: string
): Promise<{ amount: number; merchantName: string; balance: number; reference: string }> {
  const pr = await WalletPaymentRequest.findById(paymentRequestId);
  if (!pr) throw new AppError("Payment request not found", 404);
  if (pr.status !== "pending") throw new AppError("Payment already completed or expired", 400);
  if (String(pr.fromUser) !== String(payerUserId)) {
    throw new AppError("You are not the payer for this payment", 403);
  }
  if (new Date() > pr.otpExpiresAt) {
    pr.status = "expired";
    await pr.save();
    throw new AppError("Verification code expired", 400);
  }

  const otpHash = crypto.createHmac("sha256", getOtpSecret()).update(String(otp).trim()).digest("hex");
  if (otpHash !== pr.otpHash) throw new AppError("Invalid verification code", 400);

  return settlePendingStorePaymentWithWallet(payerUserId, paymentRequestId);
}
