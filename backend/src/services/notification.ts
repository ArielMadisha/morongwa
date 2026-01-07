// Notification service with Socket.IO and email support
import nodemailer from "nodemailer";
import { Server as SocketServer } from "socket.io";
import Notification from "../data/models/Notification";
import User from "../data/models/User";
import { logger } from "./monitoring";

let io: SocketServer | null = null;

export const initializeNotificationService = (socketServer: SocketServer): void => {
  io = socketServer;
  logger.info("Notification service initialized");
};

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

interface NotificationOptions {
  userId?: string;
  type: string;
  message: string;
  channel?: "realtime" | "email" | "sms" | "push" | "broadcast";
  email?: {
    subject: string;
    html?: string;
  };
}

export const sendNotification = async (options: NotificationOptions): Promise<void> => {
  try {
    const channel = options.channel || "realtime";

    // Save to database
    const notification = await Notification.create({
      user: options.userId || null,
      type: options.type,
      message: options.message,
      channel,
    });

    // Realtime notification via Socket.IO
    if (channel === "realtime" || channel === "broadcast") {
      if (io) {
        if (channel === "broadcast") {
          io.of("/notifications").emit("notification", notification);
        } else if (options.userId) {
          io.of("/notifications").to(options.userId).emit("notification", notification);
        }
      }
    }

    // Email notification
    if (channel === "email" && options.userId && options.email) {
      const user = await User.findById(options.userId);
      if (user) {
        await transporter.sendMail({
          from: process.env.SMTP_USER,
          to: user.email,
          subject: options.email.subject,
          text: options.message,
          html: options.email.html || `<p>${options.message}</p>`,
        });
      }
    }

    logger.info("Notification sent", { type: options.type, channel, userId: options.userId });
  } catch (error) {
    logger.error("Failed to send notification:", error);
    throw error;
  }
};

export const sendBroadcastNotification = async (
  message: string,
  type: string,
  roles?: string[]
): Promise<void> => {
  try {
    const query = roles && roles.length > 0 ? { role: { $in: roles } } : {};
    const users = await User.find(query).select("_id");

    const notifications = users.map((user) => ({
      user: user._id,
      type,
      message,
      channel: "broadcast" as const,
    }));

    await Notification.insertMany(notifications);

    if (io) {
      if (roles && roles.length > 0) {
        for (const user of users) {
          io.of("/notifications").to(user._id.toString()).emit("notification", {
            type,
            message,
          });
        }
      } else {
        io.of("/notifications").emit("notification", { type, message });
      }
    }

    logger.info("Broadcast notification sent", { type, roles, userCount: users.length });
  } catch (error) {
    logger.error("Failed to send broadcast notification:", error);
    throw error;
  }
};
