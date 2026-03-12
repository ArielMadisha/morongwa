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
import { authenticate, AuthRequest } from "../middleware/auth";
import {
  topupSchema,
  payoutSchema,
  donateSchema,
  qrPaymentFromScanSchema,
  confirmQrPaymentSchema,
  requestMoneySchema,
  payMoneyRequestSchema,
  payWithCardSchema,
  checkoutPaySchema,
} from "../utils/validators";
import { AppError } from "../middleware/errorHandler";
import { getPaginationParams } from "../utils/helpers";
import { initiatePayment } from "../services/payment";
import { sendSms } from "../services/otpDelivery";

const router = express.Router();
const PAYMENT_OTP_SECRET = process.env.OTP_SECRET || "otp-secret-change-me";
const PAYMENT_OTP_EXPIRY_MS = 5 * 60 * 1000;

// Get wallet balance
router.get("/balance", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    let wallet = await Wallet.findOne({ user: req.user!._id });

    if (!wallet) {
      wallet = await Wallet.create({ user: req.user!._id });
    }

    res.json({ balance: wallet.balance });
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

    res.json(transactions);
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
      returnUrl: `${process.env.FRONTEND_URL || "http://localhost:3000"}${safeReturnPath}`,
      notifyUrl: `${process.env.BACKEND_URL || "http://localhost:4000"}/api/payments/webhook`,
    });
    if (!paymentResult.success || !paymentResult.paymentUrl) {
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
      reference,
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

    if (wallet.balance < amount) {
      throw new AppError("Insufficient balance", 400);
    }

    wallet.balance -= amount;
    wallet.transactions.push({
      type: "payout",
      amount: -amount,
      createdAt: new Date(),
    });
    await wallet.save();

    await Transaction.create({
      wallet: wallet._id,
      user: req.user!._id,
      type: "payout",
      amount,
      reference: `PAYOUT-${Date.now()}`,
      status: "pending",
    });

    await AuditLog.create({
      action: "WALLET_PAYOUT",
      user: req.user!._id,
      meta: { amount },
    });

    res.json({
      message: "Payout request submitted successfully",
      balance: wallet.balance,
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

// Get pending payment request (for payer - when they open link from SMS)
router.get("/pending-payment/:id", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const pr = await WalletPaymentRequest.findById(req.params.id)
      .populate("toUser", "name username")
      .lean();
    if (!pr) throw new AppError("Payment request not found", 404);
    if (String(pr.fromUser) !== String(req.user!._id)) {
      throw new AppError("You are not the payer for this payment", 403);
    }
    if (pr.status !== "pending") throw new AppError("Payment already completed or expired", 400);
    if (new Date() > pr.otpExpiresAt) {
      await WalletPaymentRequest.findByIdAndUpdate(req.params.id, { status: "expired" });
      throw new AppError("Payment request expired", 400);
    }
    res.json({
      _id: pr._id,
      amount: pr.amount,
      merchantName: (pr.metadata as any)?.merchantName || (pr.toUser as any)?.name || (pr.toUser as any)?.username || "Store",
      expiresAt: pr.otpExpiresAt,
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

// Create payment from scan (merchant/store). Sends SMS OTP to payer.
router.post("/payment-from-scan", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const { error } = qrPaymentFromScanSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);

    const { fromUserId, amount, merchantName } = req.body;
    const toUser = req.user!._id;

    if (String(fromUserId) === String(toUser)) {
      throw new AppError("Cannot pay yourself", 400);
    }

    const payer = await User.findById(fromUserId).select("phone name").lean();
    if (!payer) throw new AppError("Payer not found", 404);
    if (!(payer as any).phone) throw new AppError("Payer has no phone number for verification", 400);

    const otp = crypto.randomInt(100000, 999999).toString();
    const otpHash = crypto.createHmac("sha256", PAYMENT_OTP_SECRET).update(otp).digest("hex");
    const otpExpiresAt = new Date(Date.now() + PAYMENT_OTP_EXPIRY_MS);
    const reference = `QR-${Date.now()}-${Math.round(Math.random() * 1e6)}`;

    const paymentRequest = await WalletPaymentRequest.create({
      fromUser: fromUserId,
      toUser,
      amount,
      otpHash,
      otpExpiresAt,
      status: "pending",
      reference,
      metadata: { merchantName: merchantName || (req.user as any)?.name },
    });

    const payLink = `${process.env.FRONTEND_URL || "http://localhost:3000"}/wallet?pendingPayment=${paymentRequest._id}`;
    const text = `Pay R${amount.toFixed(2)}${merchantName ? ` at ${merchantName}` : ""} via ACBPayWallet. Pay now: ${payLink} Or give code to teller: ${otp}. Expires in 5 min.`;
    await sendSms({ phone: (payer as any).phone, text, channel: "sms" });

    res.status(201).json({
      paymentRequestId: paymentRequest._id,
      amount,
      expiresIn: 300,
      message: "Verification code sent to payer",
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

    const otpHash = crypto.createHmac("sha256", PAYMENT_OTP_SECRET).update(otp).digest("hex");
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

    res.json({
      message: "Payment successful",
      amount: pr.amount,
      reference: pr.reference,
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
    });

    if (!paymentResult.success || !paymentResult.paymentUrl) {
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
      reference,
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

    const pr = await WalletPaymentRequest.findById(paymentRequestId);
    if (!pr) throw new AppError("Payment request not found", 404);
    if (pr.status !== "pending") throw new AppError("Payment already completed or expired", 400);
    if (String(pr.fromUser) !== String(req.user!._id)) {
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

    await AuditLog.create({
      action: "WALLET_QR_PAYMENT_WALLET",
      user: pr.fromUser,
      meta: { amount: pr.amount, toUser: pr.toUser, reference: pr.reference },
    });

    res.json({
      message: "Payment successful",
      amount: pr.amount,
      balance: payerWallet.balance,
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
    });

    if (!paymentResult.success || !paymentResult.paymentUrl) {
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
      reference,
    });
  } catch (err) {
    next(err);
  }
});

// --- E-commerce checkout (ACBPayWallet payment page for merchant sites) ---

// Get checkout details (public - for pay page to display merchant info)
router.get("/checkout/details", async (req: AuthRequest, res: Response, next) => {
  try {
    const { merchantId, amount, reference, name } = req.query;
    if (!merchantId || !amount || !reference) {
      throw new AppError("merchantId, amount, reference required", 400);
    }
    const merchant = await User.findById(merchantId).select("name username").lean();
    if (!merchant) throw new AppError("Merchant not found", 404);
    const amt = parseFloat(amount as string);
    if (isNaN(amt) || amt < 0.01) throw new AppError("Invalid amount", 400);
    res.json({
      merchantId,
      amount: amt,
      reference: String(reference),
      merchantName: (name as string) || (merchant as any).name || (merchant as any).username || "Merchant",
    });
  } catch (err) {
    next(err);
  }
});

// Pay checkout (wallet or card)
router.post("/checkout/pay", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const { error } = checkoutPaySchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);

    const { merchantId, amount, reference, returnUrl, cancelUrl, method, cardId } = req.body;
    const payerId = req.user!._id;

    if (String(merchantId) === String(payerId)) {
      throw new AppError("Cannot pay yourself", 400);
    }

    const merchant = await User.findById(merchantId).select("name").lean();
    if (!merchant) throw new AppError("Merchant not found", 404);

    if (method === "wallet") {
      const payerWallet = await Wallet.findOne({ user: payerId });
      const merchantWallet = await Wallet.findOne({ user: merchantId });
      if (!payerWallet || payerWallet.balance < amount) {
        throw new AppError("Insufficient balance", 400);
      }
      const recipientWallet = merchantWallet || (await Wallet.create({ user: merchantId }));
      const ref = `CHECKOUT-${reference}-${Date.now()}`;

      payerWallet.balance -= amount;
      payerWallet.transactions.push({ type: "debit", amount: -amount, reference: ref, createdAt: new Date() });
      await payerWallet.save();

      recipientWallet.balance += amount;
      recipientWallet.transactions.push({ type: "credit", amount, reference: ref, createdAt: new Date() });
      await recipientWallet.save();

      await AuditLog.create({
        action: "CHECKOUT_PAY_WALLET",
        user: payerId,
        meta: { amount, merchantId, reference },
      });

      const sep = returnUrl.includes("?") ? "&" : "?";
      return res.json({
        success: true,
        redirectUrl: `${returnUrl}${sep}status=success&reference=${encodeURIComponent(reference)}&amount=${amount}`,
      });
    }

    // method === "card"
    const card = await StoredCard.findOne({ _id: cardId, user: payerId });
    if (!card) throw new AppError("Card not found", 404);

    const session = await CheckoutSession.create({
      merchantId,
      payerId,
      amount,
      reference,
      returnUrl,
      cancelUrl,
      status: "pending",
    });

    const paymentResult = await initiatePayment({
      amount,
      reference: `CHECKOUT-${session._id}`,
      email: req.user!.email,
      returnUrl: `${process.env.FRONTEND_URL || "http://localhost:3000"}/pay/return?session=${session._id}`,
      notifyUrl: `${process.env.BACKEND_URL || "http://localhost:4000"}/api/payments/webhook`,
      vaultId: card.vaultId,
    });

    if (!paymentResult.success || !paymentResult.paymentUrl) {
      await CheckoutSession.findByIdAndUpdate(session._id, { status: "failed" });
      throw new AppError(paymentResult.error || "Could not start payment", 500);
    }

    res.json({
      success: true,
      paymentUrl: paymentResult.paymentUrl,
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
    if (!(payee as any).phone) throw new AppError("User has no phone number to notify", 400);

    const requester = await User.findById(fromUser).select("name username").lean();
    const requesterName = (requester as any)?.name || (requester as any)?.username || "Someone";
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const moneyRequest = await MoneyRequest.create({
      fromUser,
      toUser: toUserIdResolved,
      amount,
      message,
      status: "pending",
      notifyChannel,
      expiresAt,
      reference: `REQ-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
    });

    const link = `${process.env.FRONTEND_URL || "http://localhost:3000"}/wallet?payRequest=${moneyRequest._id}`;
    const text = `${requesterName} is requesting R${amount.toFixed(2)} from you via ACBPayWallet. ${message ? `Message: ${message}. ` : ""}Pay now: ${link}`;
    const channel = notifyChannel === "sms" ? "sms" : "whatsapp";
    await sendSms({ phone: (payee as any).phone, text, channel });

    res.status(201).json({
      requestId: moneyRequest._id,
      amount,
      message: "Request sent. Payee will receive notification.",
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

    const payerWallet = await Wallet.findOne({ user: payeeId });
    const recipientWallet = await Wallet.findOne({ user: mr.fromUser });
    if (!payerWallet || payerWallet.balance < mr.amount) {
      throw new AppError("Insufficient balance", 400);
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
      meta: { amount: mr.amount, fromUser: mr.fromUser, requestId },
    });

    res.json({
      message: "Payment sent successfully",
      amount: mr.amount,
      balance: payerWallet.balance,
    });
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

export default router;
