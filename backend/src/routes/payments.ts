// Payment & escrow routes for PayGate + FNB integration
import express, { Request, Response } from "express";
import Payment from "../data/models/Payment";
import Wallet from "../data/models/Wallet";
import Transaction from "../data/models/Transaction";
import Order from "../data/models/Order";
import AuditLog from "../data/models/AuditLog";
import StoredCard from "../data/models/StoredCard";
import WalletPaymentRequest from "../data/models/WalletPaymentRequest";
import CheckoutSession from "../data/models/CheckoutSession";
import Escrow from "../data/models/Escrow";
import LedgerEntry from "../data/models/LedgerEntry";
import Task from "../data/models/Task";
import User from "../data/models/User";
import { authenticate, AuthRequest } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import {
  initiatePayment,
  processPaymentCallback,
  getPayGateFlatFeeZar,
  verifyPayGateBridgeQuery,
  buildPayGateRedirectHtml,
  getPayGateProcessUrl,
} from "../services/payment";
import payoutService from "../services/payoutService";
import fnbService from "../services/fnbService";
import logger from "../utils/logger";
import { trySettleMoneyRequestAfterTopup, finalizeMoneyRequestAfterDirectCard } from "../services/moneyRequestService";
import { generateReference } from "../utils/helpers";
import { notifyOrderPaid } from "../services/orderNotification";
import { forwardOrderToExternalSupplier } from "../services/orderForwardingService";
import MusicPurchase from "../data/models/MusicPurchase";
import Song from "../data/models/Song";
import Cart from "../data/models/Cart";
import { sendSms } from "../services/otpDelivery";

const MUSIC_PLATFORM_COMMISSION_PCT = 30;
const MUSIC_OWNER_SHARE_PCT = 70;

const router = express.Router();

/** Browser/mobile open this URL after initiate — returns HTML that POSTs to PayWeb3 process.trans (GET to process.trans is invalid). */
router.get("/paygate-redirect", (req: Request, res: Response) => {
  const v = verifyPayGateBridgeQuery(req.query as Record<string, unknown>);
  if (!v.ok) {
    const safe = String(v.reason || "Invalid link").replace(/&/g, "&amp;").replace(/</g, "&lt;");
    return res.status(400).type("html").send(`<!DOCTYPE html><html><body><p>${safe}</p></body></html>`);
  }
  const html = buildPayGateRedirectHtml(getPayGateProcessUrl(), v.payRequestId, v.checksum);
  res.setHeader(
    "Content-Security-Policy",
    "script-src 'unsafe-inline'; default-src 'none'; form-action https://secure.paygate.co.za https://*.paygate.co.za"
  );
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  return res.status(200).type("html").send(html);
});

async function creditAdminPayGateFee(reference: string): Promise<void> {
  const fee = getPayGateFlatFeeZar();
  if (!(fee > 0)) return;
  const adminEmail = String(process.env.ADMIN_EMAIL || "").trim();
  if (!adminEmail) return;
  const adminUser = await User.findOne({ email: adminEmail }).select("_id").lean();
  if (!adminUser?._id) return;
  let adminWallet = await Wallet.findOne({ user: adminUser._id });
  if (!adminWallet) adminWallet = await Wallet.create({ user: adminUser._id });
  const feeRef = `PAYGATE-FEE-${reference}`;
  const alreadyCredited = (adminWallet.transactions || []).some((t: any) => String(t?.reference || "") === feeRef);
  if (alreadyCredited) return;
  adminWallet.balance += fee;
  adminWallet.transactions.push({
    type: "credit",
    amount: fee,
    reference: feeRef,
    createdAt: new Date(),
  });
  await adminWallet.save();
  await AuditLog.create({
    action: "PAYGATE_FEE_CREDITED_ADMIN",
    user: adminUser._id,
    meta: { reference, fee },
  });
}

