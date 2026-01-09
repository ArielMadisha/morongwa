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

      // Handle location - accept both string and GeoJSON object
      let locationData;
      if (typeof location === 'string') {
        try {
          locationData = JSON.parse(location);
        } catch {
          // If it's just a plain string address, create a simple object
          locationData = {
            type: "Point",
            coordinates: [0, 0], // Default coordinates
            address: location
          };
        }
      } else {
        locationData = location;
      }

      const task = await Task.create({
        title,
        description,
        budget,
        location: locationData,
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

// Get available tasks (for runners)
router.get("/available", authenticate, authorize("runner"), async (req: AuthRequest, res: Response, next) => {
  try {
    const tasks = await Task.find({ status: "posted" })
      .populate("client", "name email")
      .sort({ createdAt: -1 });
    res.json(tasks);
  } catch (err) {
    next(err);
  }
});

// Get my tasks (tasks created by current user if client, or assigned to them if runner)
router.get("/my-tasks", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const isClient = Array.isArray(req.user!.role) ? req.user!.role.includes('client') : req.user!.role === 'client';
    const query = isClient
      ? { client: req.user!._id }
      : { runner: req.user!._id };
    
    const tasks = await Task.find(query)
      .populate("client", "name email")
      .populate("runner", "name email")
      .sort({ createdAt: -1 });
    res.json(tasks);
  } catch (err) {
    next(err);
  }
});

// Get my accepted tasks (for runners)
router.get("/my-accepted", authenticate, authorize("runner"), async (req: AuthRequest, res: Response, next) => {
  try {
    const tasks = await Task.find({ 
      runner: req.user!._id,
      status: { $in: ["accepted", "in_progress"] }
    })
      .populate("client", "name email")
      .sort({ createdAt: -1 });
    res.json(tasks);
  } catch (err) {
    next(err);
  }
});

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

      // Ensure runner has no active or unclosed completed tasks
      const activeTask = await Task.findOne({ runner: req.user!._id, status: { $in: ["accepted", "in_progress"] } });
      if (activeTask) {
        throw new AppError("You have an active task. Close it before accepting a new one.", 400);
      }

      const unclosed = await Task.findOne({ runner: req.user!._id, status: "completed", closedAtDestination: { $ne: true } });
      if (unclosed) {
        throw new AppError("Please confirm delivery at the destination for your last task before accepting a new one.", 400);
      }

      // Check client wallet has enough balance
      const clientWallet = await Wallet.findOne({ user: task.client });
      if (!clientWallet || clientWallet.balance < task.budget) {
        throw new AppError("This task cannot be accepted because the client has insufficient funds. The client needs to top up their wallet first.", 400);
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

      // Note: client must confirm delivery closure at destination via /confirm-delivery

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

// Client confirms delivery at destination (closes the errand)
router.post('/:id/confirm-delivery', authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) throw new AppError('Task not found', 404);

    if (task.client.toString() !== req.user!._id.toString()) {
      throw new AppError('Unauthorized', 403);
    }

    if (task.status !== 'completed') {
      throw new AppError('Task must be completed before confirming delivery', 400);
    }

    task.closedAtDestination = true;
    await task.save();

    await AuditLog.create({ action: 'TASK_CLOSED_AT_DESTINATION', user: req.user!._id, target: task._id, meta: {} });

    res.json({ message: 'Delivery confirmed. Task closed at destination', task });
  } catch (err) {
    next(err);
  }
});

export default router;
