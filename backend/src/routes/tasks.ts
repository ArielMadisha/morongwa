// Task management routes
import express, { Response } from "express";
import Task from "../data/models/Task";
import Wallet from "../data/models/Wallet";
import AuditLog from "../data/models/AuditLog";
import { authenticate, AuthRequest, authorize } from "../middleware/auth";
import { upload } from "../middleware/upload";
import { taskSchema } from "../utils/validators";
import { AppError } from "../middleware/errorHandler";
import { getPaginationParams } from "../utils/helpers";
import { sendNotification } from "../services/notification";
import { findMatchingRunners } from "../services/matching";

const router = express.Router();

// Create a new task
router.post(
  "/",
  authenticate,
  authorize("client"),
  upload.array("attachments", 5),
  async (req: AuthRequest, res: Response, next) => {
    try {
      const { error } = taskSchema.validate(req.body);
      if (error) throw new AppError(error.details[0].message, 400);

      const { title, description, budget, location } = req.body;

      const attachments = (req.files as Express.Multer.File[])?.map((file) => ({
        filename: file.filename,
        path: file.path,
        mimetype: file.mimetype,
        size: file.size,
        uploadedAt: new Date(),
      }));

      const task = await Task.create({
        title,
        description,
        budget,
        location: JSON.parse(location),
        client: req.user!._id,
        attachments: attachments || [],
      });

      await AuditLog.create({
        action: "TASK_CREATED",
        user: req.user!._id,
        target: task._id,
        meta: { title, budget },
      });

      // Notify matching runners
      const matches = await findMatchingRunners(task._id.toString());
      for (const match of matches.slice(0, 5)) {
        await sendNotification({
          userId: match.runnerId,
          type: "NEW_TASK",
          message: `New task available: ${title}`,
        });
      }

      res.status(201).json({ message: "Task created successfully", task });
    } catch (err) {
      next(err);
    }
  }
);

// Get all tasks (with filters and pagination)
router.get("/", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const { page, limit, status, client, runner } = req.query;
    const { skip, limit: limitNum } = getPaginationParams(
      page ? parseInt(page as string) : undefined,
      limit ? parseInt(limit as string) : undefined
    );

    const query: any = {};
    if (status) query.status = status;
    if (client) query.client = client;
    if (runner) query.runner = runner;

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

// Get task by ID
router.get("/:id", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const task = await Task.findById(req.params.id)
      .populate("client", "name email avatar")
      .populate("runner", "name email avatar");

    if (!task) throw new AppError("Task not found", 404);

    res.json({ task });
  } catch (err) {
    next(err);
  }
});

// Accept a task (runner)
router.post(
  "/:id/accept",
  authenticate,
  authorize("runner"),
  async (req: AuthRequest, res: Response, next) => {
    try {
      const task = await Task.findById(req.params.id);
      if (!task) throw new AppError("Task not found", 404);

      if (task.status !== "posted") {
        throw new AppError("Task is not available", 400);
      }

      // Check client wallet has enough balance
      const clientWallet = await Wallet.findOne({ user: task.client });
      if (!clientWallet || clientWallet.balance < task.budget) {
        throw new AppError("Insufficient funds in client wallet", 400);
      }

      // Escrow the funds
      clientWallet.balance -= task.budget;
      clientWallet.transactions.push({
        type: "escrow",
        amount: -task.budget,
        reference: task._id.toString(),
        createdAt: new Date(),
      });
      await clientWallet.save();

      task.status = "accepted";
      task.runner = req.user!._id;
      task.escrowed = true;
      task.acceptedAt = new Date();
      await task.save();

      await AuditLog.create({
        action: "TASK_ACCEPTED",
        user: req.user!._id,
        target: task._id,
        meta: { taskId: task._id, budget: task.budget },
      });

      await sendNotification({
        userId: task.client.toString(),
        type: "TASK_ACCEPTED",
        message: `Your task "${task.title}" has been accepted`,
        channel: "email",
        email: {
          subject: "Task Accepted",
          html: `<p>Your task "<strong>${task.title}</strong>" has been accepted by a runner.</p>`,
        },
      });

      res.json({ message: "Task accepted successfully", task });
    } catch (err) {
      next(err);
    }
  }
);

// Complete a task (runner)
router.post(
  "/:id/complete",
  authenticate,
  authorize("runner"),
  async (req: AuthRequest, res: Response, next) => {
    try {
      const task = await Task.findById(req.params.id);
      if (!task) throw new AppError("Task not found", 404);

      if (task.runner?.toString() !== req.user!._id.toString()) {
        throw new AppError("Unauthorized", 403);
      }

      if (task.status !== "accepted") {
        throw new AppError("Task is not in accepted state", 400);
      }

      // Release escrow to runner
      const runnerWallet = await Wallet.findOne({ user: req.user!._id });
      if (!runnerWallet) throw new AppError("Wallet not found", 404);

      runnerWallet.balance += task.budget;
      runnerWallet.transactions.push({
        type: "credit",
        amount: task.budget,
        reference: task._id.toString(),
        createdAt: new Date(),
      });
      await runnerWallet.save();

      task.status = "completed";
      task.completedAt = new Date();
      await task.save();

      await AuditLog.create({
        action: "TASK_COMPLETED",
        user: req.user!._id,
        target: task._id,
        meta: { taskId: task._id, budget: task.budget },
      });

      await sendNotification({
        userId: task.client.toString(),
        type: "TASK_COMPLETED",
        message: `Task "${task.title}" has been completed`,
        channel: "email",
        email: {
          subject: "Task Completed",
          html: `<p>Task "<strong>${task.title}</strong>" has been completed. Please leave a review!</p>`,
        },
      });

      res.json({ message: "Task completed successfully", task });
    } catch (err) {
      next(err);
    }
  }
);

// Cancel a task
router.post("/:id/cancel", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) throw new AppError("Task not found", 404);

    if (
      task.client.toString() !== req.user!._id.toString() &&
      task.runner?.toString() !== req.user!._id.toString()
    ) {
      throw new AppError("Unauthorized", 403);
    }

    // Refund escrow if task was accepted
    if (task.escrowed && task.status === "accepted") {
      const clientWallet = await Wallet.findOne({ user: task.client });
      if (clientWallet) {
        clientWallet.balance += task.budget;
        clientWallet.transactions.push({
          type: "refund",
          amount: task.budget,
          reference: task._id.toString(),
          createdAt: new Date(),
        });
        await clientWallet.save();
      }
    }

    task.status = "cancelled";
    task.cancelledAt = new Date();
    await task.save();

    await AuditLog.create({
      action: "TASK_CANCELLED",
      user: req.user!._id,
      target: task._id,
      meta: { taskId: task._id },
    });

    res.json({ message: "Task cancelled successfully", task });
  } catch (err) {
    next(err);
  }
});

export default router;
