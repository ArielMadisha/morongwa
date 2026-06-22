// Wallet management routes
import express, { Response } from "express";
import crypto from "crypto";
import Wallet from "../data/models/Wallet";
import WalletPaymentRequest from "../data/models/WalletPaymentRequest";
import MoneyRequest from "../data/models/MoneyRequest";
import Transaction from "../data/models/Transaction";
import User from "../data/models/User";
import AuditLog from "../data/models/AuditLog";
import Order from "../data/models/Order";
import Payment from "../data/models/Payment";
import StoredCard from "../data/models/StoredCard";
import CheckoutSession from "../data/models/CheckoutSession";
import MerchantAgentCashTx from "../data/models/MerchantAgentCashTx";
import Escrow from "../data/models/Escrow";
import TuckshopCashAgentRegistration from "../data/models/TuckshopCashAgentRegistration";
import Supplier from "../data/models/Supplier";
import { authenticate, AuthRequest } from "../middleware/auth";
import {
  topupSchema,
  payoutSchema,
  donateSchema,
  qrPaymentFromScanSchema,
  confirmQrPaymentSchema,
  requestMoneySchema,
  requestMoneyFromScanSchema,
  payMoneyRequestSchema,
  payWithCardSchema,
  checkoutPaySchema,
  merchantAgentListingSchema,
  merchantAgentApplySchema,
  merchantAgentDepositInitSchema,
  merchantAgentDepositApproveSchema,
  merchantAgentWithdrawSchema,
  merchantAgentHandoverSchema,
} from "../utils/validators";
import { AppError } from "../middleware/errorHandler";
import { getPaginationParams } from "../utils/helpers";
import { initiatePayment } from "../services/payment";
import { getWalletPayoutFeeZarResolved } from "../services/payment";
import { sendSms } from "../services/otpDelivery";
import { generateMoneyRequestActionToken, settleMoneyRequestFromWallet, initiateTopupForMoneyRequest } from "../services/moneyRequestService";
import { getAgentCommissionSummary, emailAgentEarningsReportForUser } from "../services/agentEarningsService";
import {
  sendNotification,
  emitWalletPendingPayment,
  emitWalletMoneyRequest,
  emitWalletPaymentCompleted,
} from "../services/notification";
import {
  getOpenPendingStorePaymentForPayer,
  listOpenPendingStorePaymentsForPayer,
  settlePendingStorePaymentWithWallet,
} from "../services/walletQrPaymentService";
import { notifyWaPayAtStorePaymentRequest } from "../services/waPayAtStoreNotify";
import { walletPaymentLimiter } from "../middleware/rateLimit";
import { getOtpSecret } from "../utils/secrets";

const router = express.Router();
router.use(walletPaymentLimiter);
const PAYMENT_OTP_EXPIRY_MS = 5 * 60 * 1000;

function sameToken(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function parseAcbPayUserId(raw: string): string | null {
  const t = String(raw || "").trim();
  const prefixed = t.match(/^ACBPAY:([a-f0-9]{24})$/i);
  if (prefixed) return prefixed[1];
  if (/^[a-f0-9]{24}$/i.test(t)) return t;
  return null;
}

/** In-store QR accept: approved marketplace supplier, admin, legacy supplier role, or test flag. */
async function userCanAcceptWalletQrPayments(
  userId: string | { toString(): string },
  roles: string[]
): Promise<boolean> {
  if (roles.includes("admin") || roles.includes("superadmin")) return true;
  if (roles.includes("supplier")) return true;
  if (String(process.env.WALLET_QR_MERCHANT_ANY_USER || "").trim() === "1") return true;
  const approved = await Supplier.findOne({ userId, status: "approved" }).select("_id").lean();
  return !!approved;
}

async function notifyQrPaymentRequestToPayer(params: {
  payerId: string;
  paymentRequestId: string;
  amount: number;
  merchantName: string;
  payerPhone?: string;
}): Promise<void> {
  const { payerId, paymentRequestId, amount, merchantName, payerPhone } = params;
  const amountText = `R${amount.toFixed(2)}`;
  const payLink = `${process.env.FRONTEND_URL || "http://localhost:3000"}/wallet?pendingPayment=${paymentRequestId}`;

  await sendNotification({
    userId: payerId,
    type: "wallet_pending_payment",
    message: `Pay ${amountText} to ${merchantName}? Open your wallet to confirm.`,
    channel: "realtime",
  });
  emitWalletPendingPayment(payerId, { paymentRequestId, amount, merchantName });

  void notifyWaPayAtStorePaymentRequest({
    payerId,
    paymentRequestId,
    amount,
    merchantName,
  });

  // In-app confirm only (no SMS OTP). Optional backup link SMS if WALLET_QR_SMS_BACKUP=1.
  if (payerPhone && String(process.env.WALLET_QR_SMS_BACKUP || "").trim() === "1") {
    const text = `Pay ${amountText} at ${merchantName} via ACBPayWallet. Tap to confirm: ${payLink}`;
    await sendSms({ phone: payerPhone, text, channel: "sms" }).catch(() => {});
  }
}

async function notifyMoneyRequestToPayee(params: {
  payeeId: string;
  requestId: string;
  amount: number;
  requesterName: string;
  actionToken: string;
  message?: string;
  payeePhone?: string;
  notifyChannel?: string;
}): Promise<void> {
  const { payeeId, requestId, amount, requesterName, actionToken, message, payeePhone, notifyChannel } = params;
  const amountText = `R${amount.toFixed(2)}`;
  const baseFe = String(process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/$/, "");
  const webLink = `${baseFe}/wallet?payRequest=${requestId}`;
  const linkLink = `${baseFe}/pay/request?requestId=${requestId}&token=${encodeURIComponent(actionToken)}`;

  await sendNotification({
    userId: payeeId,
    type: "wallet_money_request",
    message: `Send ${amountText} to ${requesterName}?${message ? ` ${message}` : ""} Confirm in your wallet.`,
    channel: "realtime",
  });
  emitWalletMoneyRequest(payeeId, { requestId, amount, requesterName });

  if (payeePhone && notifyChannel !== "none") {
    const channel = notifyChannel === "sms" ? "sms" : "whatsapp";
    const text = [
      `${requesterName} requested ${amountText} from you via ACBPayWallet.`,
      message ? `Message: ${message}` : "",
      `Confirm in app: ${webLink} Or pay: ${linkLink}`,
    ]
      .filter(Boolean)
      .join(" ");
    await sendSms({ phone: payeePhone, text, channel }).catch(() => {});
  }
}

// Get wallet balance
router.get("/balance", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    let wallet = await Wallet.findOne({ user: req.user!._id });

    if (!wallet) {
      wallet = await Wallet.create({ user: req.user!._id });
    }

    const pendingEscrowAgg = await Escrow.aggregate([
      {
        $match: {
          client: req.user!._id,
          status: "held",
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$totalHeld" },
        },
      },
    ]);
    const pendingInJobs = Number(pendingEscrowAgg?.[0]?.total || 0);
    const earnings = (wallet.transactions || []).reduce((sum: number, tx: any) => {
      if (tx.type === "credit") return sum + Number(tx.amount || 0);
      return sum;
    }, 0);
    const roleRaw = (req.user as any)?.role;
    const roles = Array.isArray(roleRaw) ? roleRaw : roleRaw ? [roleRaw] : [];
    const merchant = await userCanAcceptWalletQrPayments(req.user!._id, roles);

    res.json({
      balance: wallet.balance,
      availableBalance: wallet.balance,
      pendingInJobs,
      earnings,
      walletRoles: {
        user: true,
        runner: roles.includes("runner"),
        merchant,
        agent: !!(req.user as any)?.merchantAgent?.enabled,
      },
    });
  } catch (err) {
    next(err);
  }
});

