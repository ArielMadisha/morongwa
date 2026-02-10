// Admin routes for platform management
import express, { Response } from "express";
import User from "../data/models/User";
import Task from "../data/models/Task";
import Payment from "../data/models/Payment";
import Transaction from "../data/models/Transaction";
import AuditLog from "../data/models/AuditLog";
import { authenticate, AuthRequest, authorize } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { getPaginationParams } from "../utils/helpers";
import { sendNotification } from "../services/notification";

const router = express.Router();

// All routes require admin or superadmin role
router.use(authenticate, authorize("admin", "superadmin"));

// Get platform statistics
router.get("/stats", async (req: AuthRequest, res: Response, next) => {
  try {
    const [
      totalUsers,
      activeUsers,
      totalTasks,
      completedTasks,
      pendingPayments,
      totalRevenue,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ active: true }),
      Task.countDocuments(),
      Task.countDocuments({ status: "completed" }),
      Payment.countDocuments({ status: "pending" }),
      Transaction.aggregate([
        { $match: { type: "payment" } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]).then((res) => res[0]?.total || 0),
    ]);

    res.json({
      totalUsers,
      activeUsers,
      totalTasks,
      completedTasks,
      pendingPayments,
      totalRevenue,
    });
  } catch (err) {
    next(err);
  }
});

// Get all users with filters
router.get("/users", async (req: AuthRequest, res: Response, next) => {
  try {
    const { page, limit, role, active, suspended } = req.query;
    const { skip, limit: limitNum } = getPaginationParams(
      page ? parseInt(page as string) : undefined,
      limit ? parseInt(limit as string) : undefined
    );

    const query: any = {};
    if (role) query.role = role;
    if (active !== undefined) query.active = active === "true";
    if (suspended !== undefined) query.suspended = suspended === "true";

    const [users, total] = await Promise.all([
      User.find(query).select("-passwordHash").sort({ createdAt: -1 }).skip(skip).limit(limitNum),
      User.countDocuments(query),
    ]);

    res.json({
      users,
      pagination: {
        total,
        page: Math.floor(skip / limitNum) + 1,
        limit: limitNum,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) {
    next(err);
  }
});

// Suspend/unsuspend user
router.post("/users/:id/suspend", async (req: AuthRequest, res: Response, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) throw new AppError("User not found", 404);

    user.suspended = !user.suspended;
    user.suspendedAt = user.suspended ? new Date() : undefined;
    await user.save();

    await AuditLog.create({
      action: user.suspended ? "USER_SUSPENDED" : "USER_UNSUSPENDED",
      user: req.user!._id,
      target: user._id,
      meta: { reason: req.body.reason },
    });

    if (user.suspended) {
      await sendNotification({
        userId: user._id.toString(),
        type: "ACCOUNT_SUSPENDED",
        message: "Your account has been suspended",
        channel: "email",
        email: {
          subject: "Account Suspended",
          html: `<p>Your account has been suspended. ${req.body.reason || ""}</p>`,
        },
      });
    }

    res.json({
      message: user.suspended ? "User suspended" : "User unsuspended",
      user,
    });
  } catch (err) {
    next(err);
  }
});

// Admin: Verify a runner's vehicle document
router.post('/users/:id/vehicles/:index/verify', async (req: AuthRequest, res: Response, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) throw new AppError('User not found', 404);

    const idx = parseInt(req.params.index as any, 10);
    if (isNaN(idx) || !(user.vehicles && user.vehicles[idx])) {
      throw new AppError('Vehicle not found', 404);
    }

    user.vehicles[idx].verified = true as any;
    await user.save();

    // If all vehicles and PDP are verified, mark runnerVerified
    const allVehiclesVerified = (user.vehicles || []).length > 0 && (user.vehicles || []).every((v: any) => v.verified === true);
    const pdpVerified = !!(user.pdp && (user.pdp as any).verified === true);
    if (allVehiclesVerified && pdpVerified) {
      user.runnerVerified = true as any;
      await user.save();
    }

    await AuditLog.create({ action: 'VEHICLE_VERIFIED', user: req.user!._id, target: user._id, meta: { vehicleIndex: idx } });

    await sendNotification({
      userId: user._id.toString(),
      type: 'VEHICLE_VERIFIED',
      message: 'Your vehicle documents have been verified by admin',
      channel: 'email',
      email: { subject: 'Vehicle Verified', html: '<p>Your vehicle documents were verified.</p>' },
    });

    res.json({ message: 'Vehicle verified', user });
  } catch (err) {
    next(err);
  }
});

