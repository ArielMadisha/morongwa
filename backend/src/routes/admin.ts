// Admin routes for platform management
import express, { Response } from "express";
import bcrypt from "bcryptjs";
import User from "../data/models/User";
import Task from "../data/models/Task";
import Payment from "../data/models/Payment";
import Transaction from "../data/models/Transaction";
import AuditLog from "../data/models/AuditLog";
import Escrow from "../data/models/Escrow";
import Supplier from "../data/models/Supplier";
import Order from "../data/models/Order";
import ResellerWall from "../data/models/ResellerWall";
import Store from "../data/models/Store";
import Product from "../data/models/Product";
import TVPost from "../data/models/TVPost";
import TVComment from "../data/models/TVComment";
import TVReport from "../data/models/TVReport";
import Advert from "../data/models/Advert";
import LandingBackground from "../data/models/LandingBackground";
import AdminPermission, { AdminSection } from "../data/models/AdminPermission";
import { authenticate, AuthRequest, authorize } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { getPaginationParams, slugify } from "../utils/helpers";
import { upload } from "../middleware/upload";
import { sendNotification } from "../services/notification";
import payoutService from "../services/payoutService";
import fnbService from "../services/fnbService";

const router = express.Router();

const isSuperAdmin = (req: AuthRequest) =>
  req.user?.role?.includes("superadmin") ?? false;

/** Require super-admin only */
const requireSuperAdmin = (_req: AuthRequest, res: Response, next: express.NextFunction) => {
  if (isSuperAdmin(_req)) return next();
  res.status(403).json({ error: "Super-admin only" });
};

/** Require super-admin OR admin with section permission */
const requireSection = (section: AdminSection) => {
  return async (req: AuthRequest, res: Response, next: express.NextFunction) => {
    if (isSuperAdmin(req)) return next();
    const perm = await AdminPermission.findOne({ userId: req.user!._id }).lean();
    if (perm?.sections?.includes(section)) return next();
    res.status(403).json({ error: "Insufficient permissions for this section" });
  };
};

// All routes require admin or superadmin role (role-based access control)
router.use(authenticate, authorize("admin", "superadmin"));

// Get platform statistics (dashboard)
router.get("/stats", async (req: AuthRequest, res: Response, next) => {
  try {
    const [
      totalUsers,
      activeUsers,
      totalTasks,
      completedTasks,
      pendingPayments,
      totalRevenue,
      escrowHeld,
      escrowReleased,
      escrowPendingPayout,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ active: true }),
      Task.countDocuments(),
      Task.countDocuments({ status: "completed" }),
      Payment.countDocuments({ status: "pending" }),
      Transaction.aggregate([
        { $match: { type: "payment" } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]).then((r) => (r[0]?.total ?? 0) as number),
      Escrow.countDocuments({ status: "held" }),
      Escrow.countDocuments({ status: "released" }),
      Escrow.countDocuments({ status: "released", fnbStatus: { $in: ["pending", "submitted", "processing"] } }),
    ]);

    const pendingPayoutAmount = await Escrow.aggregate([
      { $match: { status: "released", fnbStatus: { $in: ["pending", "submitted", "processing"] } } },
      { $group: { _id: null, total: { $sum: "$runnersNet" } } },
    ]).then((r) => (r[0]?.total ?? 0) as number);

    let fnbBalance: number | null = null;
    try {
      fnbBalance = await fnbService.getAccountBalance();
    } catch {
      // FNB not configured or unavailable
    }

    res.json({
      totalUsers,
      activeUsers,
      totalTasks,
      completedTasks,
      pendingPayments,
      totalRevenue,
      escrowHeld,
      escrowReleased,
      escrowPendingPayoutCount: escrowPendingPayout,
      pendingPayoutAmount,
      pendingPayouts: pendingPayoutAmount,
      fnbBalance,
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

// Activate user (unsuspend)
router.post("/users/:id/activate", async (req: AuthRequest, res: Response, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) throw new AppError("User not found", 404);
    user.suspended = false;
    user.suspendedAt = undefined;
    await user.save();
    await AuditLog.create({
      action: "USER_ACTIVATED",
      user: req.user!._id,
      target: user._id,
      meta: {},
    });
    res.json({ message: "User activated", user });
  } catch (err) {
    next(err);
  }
});

// Approve payout (legacy Transaction-based)
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
      email: { subject: "Payout Approved" },
    });
    res.json({ message: "Payout approved successfully", transaction });
  } catch (err) {
    next(err);
  }
});

