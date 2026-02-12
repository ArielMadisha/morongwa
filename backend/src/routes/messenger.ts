// Messenger routes for task-based chat
import express, { Response } from "express";
import Message from "../data/models/Message";
import Task from "../data/models/Task";
import AuditLog from "../data/models/AuditLog";
import { authenticate, AuthRequest } from "../middleware/auth";
import { messageSchema } from "../utils/validators";
import { AppError } from "../middleware/errorHandler";
import { getTaskMessages, markMessagesAsRead } from "../services/chat";

const router = express.Router();

// Get conversations (tasks where user can message)
router.get("/conversations", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const userId = req.user!._id.toString();
    const tasks = await Task.find({
      $or: [{ client: userId }, { runner: userId }],
      runner: { $exists: true, $ne: null },
      status: { $in: ["accepted", "in_progress"] },
    })
      .populate("client", "name")
      .populate("runner", "name")
      .sort({ updatedAt: -1 })
      .lean();

    const convos: any[] = [];
    for (const t of tasks) {
      const task = t as any;
      const runnerId = task.runner?._id?.toString?.() ?? task.runner?.toString?.();
      const clientId = task.client?._id?.toString?.() ?? task.client?.toString?.();
      if (!runnerId) continue; // need a runner to message

      const otherUser = userId === clientId ? task.runner : task.client;
      const otherName = otherUser?.name ?? "Unknown";

      const lastMsg = await Message.findOne({ task: task._id })
        .sort({ createdAt: -1 })
        .lean();
      const unread = await Message.countDocuments({
        task: task._id,
        receiver: userId,
        read: false,
      });

      convos.push({
        _id: task._id.toString(),
        taskId: task._id.toString(),
        taskTitle: task.title,
        user: {
          _id: otherUser?._id?.toString?.() ?? otherUser,
          name: otherName,
          role: userId === clientId ? "runner" : "client",
        },
        lastMessage: lastMsg?.content ?? null,
        lastMessageTime: lastMsg?.createdAt ?? task.updatedAt ?? task.createdAt,
        unread,
      });
    }

    res.json({ conversations: convos });
  } catch (err) {
    next(err);
  }
});

// Get messages for a task
router.get("/task/:taskId", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const task = await Task.findById(req.params.taskId);
    if (!task) throw new AppError("Task not found", 404);

    if (
      task.client.toString() !== req.user!._id.toString() &&
      task.runner?.toString() !== req.user!._id.toString()
    ) {
      throw new AppError("Unauthorized", 403);
    }

    const { page, limit } = req.query;
    const limitNum = limit ? parseInt(limit as string) : 50;

    const messages = await getTaskMessages(req.params.taskId, limitNum);

    res.json({ messages: messages.reverse() });
  } catch (err) {
    next(err);
  }
});

// Send a message (alternative to Socket.IO)
router.post("/task/:taskId", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const { error } = messageSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);

    const task = await Task.findById(req.params.taskId);
    if (!task) throw new AppError("Task not found", 404);

    const senderId = req.user!._id;
    let receiverId;

    if (task.client.toString() === senderId.toString()) {
      receiverId = task.runner;
    } else if (task.runner?.toString() === senderId.toString()) {
      receiverId = task.client;
    } else {
      throw new AppError("Unauthorized", 403);
    }

    if (!receiverId) {
      throw new AppError("No runner assigned to this task yet", 400);
    }

    // Restrict runner messaging until after acceptance
    if (task.runner?.toString() === senderId.toString() && task.status === "posted") {
      throw new AppError("Runner can only message the client after accepting the task", 400);
    }

    const { content } = req.body;

    const message = await Message.create({
      task: task._id,
      sender: senderId,
      receiver: receiverId,
      content,
    });

    await message.populate("sender", "name avatar");

    await AuditLog.create({
      action: "MESSAGE_SENT",
      user: senderId,
      meta: { taskId: task._id },
    });

    res.status(201).json({ message: "Message sent successfully", data: message });
  } catch (err) {
    next(err);
  }
});

// Mark messages as read
router.post(
  "/task/:taskId/read",
  authenticate,
  async (req: AuthRequest, res: Response, next) => {
    try {
      const task = await Task.findById(req.params.taskId);
      if (!task) throw new AppError("Task not found", 404);

      if (
        task.client.toString() !== req.user!._id.toString() &&
        task.runner?.toString() !== req.user!._id.toString()
      ) {
        throw new AppError("Unauthorized", 403);
      }

      await markMessagesAsRead(req.params.taskId, req.user!._id.toString());

      res.json({ message: "Messages marked as read" });
    } catch (err) {
      next(err);
    }
  }
);

// Get unread message count
router.get("/unread", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const count = await Message.countDocuments({
      receiver: req.user!._id,
      read: false,
    });

    res.json({ unreadCount: count });
  } catch (err) {
    next(err);
  }
});

export default router;