async function notifyDirectWalletSendSuccess(params: {
  senderUserId?: string;
  recipientUserId: string;
  paymentReference: string;
  sendAmount: number;
  senderPhone?: string;
  recipientPhone?: string;
}): Promise<void> {
  const { senderUserId, recipientUserId, paymentReference, sendAmount, senderPhone, recipientPhone } = params;
  try {
    const [sender, recipient] = await Promise.all([
      senderUserId ? User.findById(senderUserId).select("phone").lean() : Promise.resolve(null),
      User.findById(recipientUserId).select("phone").lean(),
    ]);

    const senderPhoneOut = String((sender as any)?.phone || senderPhone || "").trim();
    const recipientPhoneOut = String((recipient as any)?.phone || recipientPhone || "").trim();
    const amountText = `R${Number(sendAmount || 0).toFixed(2)}`;
    const senderLabel = senderPhoneOut ? `+${senderPhoneOut.replace(/^\+/, "")}` : "the sender";

    if (senderPhoneOut) {
      await sendSms({
        phone: senderPhoneOut,
        channel: "whatsapp",
        text: `Payment sent successfully. ${amountText} sent to +${recipientPhoneOut.replace(/^\+/, "") || "recipient"}. Ref: ${paymentReference}`,
      }).catch(() => {});
    }
    if (recipientPhoneOut) {
      await sendSms({
        phone: recipientPhoneOut,
        channel: "whatsapp",
        text: `Payment of ${amountText} received from user ${senderLabel}. Ref: ${paymentReference}`,
      }).catch(() => {});
    }
  } catch {
    // non-fatal notification path
  }
}

async function processMusicPurchases(
  musicItems: Array<{ songId: any; qty: number; price: number }>,
  buyerId: any
): Promise<void> {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminUser = adminEmail ? await User.findOne({ email: adminEmail }).select("_id") : null;
  if (!adminUser?._id) return;
  for (const m of musicItems) {
    const song = await Song.findById(m.songId).lean();
    if (!song) continue;
    let ownerWallet = await Wallet.findOne({ user: (song as any).userId });
    if (!ownerWallet) ownerWallet = await Wallet.create({ user: (song as any).userId });
    let adminWallet = await Wallet.findOne({ user: adminUser._id });
    if (!adminWallet) adminWallet = await Wallet.create({ user: adminUser._id });
    const adminCommission = Math.round((m.price * m.qty * MUSIC_PLATFORM_COMMISSION_PCT / 100) * 100) / 100;
    const ownerShare = Math.round((m.price * m.qty * MUSIC_OWNER_SHARE_PCT / 100) * 100) / 100;
    const reference = `MUSIC-${m.songId}-${Date.now()}`;
    ownerWallet.balance += ownerShare;
    ownerWallet.transactions.push({ type: "credit", amount: ownerShare, reference: `${reference}-OWNER`, createdAt: new Date() });
    await ownerWallet.save();
    adminWallet.balance += adminCommission;
    adminWallet.transactions.push({ type: "credit", amount: adminCommission, reference: `${reference}-ADMIN`, createdAt: new Date() });
    await adminWallet.save();
    await MusicPurchase.create({
      songId: m.songId,
      buyerId,
      ownerId: (song as any).userId,
      amount: m.price * m.qty,
      adminCommission,
      ownerShare,
      reference,
    });
  }
}

