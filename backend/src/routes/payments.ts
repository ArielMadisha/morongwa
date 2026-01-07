// Payment routes with PayGate integration
import express, { Request, Response } from "express";
import Payment from "../data/models/Payment";
import Wallet from "../data/models/Wallet";
import Transaction from "../data/models/Transaction";
import AuditLog from "../data/models/AuditLog";
import { authenticate, AuthRequest } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { initiatePayment, processPaymentCallback } from "../services/payment";
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
      // Credit wallet
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

export default router;