// Get wallet transactions
router.get("/transactions", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const { page, limit } = req.query;
    const { skip, limit: limitNum } = getPaginationParams(
      page ? parseInt(page as string) : undefined,
      limit ? parseInt(limit as string) : undefined
    );

    const wallet = await Wallet.findOne({ user: req.user!._id });
    if (!wallet) {
      // Return empty array if no wallet
      return res.json([]);
    }

    const raw = wallet.transactions.slice(skip, skip + limitNum);

    const orderRefs = raw.filter((t: any) => t.type === "debit" && t.reference?.startsWith("ORDER-")).map((t: any) => t.reference?.replace("ORDER-", ""));
    const orders = orderRefs.length
      ? await Order.find({ _id: { $in: orderRefs } }).select("paymentBreakdown").lean()
      : [];
    const orderMap = new Map(orders.map((o: any) => [o._id.toString(), o]));

    const transactions = raw.map((t: any) => {
      const plain = typeof t.toObject === "function" ? t.toObject() : t;
      const out: any = { ...plain };
      if (plain.type === "debit" && plain.reference?.startsWith("ORDER-")) {
        const orderId = String(plain.reference).replace("ORDER-", "");
        const order = orderMap.get(orderId);
        if (order?.paymentBreakdown) out.orderBreakdown = order.paymentBreakdown;
      }
      return out;
    });

    // Also include recent paid card orders that may predate wallet-history rows.
    const walletRefs = new Set(
      (wallet.transactions || []).map((t: any) => String(t?.reference || "").trim()).filter(Boolean)
    );
    const paidOrders = await Order.find({
      buyerId: req.user!._id,
      status: "paid",
      paymentMethod: "card",
    })
      .select("_id paidAt createdAt amounts paymentBreakdown")
      .sort({ paidAt: -1, createdAt: -1 })
      .limit(limitNum)
      .lean();
    for (const order of paidOrders as any[]) {
      const ref = `ORDER-${String(order._id)}`;
      if (walletRefs.has(ref)) continue;
      transactions.push({
        type: "debit",
        amount: -Number(order?.amounts?.total ?? 0),
        reference: ref,
        createdAt: order?.paidAt || order?.createdAt || new Date(),
        orderBreakdown: order?.paymentBreakdown,
      });
    }
    transactions.sort((a: any, b: any) => {
      const ta = new Date(a?.createdAt || 0).getTime();
      const tb = new Date(b?.createdAt || 0).getTime();
      return tb - ta;
    });

    res.json(transactions.slice(0, limitNum));
  } catch (err) {
    next(err);
  }
});

// Top up wallet via PayGate redirect
router.post("/topup", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const { error } = topupSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);

    const { amount, returnPath } = req.body as { amount: number; returnPath?: string };
    const safeReturnPath = typeof returnPath === "string" && returnPath.startsWith("/") ? returnPath : "/wallet";
    const reference = `TOPUP-${Date.now()}-${Math.round(Math.random() * 1e6)}`;

    await Payment.create({
      user: req.user!._id,
      amount,
      reference,
      status: "pending",
    });

    const paymentResult = await initiatePayment({
      amount,
      reference,
      email: req.user!.email,
      returnUrl: `${process.env.FRONTEND_URL || "http://localhost:3000"}${safeReturnPath}${safeReturnPath.includes("?") ? "&" : "?"}pgType=topup&pgRef=${encodeURIComponent(reference)}`,
      notifyUrl: `${process.env.BACKEND_URL || "http://localhost:4000"}/api/payments/webhook`,
    });
    if (!paymentResult.success || (!paymentResult.paymentUrl && !paymentResult.payGateRedirect)) {
      throw new AppError(paymentResult.error || "Payment initiation failed", 500);
    }

    await AuditLog.create({
      action: "WALLET_TOPUP_INITIATED",
      user: req.user!._id,
      meta: { amount, reference },
    });

    res.json({
      message: "Top-up initiated",
      paymentUrl: paymentResult.paymentUrl,
      payGateRedirect: paymentResult.payGateRedirect,
      reference,
      amount,
      paygateFeeZar: paymentResult.paygateFeeZar,
      chargedZar: paymentResult.chargedZar,
    });
  } catch (err) {
    next(err);
  }
});

// Request payout
router.post("/payout", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const { error } = payoutSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);

    const { amount } = req.body;

    const wallet = await Wallet.findOne({ user: req.user!._id });
    if (!wallet) throw new AppError("Wallet not found", 404);

    const payoutFee = await getWalletPayoutFeeZarResolved();
    const totalDebit = Math.round((Number(amount) + payoutFee) * 100) / 100;
    if (wallet.balance < totalDebit) {
      throw new AppError("Insufficient balance", 400);
    }

    const payoutRef = `PAYOUT-${Date.now()}`;
    wallet.balance -= totalDebit;
    wallet.transactions.push({
      type: "payout",
      amount: -totalDebit,
      reference: payoutRef,
      createdAt: new Date(),
    });
    await wallet.save();

    await Transaction.create({
      wallet: wallet._id,
      user: req.user!._id,
      type: "payout",
      amount,
      reference: payoutRef,
      status: "pending",
      meta: { payoutFeeZar: payoutFee, totalDebitZar: totalDebit },
    });

    await AuditLog.create({
      action: "WALLET_PAYOUT",
      user: req.user!._id,
      meta: { amount },
    });

    res.json({
      message: "Payout request submitted successfully",
      balance: wallet.balance,
      payoutAmount: amount,
      payoutFeeZar: payoutFee,
      totalDebitZar: totalDebit,
    });
  } catch (err) {
    next(err);
  }
});

// Donate to creator (transfer from current user's wallet to recipient's wallet)
router.post("/donate", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const { error } = donateSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);

    const { recipientId, amount } = req.body;
    const senderId = req.user!._id;

    if (String(recipientId) === String(senderId)) {
      throw new AppError("Cannot donate to yourself", 400);
    }

    const mongoose = await import("mongoose");
    if (!mongoose.default.Types.ObjectId.isValid(recipientId)) {
      throw new AppError("Invalid recipient", 400);
    }

    const senderWallet = await Wallet.findOne({ user: senderId });
    if (!senderWallet) throw new AppError("Wallet not found", 404);

    if (senderWallet.balance < amount) {
      throw new AppError("Insufficient balance", 400);
    }

    let recipientWallet = await Wallet.findOne({ user: recipientId });
    if (!recipientWallet) {
      recipientWallet = await Wallet.create({ user: recipientId });
    }

    const ref = `DONATE-${recipientId}-${Date.now()}`;

    senderWallet.balance -= amount;
    senderWallet.transactions.push({
      type: "debit",
      amount: -amount,
      reference: ref,
      createdAt: new Date(),
    });
    await senderWallet.save();

    recipientWallet.balance += amount;
    recipientWallet.transactions.push({
      type: "credit",
      amount,
      reference: ref,
      createdAt: new Date(),
    });
    await recipientWallet.save();

    await Transaction.create({
      wallet: senderWallet._id,
      user: senderId,
      type: "debit",
      amount,
      reference: ref,
      status: "successful",
    });

    await Transaction.create({
      wallet: recipientWallet._id,
      user: recipientId,
      type: "credit",
      amount,
      reference: ref,
      status: "successful",
    });

    await AuditLog.create({
      action: "WALLET_DONATE",
      user: senderId,
      meta: { amount, recipientId },
    });

    res.json({
      message: "Donation sent successfully",
      balance: senderWallet.balance,
    });
  } catch (err) {
    next(err);
  }
});