// Initiate payment
router.post("/initiate", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const { amount } = req.body;

    if (!amount || amount < 10) {
      throw new AppError("Minimum payment amount is R10", 400);
    }

    const reference = generateReference("PAY");

    const payment = await Payment.create({
      user: req.user!._id,
      amount,
      reference,
      status: "pending",
    });

    const paymentResult = await initiatePayment({
      amount,
      reference,
      email: req.user!.email,
      // Use an existing frontend route in production.
      returnUrl: `${process.env.FRONTEND_URL || "https://qwertymates.com"}/wallet`,
      notifyUrl: `${process.env.BACKEND_URL}/api/payments/webhook`,
    });

    if (!paymentResult.success) {
      payment.status = "failed";
      await payment.save();
      throw new AppError(paymentResult.error || "Payment initiation failed", 500);
    }

    payment.gatewayRequest = paymentResult;
    await payment.save();

    await AuditLog.create({
      action: "PAYMENT_INITIATED",
      user: req.user!._id,
      meta: { reference, amount },
    });

    res.json({
      message: "Payment initiated successfully",
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

// Payment webhook (PayGate callback) - must respond with "OK" for PayGate
router.post("/webhook", async (req: Request, res: Response) => {
  const sendOk = () => res.status(200).send("OK");

  try {
    const result = await processPaymentCallback(req.body);
    const ref = result.reference;

    // ADDCARD: PayVault tokenization - no Payment record
    if (ref.startsWith("ADDCARD-") && result.status === "successful" && result.vaultId) {
      const parts = ref.replace("ADDCARD-", "").split("-");
      const userId = parts[0];
      if (userId) {
        const mongoose = await import("mongoose");
        const uid = new mongoose.default.Types.ObjectId(userId);
        const existing = await StoredCard.findOne({ user: uid, vaultId: result.vaultId });
        if (!existing) {
          const payvault1 = (result.payvaultData1 || "").replace(/\D/g, "");
          const last4 = payvault1.length >= 4 ? payvault1.slice(-4) : "????";
          const brand = result.payMethodDetail || "Card";
          const payvault2 = (result.payvaultData2 || "").replace(/\D/g, "");
          const mmMatch = payvault2.length >= 4 ? payvault2.match(/^(\d{2})(\d{2})$/) : null;
          const expiryMonth = mmMatch ? Math.min(12, Math.max(1, parseInt(mmMatch[1], 10))) : 12;
          const expiryYear = mmMatch ? (parseInt(mmMatch[2], 10) <= 50 ? 2000 + parseInt(mmMatch[2], 10) : 1900 + parseInt(mmMatch[2], 10)) : new Date().getFullYear() + 5;

          const isFirst = (await StoredCard.countDocuments({ user: uid })) === 0;
          await StoredCard.create({
            user: uid,
            vaultId: result.vaultId,
            payvaultData1: result.payvaultData1,
            payvaultData2: result.payvaultData2,
            last4,
            brand,
            expiryMonth,
            expiryYear,
            isDefault: isFirst,
          });
        }
        let wallet = await Wallet.findOne({ user: uid });
        if (!wallet) wallet = await Wallet.create({ user: uid });
        wallet.balance += 1; // R1 credited from add-card charge
        wallet.transactions.push({ type: "topup", amount: 1, reference: ref, createdAt: new Date() });
        await wallet.save();
        await AuditLog.create({ action: "WALLET_CARD_ADDED", user: uid, meta: { reference: ref } });
      }
      await creditAdminPayGateFee(ref);
      return sendOk();
    }

    // CHECKOUT: E-commerce payment with card
    if (ref.startsWith("CHECKOUT-") && result.status === "successful") {
      const sessionId = ref.replace("CHECKOUT-", "");
      const session = await CheckoutSession.findById(sessionId);
      if (session && session.status === "pending") {
        // Credit merchant the session amount (goods total), not the PayGate total (includes flat card fee).
        const amount = Number(session.amount);
        let merchantWallet = await Wallet.findOne({ user: session.merchantId });
        if (!merchantWallet) merchantWallet = await Wallet.create({ user: session.merchantId });
        merchantWallet.balance += amount;
        merchantWallet.transactions.push({
          type: "credit",
          amount,
          reference: `CHECKOUT-${session.reference}`,
          createdAt: new Date(),
        });
        await merchantWallet.save();
        session.status = "completed";
        session.completedAt = new Date();
        await session.save();
        await AuditLog.create({
          action: "CHECKOUT_PAY_CARD",
          user: session.payerId,
          meta: { amount, merchantId: session.merchantId, reference: session.reference },
        });
      }
      await creditAdminPayGateFee(ref);
      return sendOk();
    }

    // CARDPMT: Pay with stored card for QR payment - no Payment record
    if (ref.startsWith("CARDPMT-") && result.status === "successful") {
      const prId = ref.replace("CARDPMT-", "");
      const pr = await WalletPaymentRequest.findById(prId);
      if (pr && pr.status === "pending") {
        // Credit payee the QR amount, not the PayGate total (includes flat card fee).
        const amount = Number(pr.amount);
        let payeeWallet = await Wallet.findOne({ user: pr.toUser });
        if (!payeeWallet) payeeWallet = await Wallet.create({ user: pr.toUser });
        payeeWallet.balance += amount;
        payeeWallet.transactions.push({ type: "credit", amount, reference: pr.reference, createdAt: new Date() });
        await payeeWallet.save();
        pr.status = "completed";
        pr.completedAt = new Date();
        await pr.save();
        await AuditLog.create({
          action: "WALLET_QR_PAYMENT_CARD",
          user: pr.fromUser,
          meta: { amount, toUser: pr.toUser, reference: pr.reference },
        });
      }
      await creditAdminPayGateFee(ref);
      return sendOk();
    }

    const payment = await Payment.findOne({ reference: ref });
    if (!payment) {
      logger.warn("Payment webhook: no Payment found for reference", { reference: ref });
      return sendOk();
    }
    const wasSuccessful = payment.status === "successful";

    payment.status = result.status as "pending" | "successful" | "failed" | "refunded" | "disputed";
    await payment.save();

    if (result.status === "successful" && !wasSuccessful) {
      await creditAdminPayGateFee(payment.reference);
      if (payment.reference.startsWith("ORDER-")) {
        const orderId = payment.reference.replace("ORDER-", "");
        const order = await Order.findById(orderId);
        if (order && order.status === "pending_payment") {
          order.status = "paid";
          order.paidAt = new Date();
          order.paymentReference = payment.reference;
          await order.save();
          await notifyOrderPaid({
            orderId: order._id.toString(),
            buyerId: order.buyerId.toString(),
            items: order.items.map((it: any) => ({
              productId: it.productId.toString(),
              qty: it.qty,
            })),
          });
          forwardOrderToExternalSupplier(order._id.toString()).catch((err) =>
            console.error("Order forward to external supplier failed:", err)
          );
          const musicItems = (order as any).musicItems;
          if (Array.isArray(musicItems) && musicItems.length > 0) {
            await processMusicPurchases(musicItems, order.buyerId);
          }
        }
      } else if (payment.reference.startsWith("MUSIC-")) {
        const meta = payment.metadata as { musicItems?: Array<{ songId: any; qty: number; price: number }> } | undefined;
        const musicItems = meta?.musicItems;
        if (Array.isArray(musicItems) && musicItems.length > 0) {
          await processMusicPurchases(musicItems, payment.user);
          const cart = await Cart.findOne({ user: payment.user });
          if (cart) {
            cart.musicItems = [];
            await cart.save();
          }
        }
      } else if (payment.reference.startsWith("TOPUP-") || payment.reference.startsWith("PAY-")) {
        const meta = (payment.metadata || {}) as {
          moneyRequestId?: string;
          directToRequester?: boolean;
          directWalletSend?: boolean;
          senderUserId?: string;
          recipientUserId?: string;
          senderPhone?: string;
          recipientPhone?: string;
          sendAmount?: number;
          partialFromWallet?: number;
        };
        if (meta.directWalletSend) {
          const recipientUserId = String(meta.recipientUserId || payment.user);
          let recipientWallet = await Wallet.findOne({ user: recipientUserId });
          if (!recipientWallet) recipientWallet = await Wallet.create({ user: recipientUserId as any });
          recipientWallet.balance += payment.amount;
          recipientWallet.transactions.push({
            type: "credit",
            amount: payment.amount,
            reference: payment.reference,
            createdAt: new Date(),
          });
          await recipientWallet.save();
          await Transaction.create({
            wallet: recipientWallet._id,
            user: recipientUserId as any,
            type: "credit",
            amount: payment.amount,
            reference: payment.reference,
            status: "successful",
          });

          const sendAmount =
            Number(meta.sendAmount) > 0
              ? Number(meta.sendAmount)
              : Math.round((Number(meta.partialFromWallet || 0) + Number(payment.amount || 0)) * 100) / 100;
          await notifyDirectWalletSendSuccess({
            senderUserId: meta.senderUserId,
            recipientUserId,
            paymentReference: payment.reference,
            sendAmount,
            senderPhone: meta.senderPhone,
            recipientPhone: meta.recipientPhone,
          });
        } else {
          let wallet = await Wallet.findOne({ user: payment.user });
          if (!wallet) wallet = await Wallet.create({ user: payment.user });
          wallet.balance += payment.amount;
          wallet.transactions.push({
            type: "topup",
            amount: payment.amount,
            reference: payment.reference,
            createdAt: new Date(),
          });
          await wallet.save();
          await Transaction.create({
            wallet: wallet._id,
            user: payment.user,
            type: "topup",
            amount: payment.amount,
            reference: payment.reference,
            status: "successful",
          });
        }
        if (meta.moneyRequestId && meta.directToRequester) {
          await finalizeMoneyRequestAfterDirectCard(meta.moneyRequestId);
        } else if (meta.moneyRequestId) {
          await trySettleMoneyRequestAfterTopup(payment.user as any, meta.moneyRequestId);
        }
      }
    }

    await AuditLog.create({
      action: "PAYMENT_WEBHOOK_RECEIVED",
      user: payment.user,
      meta: { reference: payment.reference, status: payment.status },
    });

    return sendOk();
  } catch (err: any) {
    logger.error("Payment webhook processing failed", {
      error: err?.message || String(err),
    });
    return sendOk();
  }
});

// Get payment status
router.get("/:reference", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const payment = await Payment.findOne({ reference: req.params.reference });

    if (!payment) throw new AppError("Payment not found", 404);

    if (payment.user.toString() !== req.user!._id.toString()) {
      throw new AppError("Unauthorized", 403);
    }

    res.json({ payment });
  } catch (err) {
    next(err);
  }
});

// List user payments
router.get("/", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const payments = await Payment.find({ user: req.user!._id })
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({ payments });
  } catch (err) {
    next(err);
  }
});

