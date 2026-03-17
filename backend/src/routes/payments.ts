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
import { authenticate, AuthRequest, authorize } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { initiatePayment, processPaymentCallback } from "../services/payment";
import payoutService from "../services/payoutService";
import fnbService from "../services/fnbService";
import logger from "../utils/logger";
import { generateReference } from "../utils/helpers";
import { notifyOrderPaid } from "../services/orderNotification";
import { forwardOrderToExternalSupplier } from "../services/orderForwardingService";
import MusicPurchase from "../data/models/MusicPurchase";
import Song from "../data/models/Song";
import Cart from "../data/models/Cart";

const MUSIC_PLATFORM_COMMISSION_PCT = 30;
const MUSIC_OWNER_SHARE_PCT = 70;

const router = express.Router();

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
      returnUrl: `${process.env.FRONTEND_URL}/payment/return`,
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
      reference,
    });
  } catch (err) {
    next(err);
  }
});

// Payment webhook (PayGate callback) - must respond with "OK" for PayGate
router.post("/webhook", async (req: Request, res: Response, next) => {
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
      return sendOk();
    }

    // CHECKOUT: E-commerce payment with card
    if (ref.startsWith("CHECKOUT-") && result.status === "successful") {
      const sessionId = ref.replace("CHECKOUT-", "");
      const session = await CheckoutSession.findById(sessionId);
      if (session && session.status === "pending") {
        const amount = (req.body as any).AMOUNT ? Number((req.body as any).AMOUNT) / 100 : session.amount;
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
      return sendOk();
    }

    // CARDPMT: Pay with stored card for QR payment - no Payment record
    if (ref.startsWith("CARDPMT-") && result.status === "successful") {
      const prId = ref.replace("CARDPMT-", "");
      const pr = await WalletPaymentRequest.findById(prId);
      if (pr && pr.status === "pending") {
        const amount = (req.body as any).AMOUNT ? Number((req.body as any).AMOUNT) / 100 : pr.amount;
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
    }

    await AuditLog.create({
      action: "PAYMENT_WEBHOOK_RECEIVED",
      user: payment.user,
      meta: { reference: payment.reference, status: payment.status },
    });

    return sendOk();
  } catch (err) {
    next(err);
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