// --- QR code & in-store payment ---

// List open payment requests for current user as payer (in-store scan → confirm in wallet)
router.get("/pending-payments", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const rows = await listOpenPendingStorePaymentsForPayer(String(req.user!._id));
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// Get pending payment request (for payer - when they open link from SMS)
router.get("/pending-payment/:id", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const row = await getOpenPendingStorePaymentForPayer(String(req.user!._id), req.params.id);
    if (!row) throw new AppError("Payment request not found or expired", 404);
    res.json({
      _id: row._id,
      amount: row.amount,
      merchantName: row.merchantName,
      expiresAt: row.expiresAt,
    });
  } catch (err) {
    next(err);
  }
});

// Get current user's QR payload (for display). Format: ACBPAY:{userId}
router.get("/qr-payload", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const userId = req.user!._id.toString();
    const user = await User.findById(userId).select("name username").lean();
    res.json({
      payload: `ACBPAY:${userId}`,
      userId,
      displayName: (user as any)?.name || (user as any)?.username || "User",
    });
  } catch (err) {
    next(err);
  }
});

// Create payment from scan (merchant/store). Payer confirms in app (biometrics / wallet).
router.post("/payment-from-scan", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const { error } = qrPaymentFromScanSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);

    const { fromUserId, amount, merchantName } = req.body;
    const toUser = req.user!._id;
    const roleRaw = (req.user as any)?.role;
    const roles = Array.isArray(roleRaw) ? roleRaw : roleRaw ? [roleRaw] : [];
    if (!(await userCanAcceptWalletQrPayments(toUser, roles))) {
      throw new AppError(
        "Merchant account required to accept in-store QR payments. Apply as a supplier or use an admin account.",
        403
      );
    }

    if (String(fromUserId) === String(toUser)) {
      throw new AppError("Cannot pay yourself", 400);
    }

    const payerUserId = parseAcbPayUserId(fromUserId);
    if (!payerUserId) throw new AppError("Invalid payer QR — use ACBPAY:userId format", 400);

    const payer = await User.findById(payerUserId).select("phone name").lean();
    if (!payer) throw new AppError("Payer not found", 404);

    const otpPlaceholder = crypto.randomBytes(16).toString("hex");
    const otpHash = crypto.createHmac("sha256", getOtpSecret()).update(otpPlaceholder).digest("hex");
    const otpExpiresAt = new Date(Date.now() + PAYMENT_OTP_EXPIRY_MS);
    const reference = `QR-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    const storeName =
      merchantName || (req.user as any)?.name || (req.user as any)?.username || "Store";

    const paymentRequest = await WalletPaymentRequest.create({
      fromUser: payerUserId,
      toUser,
      amount,
      otpHash,
      otpExpiresAt,
      status: "pending",
      reference,
      metadata: { merchantName: storeName },
    });

    await notifyQrPaymentRequestToPayer({
      payerId: payerUserId,
      paymentRequestId: String(paymentRequest._id),
      amount,
      merchantName: storeName,
      payerPhone: (payer as any).phone,
    });

    res.status(201).json({
      paymentRequestId: paymentRequest._id,
      amount,
      expiresIn: 300,
      merchantName: storeName,
      message: "Payment request sent — customer confirms in ACBPayWallet",
    });
  } catch (err) {
    next(err);
  }
});

// Confirm QR payment with OTP (merchant submits code from payer)
router.post("/confirm-payment", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const { error } = confirmQrPaymentSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);

    const { paymentRequestId, otp } = req.body;

    const pr = await WalletPaymentRequest.findById(paymentRequestId);
    if (!pr) throw new AppError("Payment request not found", 404);
    if (pr.status !== "pending") throw new AppError("Payment already completed or expired", 400);
    if (String(pr.toUser) !== String(req.user!._id)) {
      throw new AppError("You are not the payee for this payment", 403);
    }
    if (new Date() > pr.otpExpiresAt) {
      pr.status = "expired";
      await pr.save();
      throw new AppError("Verification code expired", 400);
    }

    const otpHash = crypto.createHmac("sha256", getOtpSecret()).update(otp).digest("hex");
    if (otpHash !== pr.otpHash) throw new AppError("Invalid verification code", 400);

    const payerWallet = await Wallet.findOne({ user: pr.fromUser });
    const payeeWallet = await Wallet.findOne({ user: pr.toUser });
    if (!payerWallet || payerWallet.balance < pr.amount) {
      throw new AppError("Payer has insufficient balance", 400);
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

    await AuditLog.create({
      action: "WALLET_QR_PAYMENT",
      user: pr.fromUser,
      meta: { amount: pr.amount, toUser: pr.toUser, reference: pr.reference },
    });

    emitWalletPaymentCompleted(String(pr.toUser), {
      paymentRequestId: String(pr._id),
      amount: pr.amount,
      status: "completed",
    });

    res.json({
      message: "Payment successful",
      amount: pr.amount,
      reference: pr.reference,
    });
  } catch (err) {
    next(err);
  }
});

// Merchant polls after scan (Scan → Request → Confirm → Done)
router.get("/payment-request/:id/status", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const pr = await WalletPaymentRequest.findById(req.params.id).lean();
    if (!pr) throw new AppError("Payment request not found", 404);
    if (String(pr.toUser) !== String(req.user!._id)) {
      throw new AppError("You are not the payee for this payment", 403);
    }
    const expired = pr.status === "pending" && new Date() > new Date(pr.otpExpiresAt);
    if (expired && pr.status === "pending") {
      await WalletPaymentRequest.findByIdAndUpdate(pr._id, { status: "expired" });
    }
    res.json({
      paymentRequestId: String(pr._id),
      status: expired ? "expired" : pr.status,
      amount: pr.amount,
      merchantName: (pr.metadata as any)?.merchantName || "Store",
      completedAt: pr.completedAt || null,
    });
  } catch (err) {
    next(err);
  }
});

// --- Stored cards (PayGate PayVault) ---

// Initiate add-card flow: redirect to PayGate with VAULT=1 (R1 charge to tokenize)
router.post("/add-card", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const configIssues = (await import("../services/payment")).getCardPaymentConfigIssues();
    if (configIssues.length > 0) {
      throw new AppError(`Card storage unavailable: ${configIssues.join(", ")}`, 400);
    }

    const userId = req.user!._id.toString();
    const reference = `ADDCARD-${userId}-${Date.now()}`;

    const paymentResult = await initiatePayment({
      amount: 1, // R1 to tokenize (credited to wallet on success)
      reference,
      email: req.user!.email,
      returnUrl: `${process.env.FRONTEND_URL || "http://localhost:3000"}/wallet?addCard=success`,
      notifyUrl: `${process.env.BACKEND_URL || "http://localhost:4000"}/api/payments/webhook`,
      vault: true,
      // Card tokenization is not a wallet top-up flow.
      skipPayGateFee: true,
    });

    if (!paymentResult.success || (!paymentResult.paymentUrl && !paymentResult.payGateRedirect)) {
      throw new AppError(paymentResult.error || "Could not start add-card flow", 500);
    }

    await AuditLog.create({
      action: "WALLET_ADD_CARD_INITIATED",
      user: req.user!._id,
      meta: { reference },
    });

    res.json({
      message: "Redirect to add card",
      paymentUrl: paymentResult.paymentUrl,
      payGateRedirect: paymentResult.payGateRedirect,
      reference,
      paygateFeeZar: paymentResult.paygateFeeZar,
      chargedZar: paymentResult.chargedZar,
    });
  } catch (err) {
    next(err);
  }
});

// List user's stored cards (no vaultId exposed)
router.get("/cards", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const cards = await StoredCard.find({ user: req.user!._id })
      .select("-vaultId -payvaultData1 -payvaultData2")
      .sort({ isDefault: -1, createdAt: -1 })
      .lean();
    res.json(cards);
  } catch (err) {
    next(err);
  }
});

// Delete stored card
router.delete("/cards/:cardId", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const card = await StoredCard.findOne({ _id: req.params.cardId, user: req.user!._id });
    if (!card) throw new AppError("Card not found", 404);
    await card.deleteOne();
    await AuditLog.create({
      action: "WALLET_CARD_REMOVED",
      user: req.user!._id,
      meta: { cardId: req.params.cardId },
    });
    res.json({ message: "Card removed" });
  } catch (err) {
    next(err);
  }
});

// Set default card
router.patch("/cards/:cardId/default", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const card = await StoredCard.findOne({ _id: req.params.cardId, user: req.user!._id });
    if (!card) throw new AppError("Card not found", 404);
    await StoredCard.updateMany({ user: req.user!._id }, { isDefault: false });
    card.isDefault = true;
    await card.save();
    res.json({ message: "Default card updated" });
  } catch (err) {
    next(err);
  }
});

// Pay pending QR payment with wallet balance (payer authorizes in app)
router.post("/pay-pending-with-wallet", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const { paymentRequestId } = req.body;
    if (!paymentRequestId) throw new AppError("Payment request ID required", 400);

    const result = await settlePendingStorePaymentWithWallet(String(req.user!._id), String(paymentRequestId));

    res.json({
      message: "Payment successful",
      amount: result.amount,
      balance: result.balance,
    });
  } catch (err) {
    next(err);
  }
});

// Initiate pay-with-card for a pending QR payment request (store scan flow)
router.post("/pay-with-card", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const { error } = payWithCardSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);

    const { paymentRequestId, cardId } = req.body;

    const pr = await WalletPaymentRequest.findById(paymentRequestId);
    if (!pr) throw new AppError("Payment request not found", 404);
    if (pr.status !== "pending") throw new AppError("Payment already completed or expired", 400);
    if (String(pr.fromUser) !== String(req.user!._id)) {
      throw new AppError("You are not the payer for this payment", 403);
    }
    if (new Date() > pr.otpExpiresAt) {
      pr.status = "expired";
      await pr.save();
      throw new AppError("Verification expired", 400);
    }

    const card = await StoredCard.findOne({ _id: cardId, user: req.user!._id });
    if (!card) throw new AppError("Card not found", 404);

    const reference = `CARDPMT-${paymentRequestId}`;

    const paymentResult = await initiatePayment({
      amount: pr.amount,
      reference,
      email: req.user!.email,
      returnUrl: `${process.env.FRONTEND_URL || "http://localhost:3000"}/wallet?cardPayment=done`,
      notifyUrl: `${process.env.BACKEND_URL || "http://localhost:4000"}/api/payments/webhook`,
      vaultId: card.vaultId,
      // In-ecosystem store/QR card payment: no flat top-up fee.
      skipPayGateFee: true,
    });

    if (!paymentResult.success || (!paymentResult.paymentUrl && !paymentResult.payGateRedirect)) {
      throw new AppError(paymentResult.error || "Could not start payment", 500);
    }

    await AuditLog.create({
      action: "WALLET_PAY_WITH_CARD_INITIATED",
      user: req.user!._id,
      meta: { paymentRequestId, cardId, amount: pr.amount },
    });

    res.json({
      message: "Redirect to complete payment",
      paymentUrl: paymentResult.paymentUrl,
      payGateRedirect: paymentResult.payGateRedirect,
      reference,
      amount: pr.amount,
      paygateFeeZar: paymentResult.paygateFeeZar,
      chargedZar: paymentResult.chargedZar,
    });
  } catch (err) {
    next(err);
  }
});

// --- E-commerce checkout (ACBPayWallet payment page for merchant sites) ---

const CHECKOUT_SESSION_TTL_MS = 30 * 60 * 1000;

function checkoutSessionExpired(session: { expiresAt?: Date; createdAt?: Date }): boolean {
  const exp = session.expiresAt
    ? new Date(session.expiresAt).getTime()
    : new Date(session.createdAt || 0).getTime() + CHECKOUT_SESSION_TTL_MS;
  return Date.now() > exp;
}

// Get checkout details — creates a server-side session (amount locked in DB).
router.get("/checkout/details", async (req: AuthRequest, res: Response, next) => {
  try {
    const sessionId = String(req.query.sessionId || "").trim();
    if (sessionId) {
      const session = await CheckoutSession.findById(sessionId).lean();
      if (!session || session.status !== "pending" || checkoutSessionExpired(session)) {
        throw new AppError("Checkout session expired or invalid", 400);
      }
      const merchant = await User.findById(session.merchantId).select("name username").lean();
      if (!merchant) throw new AppError("Merchant not found", 404);
      return res.json({
        sessionId: String(session._id),
        merchantId: String(session.merchantId),
        amount: session.amount,
        reference: session.reference,
        returnUrl: session.returnUrl,
        cancelUrl: session.cancelUrl,
        merchantName: (merchant as any).name || (merchant as any).username || "Merchant",
      });
    }

    const { merchantId, amount, reference, name } = req.query;
    const returnUrl = String(req.query.return_url || req.query.returnUrl || "").trim();
    const cancelUrl = String(req.query.cancel_url || req.query.cancelUrl || "").trim() || undefined;
    if (!merchantId || !amount || !reference || !returnUrl) {
      throw new AppError("merchantId, amount, reference, and return_url required", 400);
    }
    const merchant = await User.findById(merchantId).select("name username").lean();
    if (!merchant) throw new AppError("Merchant not found", 404);
    const amt = parseFloat(amount as string);
    if (isNaN(amt) || amt < 0.01 || amt > 50000) throw new AppError("Invalid amount", 400);

    const session = await CheckoutSession.create({
      merchantId,
      amount: amt,
      reference: String(reference),
      returnUrl,
      cancelUrl,
      status: "pending",
      expiresAt: new Date(Date.now() + CHECKOUT_SESSION_TTL_MS),
    });

    res.json({
      sessionId: String(session._id),
      merchantId: String(merchantId),
      amount: amt,
      reference: String(reference),
      returnUrl,
      cancelUrl,
      merchantName: (name as string) || (merchant as any).name || (merchant as any).username || "Merchant",
    });
  } catch (err) {
    next(err);
  }
});

// Pay checkout (wallet or card) — amount always from CheckoutSession, never request body.
router.post("/checkout/pay", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const { error } = checkoutPaySchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);

    const { sessionId, method, cardId } = req.body;
    const payerId = req.user!._id;

    const session = await CheckoutSession.findById(sessionId);
    if (!session || session.status !== "pending" || checkoutSessionExpired(session)) {
      throw new AppError("Checkout session expired or invalid", 400);
    }

    if (String(session.merchantId) === String(payerId)) {
      throw new AppError("Cannot pay yourself", 400);
    }

    const merchant = await User.findById(session.merchantId).select("name").lean();
    if (!merchant) throw new AppError("Merchant not found", 404);

    const amount = Number(session.amount);
    if (!Number.isFinite(amount) || amount < 0.01) {
      throw new AppError("Invalid session amount", 400);
    }

    session.payerId = payerId;
    await session.save();

    if (method === "wallet") {
      const ref = `CHECKOUT-${session.reference}-${Date.now()}`;

      const debited = await Wallet.findOneAndUpdate(
        { user: payerId, balance: { $gte: amount } },
        {
          $inc: { balance: -amount },
          $push: { transactions: { type: "debit", amount: -amount, reference: ref, createdAt: new Date() } },
        },
        { new: true }
      );
      if (!debited) throw new AppError("Insufficient balance", 400);

      await Wallet.findOneAndUpdate(
        { user: session.merchantId },
        {
          $inc: { balance: amount },
          $push: { transactions: { type: "credit", amount, reference: ref, createdAt: new Date() } },
        },
        { upsert: true, new: true }
      );

      session.status = "completed";
      session.completedAt = new Date();
      await session.save();

      await AuditLog.create({
        action: "CHECKOUT_PAY_WALLET",
        user: payerId,
        meta: { amount, merchantId: session.merchantId, reference: session.reference, sessionId },
      });

      const sep = session.returnUrl.includes("?") ? "&" : "?";
      return res.json({
        success: true,
        redirectUrl: `${session.returnUrl}${sep}status=success&reference=${encodeURIComponent(session.reference)}&amount=${amount}`,
      });
    }

    const card = await StoredCard.findOne({ _id: cardId, user: payerId });
    if (!card) throw new AppError("Card not found", 404);

    const paymentResult = await initiatePayment({
      amount,
      reference: `CHECKOUT-${session._id}`,
      email: req.user!.email,
      returnUrl: `${process.env.FRONTEND_URL || "http://localhost:3000"}/pay/return?session=${session._id}`,
      notifyUrl: `${process.env.BACKEND_URL || "http://localhost:4000"}/api/payments/webhook`,
      vaultId: card.vaultId,
      skipPayGateFee: true,
    });

    if (!paymentResult.success || (!paymentResult.paymentUrl && !paymentResult.payGateRedirect)) {
      session.status = "failed";
      await session.save();
      throw new AppError(paymentResult.error || "Could not start payment", 500);
    }

    res.json({
      success: true,
      paymentUrl: paymentResult.paymentUrl,
      payGateRedirect: paymentResult.payGateRedirect,
      amount,
      paygateFeeZar: paymentResult.paygateFeeZar,
      chargedZar: paymentResult.chargedZar,
    });
  } catch (err) {
    next(err);
  }
});

// Get checkout session status (for return page)
router.get("/checkout/session/:sessionId", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const session = await CheckoutSession.findById(req.params.sessionId).lean();
    if (!session) throw new AppError("Session not found", 404);
    if (String(session.payerId) !== String(req.user!._id)) {
      throw new AppError("Unauthorized", 403);
    }
    res.json({
      status: session.status,
      returnUrl: session.returnUrl,
      reference: session.reference,
      amount: session.amount,
    });
  } catch (err) {
    next(err);
  }
});

// --- Request money ---

// Public request-money link preview (no login required)
router.get("/request-public/:requestId", async (req: AuthRequest, res: Response, next) => {
  try {
    const requestId = String(req.params.requestId || "").trim();
    const token = String(req.query.token || "").trim();
    if (!requestId || !token) throw new AppError("Invalid payment request link", 400);

    const mr = await MoneyRequest.findById(requestId)
      .populate("fromUser", "name username")
      .lean();
    if (!mr) throw new AppError("Payment request not found", 404);
    if (!sameToken((mr as any).actionToken, token)) throw new AppError("Invalid payment request token", 403);

    const requester = (mr as any).fromUser as { name?: string; username?: string } | undefined;
    const payerWallet = await Wallet.findOne({ user: (mr as any).toUser }).select("balance").lean();
    const canPayWithWallet = Number(payerWallet?.balance || 0) >= Number((mr as any).amount || 0);
    const expired = new Date() > new Date((mr as any).expiresAt);

    res.json({
      requestId: String((mr as any)._id),
      amount: Number((mr as any).amount || 0),
      message: (mr as any).message || "",
      status: (mr as any).status,
      requesterName: requester?.name || requester?.username || "User",
      canPayWithWallet: (mr as any).status === "pending" && !expired && canPayWithWallet,
      expiresAt: (mr as any).expiresAt,
      expired,
    });
  } catch (err) {
    next(err);
  }
});

// Public pay action for request-money link (single-link flow)
router.post("/request-public/:requestId/pay", async (req: AuthRequest, res: Response, next) => {
  try {
    const requestId = String(req.params.requestId || "").trim();
    const token = String(req.body?.token || "").trim();
    if (!requestId || !token) throw new AppError("Invalid payment request link", 400);

    const mr = await MoneyRequest.findById(requestId);
    if (!mr) throw new AppError("Payment request not found", 404);
    if (!sameToken((mr as any).actionToken, token)) throw new AppError("Invalid payment request token", 403);

    if (mr.status !== "pending") {
      return res.json({
        code: "ALREADY_PROCESSED",
        message: mr.status === "paid" ? "This payment request is already paid." : "This payment request is no longer pending.",
        status: mr.status,
      });
    }
    if (new Date() > mr.expiresAt) {
      mr.status = "expired";
      await mr.save();
      throw new AppError("Request has expired", 400);
    }

    const payerUser = await User.findById(mr.toUser).select("email").lean();
    if (!payerUser) throw new AppError("Payer account not found", 404);

    const settled = await settleMoneyRequestFromWallet({ mr, payeeId: mr.toUser as any });
    if (settled.ok) {
      return res.json({
        code: "PAID_WALLET",
        message: "Payment sent successfully",
        amount: mr.amount,
      });
    }
    if (settled.reason === "INSUFFICIENT_BALANCE") {
      const fallbackEmail = String(process.env.ADMIN_EMAIL || "payments@qwertymates.com");
      const top = await initiateTopupForMoneyRequest({
        mr,
        payeeId: mr.toUser as any,
        payeeEmail: String((payerUser as any)?.email || fallbackEmail),
      });
      return res.status(200).json({
        code: "TOPUP_REQUIRED",
        message: top.paymentUrl || top.payGateRedirect
          ? "Insufficient balance. A PayGate payment link is ready."
          : "Insufficient balance. PayGate link could not be created right now.",
        shortfall: top.shortfall,
        topupReference: top.reference,
        paymentUrl: top.paymentUrl,
        payGateRedirect: top.payGateRedirect,
      });
    }
    throw new AppError(settled.reason, 400);
  } catch (err) {
    next(err);
  }
});

// Create money request (requester wants to receive from payee; payee gets WhatsApp/SMS)
router.post("/request-money", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const { error } = requestMoneySchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);

    const { toUserId, toUsername, amount, message, notifyChannel = "whatsapp" } = req.body;
    const fromUser = req.user!._id;

    let toUserIdResolved = toUserId;
    if (toUsername && !toUserId) {
      const u = await User.findOne({ username: String(toUsername).toLowerCase().trim() }).select("_id").lean();
      if (!u) throw new AppError("User not found", 404);
      toUserIdResolved = u._id.toString();
    }

    if (String(toUserIdResolved) === String(fromUser)) {
      throw new AppError("Cannot request money from yourself", 400);
    }

    const payee = await User.findById(toUserIdResolved).select("phone name").lean();
    if (!payee) throw new AppError("User not found", 404);

    const requester = await User.findById(fromUser).select("name username").lean();
    const requesterName = (requester as any)?.name || (requester as any)?.username || "Someone";
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const actionToken = generateMoneyRequestActionToken().toLowerCase();
    const moneyRequest = await MoneyRequest.create({
      fromUser,
      toUser: toUserIdResolved,
      amount,
      message,
      status: "pending",
      notifyChannel,
      expiresAt,
      reference: `REQ-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
      actionToken,
    });

    await notifyMoneyRequestToPayee({
      payeeId: String(toUserIdResolved),
      requestId: String(moneyRequest._id),
      amount,
      requesterName,
      actionToken,
      message,
      payeePhone: (payee as any).phone,
      notifyChannel,
    });

    res.status(201).json({
      requestId: moneyRequest._id,
      amount,
      message: "Request sent — they confirm in ACBPayWallet",
    });
  } catch (err) {
    next(err);
  }
});