// ===== ESCROW & PAYOUT ENDPOINTS =====

/**
 * POST /api/payments/webhook/paygate-escrow
 * PayGate webhook for escrow task payments
 */
router.post("/webhook/paygate-escrow", async (req: Request, res: Response) => {
  try {
    const { reference, status, amount, taskId, clientId, runnerId, paymentMethod } = req.body;

    logger.info("PayGate escrow webhook received", { reference, status, amount });

    if (status !== "settled") {
      return res.status(400).json({ error: "Payment not settled", reference });
    }

    // Create escrow record
    const escrow = await payoutService.createEscrow(
      taskId,
      clientId,
      runnerId,
      amount,
      "ZAR",
      reference,
      paymentMethod || "card"
    );

    // Mark payment as settled
    await payoutService.markPaymentSettled(escrow._id.toString(), reference);

    // Update task to reflect escrow
    await Task.findByIdAndUpdate(taskId, { escrowed: true });

    // Log audit
    await AuditLog.create({
      user: clientId,
      action: "payment_settled",
      resource: "escrow",
      resourceId: escrow._id,
      metadata: { amount, reference, taskId },
    });

    res.status(200).json({
      success: true,
      escrowId: escrow._id,
      message: "Payment settled and escrow created",
    });
  } catch (error: any) {
    logger.error("PayGate escrow webhook failed", { error: error.message });
    res.status(500).json({ error: "Webhook failed", message: error.message });
  }
});