// Admin: Verify runner PDP
router.post('/users/:id/pdp/verify', async (req: AuthRequest, res: Response, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) throw new AppError('User not found', 404);

    if (!user.pdp) throw new AppError('PDP not found', 404);

    (user.pdp as any).verified = true;
    await user.save();

    const allVehiclesVerified = (user.vehicles || []).length > 0 && (user.vehicles || []).every((v: any) => v.verified === true);
    const pdpVerified = !!(user.pdp && (user.pdp as any).verified === true);
    if (allVehiclesVerified && pdpVerified) {
      user.runnerVerified = true as any;
      await user.save();
    }

    await AuditLog.create({ action: 'PDP_VERIFIED', user: req.user!._id, target: user._id, meta: {} });

    await sendNotification({
      userId: user._id.toString(),
      type: 'PDP_VERIFIED',
      message: 'Your Professional Driving Permit (PDP) has been verified',
      channel: 'email',
      email: { subject: 'PDP Verified', html: '<p>Your PDP was verified by admin.</p>' },
    });

    res.json({ message: 'PDP verified', user });
  } catch (err) {
    next(err);
  }
});

// Get all tasks with filters
router.get("/tasks", async (req: AuthRequest, res: Response, next) => {
  try {
    const { page, limit, status } = req.query;
    const { skip, limit: limitNum } = getPaginationParams(
      page ? parseInt(page as string) : undefined,
      limit ? parseInt(limit as string) : undefined
    );

    const query: any = {};
    if (status) query.status = status;

    const [tasks, total] = await Promise.all([
      Task.find(query)
        .populate("client", "name email")
        .populate("runner", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      Task.countDocuments(query),
    ]);

    res.json({
      tasks,
      pagination: {
        total,
        page: Math.floor(skip / limitNum) + 1,
        limit: limitNum,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) {
    next(err);
  }
});

// Cancel task (admin override)
router.post("/tasks/:id/cancel", async (req: AuthRequest, res: Response, next) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) throw new AppError("Task not found", 404);

    task.status = "cancelled";
    task.cancelledAt = new Date();
    await task.save();

    await AuditLog.create({
      action: "TASK_CANCELLED_BY_ADMIN",
      user: req.user!._id,
      target: task._id,
      meta: { reason: req.body.reason },
    });

    res.json({ message: "Task cancelled successfully", task });
  } catch (err) {
    next(err);
  }
});

// Get pending payouts
router.get("/payouts/pending", async (req: AuthRequest, res: Response, next) => {
  try {
    const pendingPayouts = await Transaction.find({ type: "payout", status: "pending" })
      .populate("user", "name email")
      .sort({ createdAt: -1 });

    res.json({ payouts: pendingPayouts });
  } catch (err) {
    next(err);
  }
});

// Approve payout
router.post("/payouts/:id/approve", async (req: AuthRequest, res: Response, next) => {
  try {
    const transaction = await Transaction.findById(req.params.id);
    if (!transaction) throw new AppError("Transaction not found", 404);

    if (transaction.type !== "payout") {
      throw new AppError("Not a payout transaction", 400);
    }

    transaction.status = "successful";
    await transaction.save();

    await AuditLog.create({
      action: "PAYOUT_APPROVED",
      user: req.user!._id,
      meta: { transactionId: transaction._id, amount: transaction.amount },
    });

    await sendNotification({
      userId: transaction.user!.toString(),
      type: "PAYOUT_APPROVED",
      message: `Your payout of R${transaction.amount} has been approved`,
      channel: "email",
      email: {
        subject: "Payout Approved",
      },
    });

    res.json({ message: "Payout approved successfully", transaction });
  } catch (err) {
    next(err);
  }
});

export default router;