// Face-to-face P2P: requester scanned payee QR (payee confirms send in wallet)
router.post("/request-money-from-scan", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const { error } = requestMoneyFromScanSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);

    const { payeeUserId: payeeRaw, amount, message } = req.body;
    const fromUser = req.user!._id;
    const payeeUserId = parseAcbPayUserId(payeeRaw);
    if (!payeeUserId) throw new AppError("Invalid QR — use ACBPAY:userId format", 400);

    if (String(payeeUserId) === String(fromUser)) {
      throw new AppError("Cannot request money from yourself", 400);
    }

    const payee = await User.findById(payeeUserId).select("phone name username").lean();
    if (!payee) throw new AppError("User not found", 404);

    const requester = await User.findById(fromUser).select("name username").lean();
    const requesterName = (requester as any)?.name || (requester as any)?.username || "Someone";
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const actionToken = generateMoneyRequestActionToken().toLowerCase();

    const moneyRequest = await MoneyRequest.create({
      fromUser,
      toUser: payeeUserId,
      amount,
      message,
      status: "pending",
      notifyChannel: "whatsapp",
      expiresAt,
      reference: `REQ-SCAN-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
      actionToken,
    });

    await notifyMoneyRequestToPayee({
      payeeId: payeeUserId,
      requestId: String(moneyRequest._id),
      amount,
      requesterName,
      actionToken,
      message,
      payeePhone: (payee as any).phone,
      notifyChannel: "none",
    });

    res.status(201).json({
      requestId: moneyRequest._id,
      amount,
      payeeName: (payee as any).name || (payee as any).username || "User",
      message: "Request sent — they confirm in their wallet",
    });
  } catch (err) {
    next(err);
  }
});

// Pay a money request (payee approves and sends money)
router.post("/pay-request", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const { error } = payMoneyRequestSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);

    const { requestId } = req.body;
    const payeeId = req.user!._id;

    const mr = await MoneyRequest.findById(requestId);
    if (!mr) throw new AppError("Request not found", 404);
    if (mr.status !== "pending") throw new AppError("Request already paid or declined", 400);
    if (String(mr.toUser) !== String(payeeId)) {
      throw new AppError("You are not the payee for this request", 403);
    }
    if (new Date() > mr.expiresAt) {
      mr.status = "expired";
      await mr.save();
      throw new AppError("Request has expired", 400);
    }

    const settled = await settleMoneyRequestFromWallet({ mr, payeeId });
    if (settled.ok) {
      return res.json({
        message: "Payment sent successfully",
        amount: mr.amount,
        balance: settled.payerBalance,
      });
    }
    if (settled.reason === "INSUFFICIENT_BALANCE") {
      const payerUser = await User.findById(payeeId).select("email").lean();
      const fallbackEmail = String(process.env.ADMIN_EMAIL || "payments@qwertymates.com");
      const top = await initiateTopupForMoneyRequest({
        mr,
        payeeId,
        payeeEmail: String((payerUser as any)?.email || req.user!.email || fallbackEmail),
      });
      return res.status(200).json({
        code: "TOPUP_REQUIRED",
        message: "Insufficient balance. Top up to complete this request payment.",
        shortfall: top.shortfall,
        topupReference: top.reference,
        paymentUrl: top.paymentUrl,
        payGateRedirect: top.payGateRedirect,
      });
    }
    throw new AppError(settled.reason, 400);
  } catch (err) {
    next(err);
  }
});

// Get pending money requests for current user (as payee)
router.get("/money-requests", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const requests = await MoneyRequest.find({ toUser: req.user!._id, status: "pending" })
      .populate("fromUser", "name username avatar")
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    res.json(requests);
  } catch (err) {
    next(err);
  }
});

// --- Merchant agents (cash-in / cash-out for non-banked users) ---

const DEPOSIT_EXPIRY_MS = 24 * 60 * 60 * 1000;

/** Approved application (includes legacy users who enabled agent before approval workflow). */
function isWalletMerchantAgentApproved(u: any): boolean {
  const ma = u?.merchantAgent;
  if (!ma) return false;
  if (ma.applicationStatus === "suspended" || ma.applicationStatus === "rejected" || ma.applicationStatus === "pending") {
    return false;
  }
  if (ma.applicationStatus === "approved") return true;
  if (ma.enabled && (ma.applicationStatus === undefined || ma.applicationStatus === null)) return true;
  return false;
}

function canOperateAsMerchantAgent(u: any): boolean {
  if (!u?.isVerified) return false;
  if (u.suspended || u.locked || !u.active) return false;
  return isWalletMerchantAgentApproved(u);
}

router.get("/merchant-agent/me", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const user = await User.findById(req.user!._id);
    if (!user) throw new AppError("User not found", 404);
    const ma = (user as any).merchantAgent || {};
    // Grandfather: early adopters who toggled agent on before applications existed
    if (ma.enabled && ma.applicationStatus === undefined && !ma.appliedAt) {
      (user as any).merchantAgent = {
        ...ma,
        applicationStatus: "approved",
        reviewedAt: ma.reviewedAt || new Date(),
      };
      await user.save();
    }
    const m = (user as any).merchantAgent || {};
    const status = m.applicationStatus ?? "none";
    res.json({
      enabled: !!m.enabled,
      publicNote: typeof m.publicNote === "string" ? m.publicNote : "",
      applicationStatus: status,
      businessName: m.businessName || "",
      businessDescription: m.businessDescription || "",
      rejectionReason: m.rejectionReason || "",
      appliedAt: m.appliedAt || null,
      reviewedAt: m.reviewedAt || null,
      kycAttestedAt: m.kycAttestedAt || null,
      isVerified: !!(user as any).isVerified,
      canApply:
        !!(user as any).isVerified &&
        !!(user as any).phone &&
        status !== "pending" &&
        status !== "approved" &&
        status !== "suspended" &&
        (status === "none" || status === "rejected"),
      isApproved: status === "approved" || isWalletMerchantAgentApproved(user),
    });
  } catch (err) {
    next(err);
  }
});

router.post("/merchant-agent/apply", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const { error } = merchantAgentApplySchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);
    const { businessName, businessDescription, publicNote, kycAttestation } = req.body as {
      businessName: string;
      businessDescription: string;
      publicNote?: string;
      kycAttestation: boolean;
    };
    if (!kycAttestation) throw new AppError("KYC attestation required", 400);

    const user = await User.findById(req.user!._id);
    if (!user) throw new AppError("User not found", 404);
    if (!(user as any).isVerified) {
      throw new AppError("Account must be KYC-verified before applying. Complete verification in your profile.", 403);
    }
    if (!(user as any).phone?.trim()) {
      throw new AppError("Add a phone number on your profile before applying.", 400);
    }

    const ma = (user as any).merchantAgent || {};
    const st = ma.applicationStatus || "none";
    if (st === "pending") throw new AppError("Application already pending review", 400);
    if (st === "approved") throw new AppError("You are already an approved merchant agent", 400);
    if (st === "suspended") throw new AppError("Your agent status is suspended. Contact support.", 403);

    (user as any).merchantAgent = {
      ...ma,
      applicationStatus: "pending",
      businessName: businessName.trim().slice(0, 120),
      businessDescription: businessDescription.trim().slice(0, 2000),
      publicNote: typeof publicNote === "string" ? publicNote.trim().slice(0, 200) : "",
      kycAttestedAt: new Date(),
      appliedAt: new Date(),
      enabled: false,
      rejectionReason: undefined,
    };
    await user.save();

    await AuditLog.create({
      action: "MERCHANT_AGENT_APPLY",
      user: req.user!._id,
      meta: { businessName: (user as any).merchantAgent.businessName },
    });

    // WhatsApp-first follow-up to improve completion and reduce uncertainty.
    try {
      const phone = String((user as any).phone || "").trim();
      if (phone) {
        const base = String(process.env.FRONTEND_URL || "https://www.qwertymates.com").replace(/\/$/, "");
        const uploadLink = `${base}/support?category=wallet:other`;
        const statusLink = `${base}/wallet`;
        const waText = [
          "✅ Merchant application received!",
          "",
          `Hi ${(user as any).name || "there"}, your merchant application is under review.`,
          "Next step:",
          `📎 Submit supporting documents here: ${uploadLink}`,
          `Track status: ${statusLink}`,
        ].join("\n");
        await sendSms({ phone, text: waText, channel: "whatsapp" });
      }
    } catch {
      // Non-blocking: application still succeeds if WhatsApp delivery fails.
    }

    res.status(201).json({
      message: "Application submitted. We will notify you after admin review.",
      applicationStatus: "pending",
    });
  } catch (err) {
    next(err);
  }
});

router.patch("/merchant-agent/me", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const { error } = merchantAgentListingSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);
    const { enabled, publicNote } = req.body as { enabled: boolean; publicNote?: string };
    const user = await User.findById(req.user!._id);
    if (!user) throw new AppError("User not found", 404);
    if (!canOperateAsMerchantAgent(user)) {
      throw new AppError("Only approved merchant agents can update listing settings", 403);
    }
    const ma = (user as any).merchantAgent || {};
    (user as any).merchantAgent = {
      ...ma,
      enabled,
      publicNote: typeof publicNote === "string" ? publicNote.trim().slice(0, 200) : "",
    };
    await user.save();
    await AuditLog.create({
      action: "MERCHANT_AGENT_LISTING",
      user: req.user!._id,
      meta: { enabled, hasNote: !!(publicNote && String(publicNote).trim()) },
    });
    res.json({
      enabled,
      publicNote: (user as any).merchantAgent?.publicNote || "",
      applicationStatus: (user as any).merchantAgent?.applicationStatus,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/merchant-agents", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const location =
      typeof req.query.location === "string" ? req.query.location.trim() : "";
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit || "30"), 10) || 30));
    const approvedOr = [
      { "merchantAgent.applicationStatus": "approved" },
      { "merchantAgent.applicationStatus": { $exists: false } },
    ];
    const and: Record<string, unknown>[] = [{ $or: approvedOr }];
    if (q.length >= 1) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      and.push({
        $or: [
          { name: rx },
          { username: rx },
          { "merchantAgent.businessName": rx },
        ],
      });
    }
    if (location.length >= 1) {
      const locRx = new RegExp(location.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      and.push({
        $or: [
          { countryCode: locRx },
          { "merchantAgent.publicNote": locRx },
          { "merchantAgent.businessDescription": locRx },
        ],
      });
    }
    const filter: Record<string, unknown> = {
      isVerified: true,
      suspended: { $ne: true },
      active: true,
      "merchantAgent.enabled": true,
      "merchantAgent.applicationStatus": { $nin: ["suspended", "rejected", "pending", "none"] },
      $and: and,
    };
    const agents = await User.find(filter)
      .select("_id name username countryCode merchantAgent")
      .sort({ name: 1 })
      .limit(limit)
      .lean();
    res.json(
      agents.map((a: any) => ({
        _id: a._id,
        name: a.name,
        username: a.username,
        countryCode: a.countryCode || "",
        publicNote: a.merchantAgent?.publicNote || "",
        businessName: a.merchantAgent?.businessName || "",
        businessDescription: a.merchantAgent?.businessDescription || "",
      }))
    );
  } catch (err) {
    next(err);
  }
});

// Agent: customer gave cash — agent moves wallet float to customer after customer approves in app
router.post("/merchant-agent/deposit/initiate", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const { error } = merchantAgentDepositInitSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);
    const agentUser = await User.findById(req.user!._id);
    if (!agentUser || !canOperateAsMerchantAgent(agentUser)) {
      throw new AppError("Approved merchant agent with verified KYC required. Top up wallet float to transact.", 403);
    }

    const { customerUserId, customerUsername, amount } = req.body as {
      customerUserId?: string;
      customerUsername?: string;
      amount: number;
    };

    let customerId = customerUserId;
    if (customerUsername && !customerUserId) {
      const u = await User.findOne({ username: String(customerUsername).toLowerCase().trim() }).select("_id").lean();
      if (!u) throw new AppError("Customer not found", 404);
      customerId = u._id.toString();
    }
    if (!customerId) throw new AppError("Customer required", 400);
    if (String(customerId) === String(req.user!._id)) throw new AppError("Cannot deposit to yourself", 400);

    const customer = await User.findById(customerId).select("phone name username").lean();
    if (!customer) throw new AppError("Customer not found", 404);
    if (!(customer as any).phone) throw new AppError("Customer must add a phone number to receive SMS approval", 400);

    const agentWallet = await Wallet.findOne({ user: req.user!._id });
    if (!agentWallet || agentWallet.balance < amount) {
      throw new AppError("Insufficient wallet float — top up your agent wallet first", 400);
    }

    const reference = `AGENT-DEP-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    const expiresAt = new Date(Date.now() + DEPOSIT_EXPIRY_MS);

    const tx = await MerchantAgentCashTx.create({
      kind: "cash_deposit",
      status: "pending_customer",
      agent: req.user!._id,
      customer: customerId,
      amount,
      reference,
      expiresAt,
    });

    const agentName = (agentUser as any)?.name || (agentUser as any)?.username || "An agent";
    const link = `${process.env.FRONTEND_URL || "http://localhost:3000"}/wallet?agentCashTx=${tx._id}`;
    const text = `${agentName} requests to credit R${amount.toFixed(2)} to your ACBPayWallet (cash deposit you paid them). Approve in app: ${link} Expires in 24h.`;
    await sendSms({ phone: (customer as any).phone, text, channel: "sms" });

    await AuditLog.create({
      action: "MERCHANT_AGENT_DEPOSIT_INIT",
      user: req.user!._id,
      meta: { txId: tx._id, customerId, amount },
    });

    res.status(201).json({
      txId: tx._id,
      amount,
      expiresAt,
      message: "Approval SMS sent to customer",
    });
  } catch (err) {
    next(err);
  }
});

