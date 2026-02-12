// Payment & escrow routes for PayGate + FNB integration
import express, { Request, Response } from "express";
import Payment from "../data/models/Payment";
import Wallet from "../data/models/Wallet";
import Transaction from "../data/models/Transaction";
import Order from "../data/models/Order";
import AuditLog from "../data/models/AuditLog";
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

const router = express.Router();

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

// Payment webhook (PayGate callback)
router.post("/webhook", async (req: Request, res: Response, next) => {
  try {
    const result = await processPaymentCallback(req.body);

    const payment = await Payment.findOne({ reference: result.reference });
    if (!payment) throw new AppError("Payment not found", 404);

    payment.status = result.status as "pending" | "successful" | "failed" | "refunded" | "disputed";
    await payment.save();

    if (result.status === "successful") {
      if (payment.reference.startsWith("ORDER-")) {
        const orderId = payment.reference.replace("ORDER-", "");
        const order = await Order.findById(orderId);
        if (order && order.status === "pending_payment") {
          order.status = "paid";
          order.paidAt = new Date();
          order.paymentReference = payment.reference;
          await order.save();
        }
      } else {
        // Credit wallet (top-up)
        let wallet = await Wallet.findOne({ user: payment.user });
        if (!wallet) {
          wallet = await Wallet.create({ user: payment.user });
        }

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

    res.json({ message: "Webhook processed successfully" });
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