// Reject payout (legacy)
router.post("/payouts/:id/reject", async (req: AuthRequest, res: Response, next) => {
  try {
    const transaction = await Transaction.findById(req.params.id);
    if (!transaction) throw new AppError("Transaction not found", 404);
    if (transaction.type !== "payout") throw new AppError("Not a payout transaction", 400);
    transaction.status = "failed";
    await transaction.save();
    await AuditLog.create({
      action: "PAYOUT_REJECTED",
      user: req.user!._id,
      meta: { transactionId: transaction._id, reason: req.body.reason },
    });
    res.json({ message: "Payout rejected", transaction });
  } catch (err) {
    next(err);
  }
});

// ——— Escrow: list, detail with ledger, release, refund, FNB payout ———

router.get("/escrows", async (req: AuthRequest, res: Response, next) => {
  try {
    const { page, limit, status } = req.query;
    const { skip, limit: limitNum } = getPaginationParams(
      page ? parseInt(page as string) : undefined,
      limit ? parseInt(limit as string) : undefined
    );
    const query: any = {};
    if (status) query.status = status as string;
    const [escrows, total] = await Promise.all([
      Escrow.find(query)
        .populate("task", "title status")
        .populate("client", "name email")
        .populate("runner", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      Escrow.countDocuments(query),
    ]);
    res.json({
      escrows,
      pagination: { total, page: Math.floor(skip / limitNum) + 1, limit: limitNum, pages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    next(err);
  }
});

router.get("/escrows/:id", async (req: AuthRequest, res: Response, next) => {
  try {
    const data = await payoutService.getEscrowDetails(req.params.id);
    res.json(data);
  } catch (err: any) {
    if (err.message?.includes("not found")) return next(new AppError(err.message, 404));
    next(err);
  }
});

router.post("/escrows/:id/release", async (req: AuthRequest, res: Response, next) => {
  try {
    const escrow = await payoutService.releaseEscrow(req.params.id, "manual_release");
    await AuditLog.create({
      action: "ESCROW_MANUAL_RELEASE",
      user: req.user!._id,
      target: escrow._id,
      meta: { escrowId: escrow._id, taskId: escrow.task, runnersNet: escrow.runnersNet },
    });
    res.json({ message: "Escrow released; payout can be initiated.", escrow });
  } catch (err: any) {
    if (err.message?.includes("not found")) return next(new AppError(err.message, 404));
    next(err);
  }
});

router.post("/escrows/:id/refund", async (req: AuthRequest, res: Response, next) => {
  try {
    const reason = (req.body.reason as string) || "Admin refund";
    const escrow = await payoutService.refundEscrow(req.params.id, reason);
    await AuditLog.create({
      action: "ESCROW_REFUND",
      user: req.user!._id,
      target: escrow._id,
      meta: { escrowId: escrow._id, reason },
    });
    res.json({ message: "Refund processed.", escrow });
  } catch (err: any) {
    if (err.message?.includes("not found")) return next(new AppError(err.message, 404));
    next(err);
  }
});

router.post("/escrows/:id/initiate-payout", async (req: AuthRequest, res: Response, next) => {
  try {
    const escrow = await payoutService.initiatePayout(req.params.id);
    await AuditLog.create({
      action: "FNB_PAYOUT_INITIATED",
      user: req.user!._id,
      target: escrow._id,
      meta: { escrowId: escrow._id, fnbInstructionId: escrow.fnbInstructionId, amount: escrow.runnersNet },
    });
    res.json({ message: "FNB payout initiated.", escrow });
  } catch (err: any) {
    if (err.message?.includes("not found")) return next(new AppError(err.message, 404));
    next(err);
  }
});

router.post("/escrows/:id/poll-payout", async (req: AuthRequest, res: Response, next) => {
  try {
    const escrow = await payoutService.pollPayoutStatus(req.params.id);
    res.json({ message: "Payout status updated.", escrow });
  } catch (err: any) {
    if (err.message?.includes("not found")) return next(new AppError(err.message, 404));
    next(err);
  }
});

// FNB balance
router.get("/fnb/balance", async (req: AuthRequest, res: Response, next) => {
  try {
    const balance = await fnbService.getAccountBalance();
    res.json({ balance });
  } catch (err: any) {
    res.status(502).json({ error: "FNB balance unavailable", detail: err.message });
  }
});

// Audit logs (paginated)
router.get("/audit", async (req: AuthRequest, res: Response, next) => {
  try {
    const { page, limit, action } = req.query;
    const { skip, limit: limitNum } = getPaginationParams(
      page ? parseInt(page as string) : undefined,
      limit ? parseInt(limit as string) : undefined
    );
    const query: any = {};
    if (action) query.action = action as string;
    const [logs, total] = await Promise.all([
      AuditLog.find(query).populate("user", "name email").populate("target").sort({ createdAt: -1 }).skip(skip).limit(limitNum),
      AuditLog.countDocuments(query),
    ]);
    res.json({
      logs,
      pagination: { total, page: Math.floor(skip / limitNum) + 1, limit: limitNum, pages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    next(err);
  }
});

// --- Marketplace / Suppliers / Orders / Reseller ---

// List suppliers (filter by status). Ensures admin-created supplier stores have an approved Supplier so they appear here.
router.get("/suppliers", async (req: AuthRequest, res: Response, next) => {
  try {
    const { page, limit, status } = req.query;
    // Backfill: any Store type=supplier without supplierId should have an approved Supplier (so dropdown shows them)
    const storesWithoutSupplier = await Store.find({ type: "supplier", $or: [{ supplierId: { $exists: false } }, { supplierId: null }] })
      .populate("userId", "name email")
      .lean();
    for (const store of storesWithoutSupplier) {
      const userId = (store.userId as any)?._id ?? store.userId;
      if (!userId) continue;
      let supplier = await Supplier.findOne({ userId, status: "approved" });
      if (!supplier) {
        const existing = await Supplier.findOne({ userId });
        if (existing) {
          existing.status = "approved";
          existing.storeName = existing.storeName || store.name;
          existing.reviewedAt = new Date();
          existing.reviewedBy = req.user!._id;
          existing.rejectionReason = undefined;
          await existing.save();
          supplier = existing;
        } else {
          supplier = await Supplier.create({
            userId,
            status: "approved",
            type: "individual",
            storeName: store.name,
            reviewedAt: new Date(),
            reviewedBy: req.user!._id,
          });
        }
      }
      await Store.updateOne({ _id: store._id }, { supplierId: supplier._id });
    }
    const { skip, limit: limitNum } = getPaginationParams(
      page ? parseInt(page as string) : undefined,
      limit ? parseInt(limit as string) : undefined
    );
    const query: any = {};
    if (status) query.status = status as string;
    const [suppliers, total] = await Promise.all([
      Supplier.find(query).populate("userId", "name email").sort({ appliedAt: -1 }).skip(skip).limit(limitNum).lean(),
      Supplier.countDocuments(query),
    ]);
    res.json({
      suppliers,
      pagination: { total, page: Math.floor(skip / limitNum) + 1, limit: limitNum, pages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    next(err);
  }
});

// Get single supplier (admin detail)
router.get("/suppliers/:id", async (req: AuthRequest, res: Response, next) => {
  try {
    const supplier = await Supplier.findById(req.params.id).populate("userId", "name email").populate("reviewedBy", "name email").lean();
    if (!supplier) throw new AppError("Supplier not found", 404);
    res.json({ data: supplier });
  } catch (err) {
    next(err);
  }
});

// Approve supplier – create supplier store when approved
router.post("/suppliers/:id/approve", async (req: AuthRequest, res: Response, next) => {
  try {
    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) throw new AppError("Supplier not found", 404);
    if (supplier.status !== "pending") throw new AppError("Supplier is not pending", 400);
    supplier.status = "approved";
    supplier.reviewedAt = new Date();
    supplier.reviewedBy = req.user!._id;
    supplier.rejectionReason = undefined;
    await supplier.save();

    // Create supplier store for this user if not exists
    let store = await Store.findOne({ userId: supplier.userId, type: "supplier" });
    if (!store) {
      const name = supplier.storeName || "My Store";
      let slug = slugify(name);
      let n = 1;
      while (await Store.findOne({ slug })) slug = `${slugify(name)}-${++n}`;
      store = await Store.create({
        userId: supplier.userId,
        name,
        slug,
        type: "supplier",
        supplierId: supplier._id,
        createdBy: req.user!._id,
      });
    }
    await AuditLog.create({
      action: "SUPPLIER_APPROVED",
      user: req.user!._id,
      target: supplier.userId,
      meta: { supplierId: supplier._id, storeId: store._id },
    });
    res.json({ message: "Supplier approved", data: supplier, store });
  } catch (err) {
    next(err);
  }
});

// Update supplier (e.g. shipping cost)
router.put("/suppliers/:id", async (req: AuthRequest, res: Response, next) => {
  try {
    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) throw new AppError("Supplier not found", 404);
    const body = req.body as Record<string, unknown>;
    if (body.shippingCost !== undefined) {
      const val = Number(body.shippingCost);
      (supplier as any).shippingCost = val >= 0 ? val : undefined;
    }
    if (body.pickupAddress !== undefined) (supplier as any).pickupAddress = body.pickupAddress;
    await supplier.save();
    res.json({ message: "Supplier updated", data: supplier });
  } catch (err) {
    next(err);
  }
});

// Reject supplier
router.post("/suppliers/:id/reject", async (req: AuthRequest, res: Response, next) => {
  try {
    const { reason } = req.body;
    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) throw new AppError("Supplier not found", 404);
    if (supplier.status !== "pending") throw new AppError("Supplier is not pending", 400);
    supplier.status = "rejected";
    supplier.reviewedAt = new Date();
    supplier.reviewedBy = req.user!._id;
    supplier.rejectionReason = reason || "";
    await supplier.save();
    await AuditLog.create({
      action: "SUPPLIER_REJECTED",
      user: req.user!._id,
      target: supplier.userId,
      meta: { supplierId: supplier._id, reason: reason || "" },
    });
    res.json({ message: "Supplier rejected", data: supplier });
  } catch (err) {
    next(err);
  }
});

// List marketplace orders (checkout orders)
router.get("/orders", async (req: AuthRequest, res: Response, next) => {
  try {
    const { page, limit, status } = req.query;
    const { skip, limit: limitNum } = getPaginationParams(
      page ? parseInt(page as string) : undefined,
      limit ? parseInt(limit as string) : undefined
    );
    const query: any = {};
    if (status) query.status = status as string;
    const [orders, total] = await Promise.all([
      Order.find(query).populate("buyerId", "name email").populate("supplierId").sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
      Order.countDocuments(query),
    ]);
    res.json({
      orders,
      pagination: { total, page: Math.floor(skip / limitNum) + 1, limit: limitNum, pages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    next(err);
  }
});

// Reseller stats (counts for admin)
router.get("/reseller-stats", async (req: AuthRequest, res: Response, next) => {
  try {
    const totalWalls = await ResellerWall.countDocuments();
    const wallsWithProducts = await ResellerWall.countDocuments({ "products.0": { $exists: true } });
    const totalProductsOnWalls = await ResellerWall.aggregate([
      { $project: { count: { $size: "$products" } } },
      { $group: { _id: null, total: { $sum: "$count" } } },
    ]).then((r) => (r[0]?.total ?? 0) as number);
    res.json({
      totalWalls,
      wallsWithProducts,
      totalProductsOnWalls,
    });
  } catch (err) {
    next(err);
  }
});

// ——— Stores (admin) ———

router.get("/stores", async (req: AuthRequest, res: Response, next) => {
  try {
    const { page, limit, type } = req.query;
    const { skip, limit: limitNum } = getPaginationParams(
      page ? parseInt(page as string) : undefined,
      limit ? parseInt(limit as string) : undefined
    );
    const query: any = {};
    if (type) query.type = type as string;
    const [stores, total] = await Promise.all([
      Store.find(query).populate("userId", "name email").populate("supplierId", "storeName status").sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
      Store.countDocuments(query),
    ]);
    res.json({
      stores,
      pagination: { total, page: Math.floor(skip / limitNum) + 1, limit: limitNum, pages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    next(err);
  }
});

router.post("/stores", async (req: AuthRequest, res: Response, next) => {
  try {
    const { userId, name, type } = req.body as { userId: string; name: string; type: "supplier" | "reseller" };
    if (!userId || !name || !type || !["supplier", "reseller"].includes(type)) {
      throw new AppError("userId, name, and type (supplier|reseller) are required", 400);
    }
    let slug = slugify(name.trim());
    let n = 1;
    while (await Store.findOne({ slug })) slug = `${slugify(name.trim())}-${++n}`;
    const storeData: any = { userId, name: name.trim(), slug, type, createdBy: req.user!._id };
    if (type === "supplier") {
      let supplier = await Supplier.findOne({ userId, status: "approved" });
      if (!supplier) {
        // Admin-created supplier store: ensure user has an approved Supplier so they appear in product dropdown
        const existing = await Supplier.findOne({ userId });
        if (existing) {
          existing.status = "approved";
          existing.storeName = existing.storeName || name.trim();
          existing.reviewedAt = new Date();
          existing.reviewedBy = req.user!._id;
          existing.rejectionReason = undefined;
          await existing.save();
          supplier = existing;
        } else {
          supplier = await Supplier.create({
            userId,
            status: "approved",
            type: "individual",
            storeName: name.trim(),
            reviewedAt: new Date(),
            reviewedBy: req.user!._id,
          });
        }
      }
      storeData.supplierId = supplier._id;
    }
    const store = await Store.create(storeData);
    await AuditLog.create({ action: "STORE_CREATED_BY_ADMIN", user: req.user!._id, target: store._id, meta: { userId, type } });
    res.status(201).json({ message: "Store created", data: store });
  } catch (err) {
    next(err);
  }
});

router.get("/stores/:id", async (req: AuthRequest, res: Response, next) => {
  try {
    const store = await Store.findById(req.params.id).populate("userId", "name email").populate("supplierId", "storeName status").populate("createdBy", "name").lean();
    if (!store) throw new AppError("Store not found", 404);
    res.json({ data: store });
  } catch (err) {
    next(err);
  }
});

router.put("/stores/:id", async (req: AuthRequest, res: Response, next) => {
  try {
    const { name } = req.body as { name?: string };
    const store = await Store.findById(req.params.id);
    if (!store) throw new AppError("Store not found", 404);
    if (name != null && typeof name === "string" && name.trim()) {
      let slug = slugify(name.trim());
      let n = 1;
      while (await Store.findOne({ slug, _id: { $ne: store._id } })) slug = `${slugify(name.trim())}-${++n}`;
      store.name = name.trim();
      store.slug = slug;
      await store.save();
    }
    res.json({ message: "Store updated", data: store });
  } catch (err) {
    next(err);
  }
});

// ——— Products (admin: load products for marketplace) ———

router.post(
  "/products/upload-images",
  upload.array("images", 5),
  async (req: AuthRequest, res: Response, next) => {
    try {
      const files = (req as any).files as Express.Multer.File[] | undefined;
      if (!files?.length) throw new AppError("At least one image is required (max 5).", 400);
      if (files.length > 5) throw new AppError("Maximum 5 images allowed.", 400);
      const nonImage = files.find((f) => !f.mimetype?.startsWith("image/"));
      if (nonImage) throw new AppError("All files must be images (e.g. JPEG, PNG, GIF, WebP).", 400);
      const baseRaw = process.env.API_URL || `${req.protocol}://${req.get("host")}`;
      const base = baseRaw.replace(/\/api\/?$/, "").replace(/\/$/, "");
      const urls = files.map((f) => `${base}/uploads/${f.filename}`);
      res.status(201).json({ urls });
    } catch (err) {
      next(err);
    }
  }
);

router.get("/products", async (req: AuthRequest, res: Response, next) => {
  try {
    const { page, limit, supplierId, active } = req.query;
    const { skip, limit: limitNum } = getPaginationParams(
      page ? parseInt(page as string) : undefined,
      limit ? parseInt(limit as string) : undefined
    );
    const query: any = {};
    if (supplierId) query.supplierId = supplierId;
    if (active !== undefined) query.active = active === "true";
    const [products, total] = await Promise.all([
      Product.find(query).populate("supplierId", "storeName status").sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
      Product.countDocuments(query),
    ]);
    res.json({
      products,
      pagination: { total, page: Math.floor(skip / limitNum) + 1, limit: limitNum, pages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    next(err);
  }
});

router.post("/products", async (req: AuthRequest, res: Response, next) => {
  try {
    const body = req.body as {
      supplierId: string;
      title: string;
      slug?: string;
      description?: string;
      images?: string[];
      price: number;
      discountPrice?: number;
      currency?: string;
      stock?: number;
      outOfStock?: boolean;
      sku?: string;
      sizes?: string[];
      allowResell?: boolean;
      categories?: string[];
      tags?: string[];
    };
    const { supplierId, title, price } = body;
    if (!supplierId || !title || price == null) throw new AppError("supplierId, title, and price are required", 400);
    const images = Array.isArray(body.images) ? body.images : [];
    if (images.length < 1) throw new AppError("At least one product image is required (max 5).", 400);
    if (images.length > 5) throw new AppError("Maximum 5 product images allowed.", 400);
    const supplier = await Supplier.findById(supplierId);
    if (!supplier || supplier.status !== "approved") throw new AppError("Supplier not found or not approved", 400);
    let slug = (body.slug && body.slug.trim()) || slugify(title);
    let n = 1;
    while (await Product.findOne({ slug })) slug = `${slugify(title)}-${++n}`;
    const discountPrice = body.discountPrice != null ? Number(body.discountPrice) : undefined;
    const product = await Product.create({
      supplierId,
      title: title.trim(),
      slug,
      description: body.description?.trim(),
      images,
      price: Number(price),
      ...(discountPrice != null && discountPrice >= 0 && discountPrice < Number(price) && { discountPrice }),
      currency: body.currency || "ZAR",
      stock: body.stock != null ? Number(body.stock) : 0,
      outOfStock: body.outOfStock != null ? !!body.outOfStock : false,
      sku: body.sku?.trim(),
      sizes: Array.isArray(body.sizes) ? body.sizes : [],
      allowResell: body.allowResell != null ? !!body.allowResell : true,
      categories: Array.isArray(body.categories) ? body.categories : [],
      tags: Array.isArray(body.tags) ? body.tags : [],
      active: true,
    });
    await AuditLog.create({ action: "PRODUCT_CREATED_BY_ADMIN", user: req.user!._id, target: product._id, meta: { supplierId } });
    res.status(201).json({ message: "Product created", data: product });
  } catch (err) {
    next(err);
  }
});

router.get("/products/:id", async (req: AuthRequest, res: Response, next) => {
  try {
    const product = await Product.findById(req.params.id).populate("supplierId", "storeName status").lean();
    if (!product) throw new AppError("Product not found", 404);
    res.json({ data: product });
  } catch (err) {
    next(err);
  }
});

router.put("/products/:id", async (req: AuthRequest, res: Response, next) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) throw new AppError("Product not found", 404);
    const body = req.body as Record<string, unknown>;
    const allowed = ["title", "description", "images", "price", "discountPrice", "currency", "stock", "outOfStock", "sku", "sizes", "allowResell", "categories", "tags", "active"];
    for (const key of allowed) {
      if (body[key] !== undefined) {
        if (key === "discountPrice") {
          const val = body[key];
          if (val === null || val === "") {
            (product as any).discountPrice = undefined;
          } else {
            const num = Number(val);
            const price = product.price ?? 0;
            if (num >= 0 && num < price) (product as any).discountPrice = num;
          }
        } else {
          (product as any)[key] = key === "active" ? !!body[key] : key === "images" && Array.isArray(body[key]) ? body[key] : body[key];
        }
      }
    }
    if (body.title && typeof body.title === "string") {
      let slug = slugify(body.title);
      let n = 1;
      while (await Product.findOne({ slug, _id: { $ne: product._id } })) slug = `${slugify(body.title)}-${++n}`;
      product.slug = slug;
    }
    await product.save();
    res.json({ message: "Product updated", data: product });
  } catch (err) {
    next(err);
  }
});

router.delete("/products/:id", async (req: AuthRequest, res: Response, next) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) throw new AppError("Product not found", 404);
    await product.deleteOne();
    await AuditLog.create({ action: "PRODUCT_DELETED_BY_ADMIN", user: req.user!._id, target: product._id, meta: {} });
    res.json({ message: "Product deleted" });
  } catch (err) {
    next(err);
  }
});

// ——— Adverts (admin: create/manage platform adverts) ———

router.get("/adverts", async (req: AuthRequest, res: Response, next) => {
  try {
    const { slot } = req.query;
    const query: any = {};
    if (slot && (slot === "random" || slot === "promo")) query.slot = slot;
    const adverts = await Advert.find(query).sort({ order: 1, createdAt: -1 }).lean();
    res.json({ data: adverts });
  } catch (err) {
    next(err);
  }
});

router.post("/adverts", async (req: AuthRequest, res: Response, next) => {
  try {
    const { title, imageUrl, linkUrl, slot, productId, active, startDate, endDate, order } = req.body;
    if (!title?.trim() || !imageUrl?.trim() || !slot) {
      throw new AppError("title, imageUrl, and slot (random|promo) are required", 400);
    }
    if (slot !== "random" && slot !== "promo") throw new AppError("slot must be 'random' or 'promo'", 400);
    const advert = await Advert.create({
      title: title.trim(),
      imageUrl: imageUrl.trim(),
      linkUrl: linkUrl?.trim() || undefined,
      slot,
      productId: productId || undefined,
      active: active !== false,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      order: order != null ? Number(order) : 0,
    });
    await AuditLog.create({ action: "ADVERT_CREATED", user: req.user!._id, target: advert._id, meta: { slot } });
    res.status(201).json({ message: "Advert created", data: advert });
  } catch (err) {
    next(err);
  }
});

router.put("/adverts/:id", async (req: AuthRequest, res: Response, next) => {
  try {
    const advert = await Advert.findById(req.params.id);
    if (!advert) throw new AppError("Advert not found", 404);
    const { title, imageUrl, linkUrl, slot, productId, active, startDate, endDate, order } = req.body;
    if (title !== undefined) advert.title = title.trim();
    if (imageUrl !== undefined) advert.imageUrl = imageUrl.trim();
    if (linkUrl !== undefined) advert.linkUrl = linkUrl?.trim() || undefined;
    if (slot === "random" || slot === "promo") advert.slot = slot;
    if (productId !== undefined) advert.productId = productId || undefined;
    if (active !== undefined) advert.active = !!active;
    if (startDate !== undefined) advert.startDate = startDate ? new Date(startDate) : undefined;
    if (endDate !== undefined) advert.endDate = endDate ? new Date(endDate) : undefined;
    if (order !== undefined) advert.order = Number(order);
    await advert.save();
    await AuditLog.create({ action: "ADVERT_UPDATED", user: req.user!._id, target: advert._id, meta: {} });
    res.json({ message: "Advert updated", data: advert });
  } catch (err) {
    next(err);
  }
});

router.delete("/adverts/:id", async (req: AuthRequest, res: Response, next) => {
  try {
    const advert = await Advert.findById(req.params.id);
    if (!advert) throw new AppError("Advert not found", 404);
    await advert.deleteOne();
    await AuditLog.create({ action: "ADVERT_DELETED", user: req.user!._id, target: advert._id, meta: {} });
    res.json({ message: "Advert deleted" });
  } catch (err) {
    next(err);
  }
});

// ——— Landing backgrounds (admin: upload backgrounds for login/register pages) ———

router.get("/landing-backgrounds", async (req: AuthRequest, res: Response, next) => {
  try {
    const items = await LandingBackground.find().sort({ order: 1 }).lean();
    res.json({ data: items });
  } catch (err) {
    next(err);
  }
});

router.post("/landing-backgrounds/upload", upload.single("image"), async (req: AuthRequest, res: Response, next) => {
  try {
    if (!req.file) throw new AppError("No file uploaded", 400);
    const url = `/uploads/${req.file.filename}`;
    res.json({ url });
  } catch (err) {
    next(err);
  }
});

router.post("/landing-backgrounds", async (req: AuthRequest, res: Response, next) => {
  try {
    const { imageUrl, order } = req.body;
    if (!imageUrl?.trim()) throw new AppError("imageUrl is required", 400);
    const bg = await LandingBackground.create({
      imageUrl: imageUrl.trim(),
      order: order != null ? Number(order) : 0,
      active: true,
    });
    await AuditLog.create({ action: "LANDING_BG_CREATED", user: req.user!._id, target: bg._id, meta: {} });
    res.status(201).json({ message: "Background added", data: bg });
  } catch (err) {
    next(err);
  }
});

router.put("/landing-backgrounds/:id", async (req: AuthRequest, res: Response, next) => {
  try {
    const bg = await LandingBackground.findById(req.params.id);
    if (!bg) throw new AppError("Background not found", 404);
    const { imageUrl, order, active } = req.body;
    if (imageUrl !== undefined) bg.imageUrl = imageUrl.trim();
    if (order !== undefined) bg.order = Number(order);
    if (active !== undefined) bg.active = !!active;
    await bg.save();
    await AuditLog.create({ action: "LANDING_BG_UPDATED", user: req.user!._id, target: bg._id, meta: {} });
    res.json({ message: "Background updated", data: bg });
  } catch (err) {
    next(err);
  }
});

router.delete("/landing-backgrounds/:id", async (req: AuthRequest, res: Response, next) => {
  try {
    const bg = await LandingBackground.findById(req.params.id);
    if (!bg) throw new AppError("Background not found", 404);
    await bg.deleteOne();
    await AuditLog.create({ action: "LANDING_BG_DELETED", user: req.user!._id, target: bg._id, meta: {} });
    res.json({ message: "Background deleted" });
  } catch (err) {
    next(err);
  }
});

// ————— Super-admin only: create admins with section permissions —————
router.post("/admins", requireSuperAdmin, async (req: AuthRequest, res: Response, next) => {
  try {
    const { email, name, password, sections } = req.body;
    if (!email?.trim() || !name?.trim() || !password?.trim()) {
      throw new AppError("email, name, and password required", 400);
    }
    const existing = await User.findOne({ email: email.trim().toLowerCase() });
    if (existing) throw new AppError("User with this email already exists", 400);

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      email: email.trim().toLowerCase(),
      name: name.trim(),
      passwordHash,
      role: ["admin"],
    });

    const validSections: AdminSection[] = (sections || []).filter((s: string) =>
      ["tv_posts", "tv_comments", "tv_reports", "products", "suppliers", "users", "orders", "tasks", "support", "policies"].includes(s)
    );
    await AdminPermission.create({
      userId: user._id,
      sections: validSections,
      createdBy: req.user!._id,
    });

    await AuditLog.create({
      action: "ADMIN_CREATED",
      user: req.user!._id,
      target: user._id,
      meta: { email: user.email, sections: validSections },
    });

    res.status(201).json({
      data: {
        _id: user._id,
        email: user.email,
        name: user.name,
        sections: validSections,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ————— Morongwa-TV admin moderation —————
router.get("/tv/posts", requireSection("tv_posts"), async (req: AuthRequest, res: Response, next) => {
  try {
    const { page, limit, status } = req.query;
    const { skip, limit: limitNum } = getPaginationParams(
      page ? parseInt(page as string) : undefined,
      limit ? parseInt(limit as string) : undefined
    );
    const query: any = {};
    if (status) query.status = status;

    const [posts, total] = await Promise.all([
      TVPost.find(query)
        .populate("creatorId", "name avatar email")
        .populate("productId", "title price")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      TVPost.countDocuments(query),
    ]);

    res.json({
      data: posts,
      pagination: { total, page: Math.floor(skip / limitNum) + 1, limit: limitNum, pages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    next(err);
  }
});

router.post("/tv/posts/:id/approve", requireSection("tv_posts"), async (req: AuthRequest, res: Response, next) => {
  try {
    const post = await TVPost.findByIdAndUpdate(req.params.id, { status: "approved" }, { new: true });
    if (!post) throw new AppError("Post not found", 404);
    await AuditLog.create({ action: "TV_POST_APPROVED", user: req.user!._id, target: post._id, meta: {} });
    res.json({ data: post });
  } catch (err) {
    next(err);
  }
});

router.post("/tv/posts/:id/reject", requireSection("tv_posts"), async (req: AuthRequest, res: Response, next) => {
  try {
    const { reason } = req.body;
    const post = await TVPost.findByIdAndUpdate(req.params.id, { status: "rejected" }, { new: true });
    if (!post) throw new AppError("Post not found", 404);
    await AuditLog.create({ action: "TV_POST_REJECTED", user: req.user!._id, target: post._id, meta: { reason } });
    res.json({ data: post });
  } catch (err) {
    next(err);
  }
});

router.get("/tv/reports", requireSection("tv_reports"), async (req: AuthRequest, res: Response, next) => {
  try {
    const { page, limit } = req.query;
    const { skip, limit: limitNum } = getPaginationParams(
      page ? parseInt(page as string) : undefined,
      limit ? parseInt(limit as string) : undefined
    );

    const [reports, total] = await Promise.all([
      TVReport.find({ targetType: "post" })
        .populate("reporterId", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      TVReport.countDocuments({ targetType: "post" }),
    ]);

    res.json({
      data: reports,
      pagination: { total, page: Math.floor(skip / limitNum) + 1, limit: limitNum, pages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    next(err);
  }
});

router.post("/tv/reports/:id/resolve", requireSection("tv_reports"), async (req: AuthRequest, res: Response, next) => {
  try {
    const report = await TVReport.findByIdAndUpdate(
      req.params.id,
      { status: "reviewed", reviewedBy: req.user!._id, reviewedAt: new Date() },
      { new: true }
    );
    if (!report) throw new AppError("Report not found", 404);
    await AuditLog.create({ action: "TV_REPORT_RESOLVED", user: req.user!._id, target: report._id, meta: {} });
    res.json({ data: report });
  } catch (err) {
    next(err);
  }
});

// List admin permissions (super-admin only)
router.get("/admins", requireSuperAdmin, async (req: AuthRequest, res: Response, next) => {
  try {
    const perms = await AdminPermission.find()
      .populate("userId", "name email")
      .populate("createdBy", "name")
      .sort({ createdAt: -1 })
      .lean();
    res.json({ data: perms });
  } catch (err) {
    next(err);
  }
});

export default router;