router.post("/merchant-agent/deposit/approve", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const { error } = merchantAgentDepositApproveSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);
    const { txId } = req.body;

    const mtx = await MerchantAgentCashTx.findById(txId);
    if (!mtx) throw new AppError("Transaction not found", 404);
    if (mtx.kind !== "cash_deposit" || mtx.status !== "pending_customer") {
      throw new AppError("Invalid or already processed transaction", 400);
    }
    if (String(mtx.customer) !== String(req.user!._id)) {
      throw new AppError("You are not the customer for this deposit", 403);
    }
    if (new Date() > mtx.expiresAt) {
      mtx.status = "expired";
      await mtx.save();
      throw new AppError("This deposit request has expired", 400);
    }

    const agentWallet = await Wallet.findOne({ user: mtx.agent });
    const customerWallet = await Wallet.findOne({ user: mtx.customer });
    if (!agentWallet || agentWallet.balance < mtx.amount) {
      throw new AppError("Agent no longer has sufficient balance", 400);
    }
    const custWallet = customerWallet || (await Wallet.create({ user: mtx.customer }));

    const ref = mtx.reference;
    agentWallet.balance -= mtx.amount;
    agentWallet.transactions.push({
      type: "debit",
      amount: -mtx.amount,
      reference: ref,
      createdAt: new Date(),
    });
    await agentWallet.save();

    custWallet.balance += mtx.amount;
    custWallet.transactions.push({
      type: "credit",
      amount: mtx.amount,
      reference: ref,
      createdAt: new Date(),
    });
    await custWallet.save();

    mtx.status = "completed";
    mtx.completedAt = new Date();
    await mtx.save();

    await AuditLog.create({
      action: "MERCHANT_AGENT_DEPOSIT_DONE",
      user: req.user!._id,
      meta: { txId: mtx._id, amount: mtx.amount, agent: mtx.agent },
    });

    res.json({ message: "Cash deposit credited to your wallet", balance: custWallet.balance });
  } catch (err) {
    next(err);
  }
});

