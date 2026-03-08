// Wallet management routes
import express, { Response } from "express";
import Wallet from "../data/models/Wallet";
import Transaction from "../data/models/Transaction";
import AuditLog from "../data/models/AuditLog";
import Order from "../data/models/Order";
import { authenticate, AuthRequest } from "../middleware/auth";
import { topupSchema, payoutSchema, donateSchema } from "../utils/validators";
import { AppError } from "../middleware/errorHandler";
import { getPaginationParams } from "../utils/helpers";

const router = express.Router();

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

// Top up wallet (placeholder - integrate with payment gateway)
router.post("/topup", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const { error } = topupSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);

    const { amount } = req.body;

    let wallet = await Wallet.findOne({ user: req.user!._id });
    if (!wallet) {
      wallet = await Wallet.create({ user: req.user!._id });
    }

    // In production, this would integrate with PayGate
    // For now, directly add to balance
    wallet.balance += amount;
    wallet.transactions.push({
      type: "topup",
      amount,
      createdAt: new Date(),
    });
    await wallet.save();

    await Transaction.create({
      wallet: wallet._id,
      user: req.user!._id,
      type: "topup",
      amount,
      reference: `TOPUP-${Date.now()}`,
      status: "successful",
    });

    await AuditLog.create({
      action: "WALLET_TOPUP",
      user: req.user!._id,
      meta: { amount },
    });

    res.json({ message: "Wallet topped up successfully", balance: wallet.balance });
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

export default router;
