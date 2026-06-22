// Chat service with Socket.IO for real-time messaging
import { Server as SocketServer } from "socket.io";
import Message from "../data/models/Message";
import Task from "../data/models/Task";
import { logger } from "./monitoring";
import { pushMessengerSyncEvent } from "./messengerSyncBridge";
import { authenticateSocket, assertTaskParticipant, socketUserId } from "../utils/socketAuth";

let io: SocketServer | null = null;

export const initializeChatService = (socketServer: SocketServer): void => {
  io = socketServer;
  const chatNs = io.of("/chat");
  chatNs.use(authenticateSocket);

  chatNs.on("connection", (socket) => {
    const userId = socketUserId(socket);
    logger.info("Client connected to chat", { socketId: socket.id, userId });

    if (userId) {
      pushMessengerSyncEvent("presence.updated", userId, {
        userId,
        state: "online",
        source: "socket-connect",
      });
    }

    socket.on("join-task", async (taskId: string) => {
      try {
        await assertTaskParticipant(String(taskId), userId);
        socket.join(String(taskId));
        logger.info("User joined task room", { taskId, socketId: socket.id, userId });
      } catch {
        socket.emit("error", { message: "Not allowed to join this task" });
      }
    });

    socket.on("leave-task", (taskId: string) => {
      socket.leave(String(taskId));
      logger.info("User left task room", { taskId, socketId: socket.id });
    });

    socket.on(
      "send-message",
      async (data: { taskId: string; senderId?: string; receiverId: string; content: string }) => {
        try {
          const taskId = String(data.taskId || "");
          const receiverId = String(data.receiverId || "");
          const content = String(data.content || "").trim();
          if (!taskId || !receiverId || !content) {
            socket.emit("error", { message: "Invalid message" });
            return;
          }

          await assertTaskParticipant(taskId, userId);

          const task = await Task.findById(taskId).select("client runner").lean();
          if (!task) {
            socket.emit("error", { message: "Task not found" });
            return;
          }
          const clientId = String(task.client);
          const runnerId = task.runner ? String(task.runner) : "";
          const otherParty = userId === clientId ? runnerId : clientId;
          if (!otherParty || receiverId !== otherParty) {
            socket.emit("error", { message: "Invalid receiver" });
            return;
          }

          const message = await Message.create({
            task: taskId,
            sender: userId,
            receiver: receiverId,
            content,
          });

          await message.populate("sender", "name avatar");
          pushMessengerSyncEvent("message.created", userId, {
            conversationType: "task",
            conversationId: taskId,
            taskId,
            messageId: message._id.toString(),
            senderUserId: userId,
            receiverUserId: receiverId,
            body: content,
            createdAt: message.createdAt.toISOString(),
            source: "socket",
          });

          io?.of("/chat").to(taskId).emit("message-received", message);
          logger.info("Message sent", { taskId, senderId: userId });
        } catch (error) {
          logger.error("Failed to send message:", error);
          socket.emit("error", { message: "Failed to send message" });
        }
      }
    );

    socket.on("typing", async (data: { taskId: string; userId?: string }) => {
      try {
        const taskId = String(data.taskId || "");
        await assertTaskParticipant(taskId, userId);
        pushMessengerSyncEvent("presence.updated", userId, {
          userId,
          state: "typing",
          conversationId: taskId,
          source: "socket-typing",
        });
        socket.to(taskId).emit("user-typing", { userId });
      } catch {
        /* ignore unauthorized typing */
      }
    });

    socket.on("mark-read", async (messageId: string) => {
      try {
        const msg = await Message.findById(messageId).select("receiver task").lean();
        if (!msg || String(msg.receiver) !== userId) {
          socket.emit("error", { message: "Cannot mark message read" });
          return;
        }
        await Message.findByIdAndUpdate(messageId, { read: true, readAt: new Date() });
        pushMessengerSyncEvent("message.read", userId, {
          conversationType: "task",
          messageId,
          userId,
          source: "socket-mark-read",
        });
        socket.emit("message-read", { messageId });
      } catch (error) {
        logger.error("Failed to mark message as read:", error);
      }
    });

    socket.on("disconnect", () => {
      logger.info("Client disconnected from chat", { socketId: socket.id });
      if (userId) {
        pushMessengerSyncEvent("presence.updated", userId, {
          userId,
          state: "offline",
          source: "socket-disconnect",
        });
      }
    });
  });

  logger.info("Chat service initialized");
};

export const getTaskMessages = async (taskId: string, limit = 50): Promise<any[]> => {
  return Message.find({ task: taskId })
    .populate("sender", "name avatar")
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
};

export const markMessagesAsRead = async (taskId: string, receiverId: string): Promise<void> => {
  await Message.updateMany(
    { task: taskId, receiver: receiverId, read: false },
    { read: true, readAt: new Date() }
  );
};