/**
 * GET /api/payments/escrow/:escrowId
 * Get escrow status (client, runner, or admin can view)
 */
router.get("/escrow/:escrowId", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { escrowId } = req.params;
    const userId = req.user!._id;

    const escrow = await Escrow.findById(escrowId)
      .populate("task", "title status")
      .populate("client", "name email")
      .populate("runner", "name email");

    if (!escrow) {
      throw new AppError("Escrow not found", 404);
    }

    // Authorization check
    if (
      escrow.client.toString() !== userId.toString() &&
      escrow.runner.toString() !== userId.toString() &&
      !(req.user as any).role?.includes("admin")
    ) {
      throw new AppError("Unauthorized", 403);
    }

    const ledger = await LedgerEntry.find({ escrow: escrowId }).sort({ createdAt: 1 });

    res.status(200).json({ escrow, ledger });
  } catch (err) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.message });
    } else {
      res.status(500).json({ error: "Escrow inquiry failed" });
    }
  }
});

/**
 * POST /api/payments/escrow/:escrowId/release
 * Admin: Release escrow after task completion
 */
router.post(
  "/escrow/:escrowId/release",
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      // Check admin role
      if (!(req.user as any).role?.includes("admin")) {
        throw new AppError("Admin access required", 403);
      }

      const { escrowId } = req.params;
      const { reason } = req.body;

      const escrow = await payoutService.releaseEscrow(
        escrowId,
        reason || "manual_release"
      );

      // Log audit
      await AuditLog.create({
        user: req.user!._id,
        action: "escrow_released",
        resource: "escrow",
        resourceId: escrowId,
        metadata: { reason, runnersNet: escrow.runnersNet },
      });

      res.status(200).json({
        success: true,
        message: "Escrow released",
        escrow,
      });
    } catch (err) {
      if (err instanceof AppError) {
        res.status(err.statusCode).json({ error: err.message });
      } else {
        res.status(500).json({ error: "Release failed" });
      }
    }
  }
);

