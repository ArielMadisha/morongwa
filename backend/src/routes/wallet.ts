// Wallet management routes
import express, { Response } from "express";
import Wallet from "../data/models/Wallet";
import Transaction from "../data/models/Transaction";
import AuditLog from "../data/models/AuditLog";
import { authenticate, AuthRequest } from "../middleware/auth";
import { topupSchema, payoutSchema } from "../utils/validators";
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

    const transactions = wallet.transactions.slice(skip, skip + limitNum);

    // Return array directly for frontend compatibility
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

export default router;