// Customer: move wallet balance to agent — collect physical cash from agent
router.post("/merchant-agent/withdrawal/initiate", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const { error } = merchantAgentWithdrawSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);
    const { agentId, amount } = req.body as { agentId: string; amount: number };

    if (String(agentId) === String(req.user!._id)) throw new AppError("Choose another agent", 400);

    const agent = await User.findById(agentId)
      .select("merchantAgent name username phone isVerified suspended locked active")
      .lean();
    if (!agent || !canOperateAsMerchantAgent(agent)) {
      throw new AppError("That user is not an active approved merchant agent (KYC + admin approval required)", 400);
    }

    const customerWallet = await Wallet.findOne({ user: req.user!._id });
    if (!customerWallet || customerWallet.balance < amount) {
      throw new AppError("Insufficient balance", 400);
    }

    let agentWallet = await Wallet.findOne({ user: agentId });
    if (!agentWallet) agentWallet = await Wallet.create({ user: agentId });

    const reference = `AGENT-WD-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    const now = new Date();

    customerWallet.balance -= amount;
    customerWallet.transactions.push({
      type: "debit",
      amount: -amount,
      reference,
      createdAt: now,
    });
    await customerWallet.save();

    agentWallet.balance += amount;
    agentWallet.transactions.push({
      type: "credit",
      amount,
      reference,
      createdAt: now,
    });
    await agentWallet.save();

    const customer = await User.findById(req.user!._id).select("name username phone").lean();
    const mtx = await MerchantAgentCashTx.create({
      kind: "cash_withdrawal",
      status: "completed",
      agent: agentId,
      customer: req.user!._id,
      amount,
      reference,
      expiresAt: now,
      completedAt: now,
    });

    const custLabel = (customer as any)?.name || (customer as any)?.username || "Customer";
    if ((agent as any).phone) {
      const text = `${custLabel} sent R${amount.toFixed(2)} to you for ACBPayWallet cash withdrawal — hand over cash when they visit. Ref ${reference}`;
      await sendSms({ phone: (agent as any).phone, text, channel: "sms" });
    }
    if ((customer as any)?.phone) {
      const text = `R${amount.toFixed(2)} sent to agent ${(agent as any).name || (agent as any).username} for cash pickup. Ref ${reference}. Meet them to collect cash.`;
      await sendSms({ phone: (customer as any).phone, text, channel: "sms" });
    }

    await AuditLog.create({
      action: "MERCHANT_AGENT_WITHDRAWAL",
      user: req.user!._id,
      meta: { txId: mtx._id, agentId, amount },
    });

    res.json({
      message: "Funds sent to agent — collect your cash from them in person",
      balance: customerWallet.balance,
      txId: mtx._id,
      reference,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/merchant-agent/handover", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const { error } = merchantAgentHandoverSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);
    const { txId } = req.body;

    const mtx = await MerchantAgentCashTx.findById(txId);
    if (!mtx) throw new AppError("Transaction not found", 404);
    if (mtx.kind !== "cash_withdrawal" || mtx.status !== "completed") {
      throw new AppError("Invalid transaction", 400);
    }
    if (String(mtx.agent) !== String(req.user!._id)) {
      throw new AppError("Only the agent can confirm handover", 403);
    }
    if (mtx.handoverConfirmedAt) {
      return res.json({ message: "Already confirmed" });
    }
    mtx.handoverConfirmedAt = new Date();
    await mtx.save();
    await AuditLog.create({
      action: "MERCHANT_AGENT_HANDOVER",
      user: req.user!._id,
      meta: { txId: mtx._id },
    });
    res.json({ message: "Cash handover recorded" });
  } catch (err) {
    next(err);
  }
});

router.get("/merchant-agent/tx/:id", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const mtx = await MerchantAgentCashTx.findById(req.params.id)
      .populate("agent", "name username")
      .populate("customer", "name username")
      .lean();
    if (!mtx) throw new AppError("Transaction not found", 404);
    const uid = String(req.user!._id);
    if (String((mtx as any).agent) !== uid && String((mtx as any).customer) !== uid) {
      throw new AppError("Unauthorized", 403);
    }
    res.json(mtx);
  } catch (err) {
    next(err);
  }
});

router.get("/merchant-agent/pending", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const uid = req.user!._id;
    const asCustomer = await MerchantAgentCashTx.find({
      customer: uid,
      status: "pending_customer",
      kind: "cash_deposit",
    })
      .populate("agent", "name username")
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();
    const asAgent = await MerchantAgentCashTx.find({
      agent: uid,
      status: "pending_customer",
      kind: "cash_deposit",
    })
      .populate("customer", "name username")
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();
    res.json({ asCustomer, asAgent });
  } catch (err) {
    next(err);
  }
});

router.get("/merchant-agent/history", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const uid = req.user!._id;
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit || "25"), 10) || 25));
    const rows = await MerchantAgentCashTx.find({
      $or: [{ agent: uid }, { customer: uid }],
      status: { $in: ["completed", "expired", "cancelled"] },
    })
      .populate("agent", "name username")
      .populate("customer", "name username")
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/** Tuckshop / cash-agent commission dashboard (web + WhatsApp parity). */
router.get("/agent-earnings/summary", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const uid = req.user!._id;
    const summary = await getAgentCommissionSummary(uid);
    const registrations = await TuckshopCashAgentRegistration.find({ applicantUser: uid })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    res.json({ summary, registrations });
  } catch (err) {
    next(err);
  }
});

router.post("/agent-earnings/email-report", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const uid = req.user!._id;
    const recent = await AuditLog.findOne({
      action: "AGENT_EARNINGS_REPORT_EMAIL",
      user: uid,
      createdAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) },
    })
      .select("_id")
      .lean();
    if (recent) throw new AppError("Please wait up to an hour between report emails.", 429);
    const result = await emailAgentEarningsReportForUser(uid);
    if (!result.ok) throw new AppError(result.message, 400);
    await AuditLog.create({
      action: "AGENT_EARNINGS_REPORT_EMAIL",
      user: uid,
      meta: { channel: "web" },
    });
    res.json({ ok: true, message: result.message });
  } catch (err) {
    next(err);
  }
});

export default router;
