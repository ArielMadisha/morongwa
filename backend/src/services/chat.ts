// Chat service with Socket.IO for real-time messaging
import { Server as SocketServer } from "socket.io";
import Message from "../data/models/Message";
import { logger } from "./monitoring";

let io: SocketServer | null = null;

export const initializeChatService = (socketServer: SocketServer): void => {
  io = socketServer;

  io.of("/chat").on("connection", (socket) => {
    logger.info("Client connected to chat", { socketId: socket.id });

    socket.on("join-task", (taskId: string) => {
      socket.join(taskId);
      logger.info("User joined task room", { taskId, socketId: socket.id });
    });

    socket.on("leave-task", (taskId: string) => {
      socket.leave(taskId);
      logger.info("User left task room", { taskId, socketId: socket.id });
    });

    socket.on("send-message", async (data: { taskId: string; senderId: string; receiverId: string; content: string }) => {
      try {
        const message = await Message.create({
          task: data.taskId,
          sender: data.senderId,
          receiver: data.receiverId,
          content: data.content,
        });

        await message.populate("sender", "name avatar");

        io?.of("/chat").to(data.taskId).emit("message-received", message);
        logger.info("Message sent", { taskId: data.taskId, senderId: data.senderId });
      } catch (error) {
        logger.error("Failed to send message:", error);
        socket.emit("error", { message: "Failed to send message" });
      }
    });

    socket.on("typing", (data: { taskId: string; userId: string }) => {
      socket.to(data.taskId).emit("user-typing", { userId: data.userId });
    });

    socket.on("mark-read", async (messageId: string) => {
      try {
        await Message.findByIdAndUpdate(messageId, { read: true, readAt: new Date() });
        socket.emit("message-read", { messageId });
      } catch (error) {
        logger.error("Failed to mark message as read:", error);
      }
    });

    socket.on("disconnect", () => {
      logger.info("Client disconnected from chat", { socketId: socket.id });
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