/**
 * POST /api/payments/payout/:escrowId/initiate
 * Admin: Initiate FNB payout to runner
 */
router.post(
  "/payout/:escrowId/initiate",
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      if (!(req.user as any).role?.includes("admin")) {
        throw new AppError("Admin access required", 403);
      }

      const { escrowId } = req.params;
      const escrow = await payoutService.initiatePayout(escrowId);

      await AuditLog.create({
        user: req.user!._id,
        action: "payout_initiated",
        resource: "escrow",
        resourceId: escrowId,
        metadata: {
          fnbInstructionId: escrow.fnbInstructionId,
          amount: escrow.runnersNet,
        },
      });

      res.status(200).json({
        success: true,
        message: "Payout initiated via FNB",
        escrow,
      });
    } catch (err) {
      if (err instanceof AppError) {
        res.status(err.statusCode).json({ error: err.message });
      } else {
        res.status(500).json({ error: "Payout initiation failed" });
      }
    }
  }
);

/**
 * GET /api/payments/payout/:escrowId/status
 * Admin: Poll FNB payout status
 */
router.get(
  "/payout/:escrowId/status",
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      if (!(req.user as any).role?.includes("admin")) {
        throw new AppError("Admin access required", 403);
      }

      const { escrowId } = req.params;
      const escrow = await payoutService.pollPayoutStatus(escrowId);

      res.status(200).json({
        success: true,
        fnbStatus: escrow.fnbStatus,
        escrow,
      });
    } catch (err) {
      if (err instanceof AppError) {
        res.status(err.statusCode).json({ error: err.message });
      } else {
        res.status(500).json({ error: "Status check failed" });
      }
    }
  }
);

/**
 * POST /api/payments/escrow/:escrowId/refund
 * Admin: Refund escrow
 */
router.post(
  "/escrow/:escrowId/refund",
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      if (!(req.user as any).role?.includes("admin")) {
        throw new AppError("Admin access required", 403);
      }

      const { escrowId } = req.params;
      const { reason } = req.body;
      const escrow = await payoutService.refundEscrow(escrowId, reason || "manual_refund");

      await AuditLog.create({
        user: req.user!._id,
        action: "escrow_refunded",
        resource: "escrow",
        resourceId: escrowId,
        metadata: { reason, refundAmount: escrow.totalHeld - escrow.fees.bookingFee },
      });

      res.status(200).json({
        success: true,
        message: "Escrow refunded",
        escrow,
      });
    } catch (err) {
      if (err instanceof AppError) {
        res.status(err.statusCode).json({ error: err.message });
      } else {
        res.status(500).json({ error: "Refund failed" });
      }
    }
  }
);

/**
 * GET /api/payments/reconciliation/balance
 * Admin: FNB merchant account balance
 */
router.get(
  "/reconciliation/balance",
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      if (!(req.user as any).role?.includes("admin")) {
        throw new AppError("Admin access required", 403);
      }

      const balance = await fnbService.getAccountBalance();

      res.status(200).json({
        balance,
        currency: "ZAR",
        timestamp: new Date(),
      });
    } catch (err) {
      res.status(500).json({ error: "Balance fetch failed" });
    }
  }
);

/**
 * GET /api/payments/stats/summary
 * Admin: Escrow dashboard stats
 */
router.get(
  "/stats/summary",
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      if (!(req.user as any).role?.includes("admin")) {
        throw new AppError("Admin access required", 403);
      }

      const totalHeld = await Escrow.aggregate([
        { $match: { status: "held" } },
        { $group: { _id: null, total: { $sum: "$totalHeld" } } },
      ]);

      const pendingPayouts = await Escrow.countDocuments({
        status: "released",
        fnbStatus: { $in: ["pending", "processing"] },
      });

      const failedPayouts = await Escrow.countDocuments({
        fnbStatus: "failed",
      });

      res.status(200).json({
        totalHeld: totalHeld[0]?.total || 0,
        pendingPayouts,
        failedPayouts,
        timestamp: new Date(),
      });
    } catch (err) {
      res.status(500).json({ error: "Stats fetch failed" });
    }
  }
);

export default router;
