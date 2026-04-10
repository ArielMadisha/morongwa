// Messenger routes for task-based chat
import express, { Response } from "express";
import Message from "../data/models/Message";
import DirectMessage from "../data/models/DirectMessage";
import Task from "../data/models/Task";
import AuditLog from "../data/models/AuditLog";
import User from "../data/models/User";
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

    const directMessages = await DirectMessage.find({
      $or: [{ sender: userId }, { receiver: userId }],
    })
      .populate("sender", "name avatar role")
      .populate("receiver", "name avatar role")
      .sort({ createdAt: -1 })
      .lean();

    const directMap = new Map<string, any>();
    for (const dm of directMessages as any[]) {
      const senderId = dm.sender?._id?.toString?.() ?? dm.sender?.toString?.();
      const receiverId = dm.receiver?._id?.toString?.() ?? dm.receiver?.toString?.();
      const otherId = senderId === userId ? receiverId : senderId;
      if (!otherId) continue;
      if (!directMap.has(otherId)) {
        const otherUser = senderId === userId ? dm.receiver : dm.sender;
        directMap.set(otherId, {
          _id: `direct-${otherId}`,
          kind: "direct",
          conversationId: `direct-${otherId}`,
          taskId: null,
          taskTitle: "Direct message",
          user: {
            _id: otherUser?._id?.toString?.() ?? otherId,
            name: otherUser?.name ?? "Unknown",
            role: Array.isArray(otherUser?.role) ? otherUser.role.join(", ") : otherUser?.role ?? "user",
            avatar: otherUser?.avatar,
          },
          lastMessage: dm.content,
          lastMessageTime: dm.createdAt,
          unread: 0,
        });
      }
    }

    const unreadDirect = await DirectMessage.aggregate([
      { $match: { receiver: req.user!._id, read: false } },
      { $group: { _id: "$sender", count: { $sum: 1 } } },
    ]);
    const unreadMap = new Map<string, number>(
      unreadDirect.map((d: any) => [String(d._id), Number(d.count || 0)])
    );
    for (const [otherId, convo] of directMap.entries()) {
      convo.unread = unreadMap.get(otherId) || 0;
    }

    const all = [...convos.map((c) => ({ ...c, kind: "task" })), ...Array.from(directMap.values())]
      .sort((a, b) => new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime());

    res.json({ conversations: all });
  } catch (err) {
    next(err);
  }
});

router.get("/users/search", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const q = String(req.query.q || "").trim();
    const limit = Math.min(25, Math.max(1, Number(req.query.limit || 12)));
    const query: any = { _id: { $ne: req.user!._id } };
    if (q) {
      query.$or = [
        { name: { $regex: q, $options: "i" } },
        { username: { $regex: q, $options: "i" } },
        { email: { $regex: q, $options: "i" } },
      ];
    }
    const users = await User.find(query)
      .select("_id name username avatar role")
      .sort({ updatedAt: -1 })
      .limit(limit)
      .lean();
    res.json({ data: users });
  } catch (err) {
    next(err);
  }
});

router.get("/direct/:userId", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const me = req.user!._id.toString();
    const other = req.params.userId;
    const messages = await DirectMessage.find({
      $or: [
        { sender: me, receiver: other },
        { sender: other, receiver: me },
      ],
    })
      .populate("sender", "name avatar")
      .sort({ createdAt: 1 })
      .lean();

    await DirectMessage.updateMany(
      { sender: other, receiver: me, read: false },
      { $set: { read: true, readAt: new Date() } }
    );

    res.json({
      messages: (messages as any[]).map((m) => ({
        _id: m._id,
        sender: (m.sender as any)?._id ?? m.sender,
        text: m.content,
        createdAt: m.createdAt,
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.post("/direct/:userId", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const otherUserId = req.params.userId;
    if (!otherUserId) throw new AppError("Receiver required", 400);
    if (otherUserId === req.user!._id.toString()) throw new AppError("Cannot message yourself", 400);
    const content = String(req.body?.content || "").trim();
    if (!content) throw new AppError("content is required", 400);

    const receiver = await User.findById(otherUserId).select("_id");
    if (!receiver) throw new AppError("User not found", 404);

    const message = await DirectMessage.create({
      sender: req.user!._id,
      receiver: receiver._id,
      content: content.substring(0, 1000),
    });
    await message.populate("sender", "name avatar");

    res.status(201).json({
      message: "Message sent successfully",
      data: {
        _id: message._id,
        sender: (message.sender as any)?._id ?? message.sender,
        text: message.content,
        createdAt: message.createdAt,
      },
    });
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

    const { limit } = req.query;
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
    const taskCount = await Message.countDocuments({
      receiver: req.user!._id,
      read: false,
    });
    const directCount = await DirectMessage.countDocuments({
      receiver: req.user!._id,
      read: false,
    });

    res.json({ unreadCount: taskCount + directCount });
  } catch (err) {
    next(err);
  }
});

export default router;
