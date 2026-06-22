// Notification service with Socket.IO and email support
import nodemailer from "nodemailer";
import { Server as SocketServer } from "socket.io";
import Notification from "../data/models/Notification";
import User from "../data/models/User";
import Task from "../data/models/Task";
import { logger } from "./monitoring";
import {
  authenticateSocket,
  assertOwnUserRoom,
  assertTaskParticipant,
  socketUserId,
} from "../utils/socketAuth";

let io: SocketServer | null = null;

let lazyTransporter: any = null;

const getTransporter = async () => {
  if (lazyTransporter) return lazyTransporter;

  // Allow a developer-friendly Ethereal test transport when MAILER=ethereal
  if ((process.env.MAILER || '').toLowerCase() === 'ethereal') {
    try {
      const testAccount = await nodemailer.createTestAccount();
      lazyTransporter = nodemailer.createTransport({
        host: testAccount.smtp.host,
        port: testAccount.smtp.port,
        secure: testAccount.smtp.secure,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });
      logger.info('Using Ethereal test mail transport for development', { user: testAccount.user });
      return lazyTransporter;
    } catch (err) {
      logger.warn('Failed to create Ethereal account, falling back to env SMTP', { error: err });
    }
  }

  // Default: use SMTP from env
  lazyTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  return lazyTransporter;
};

export const initializeNotificationService = (socketServer: SocketServer): void => {
  io = socketServer;

  // Setup notifications namespace for realtime user notifications
  try {
    const notifNs = io.of('/notifications');
    notifNs.use(authenticateSocket);
    notifNs.on('connection', (socket) => {
      socket.on('join', async (roomId: string) => {
        try {
          assertOwnUserRoom(String(roomId), socketUserId(socket));
          socket.join(String(roomId));
        } catch {
          /* ignore unauthorized join */
        }
      });
    });
  } catch (e) {
    logger.warn('Failed to initialize /notifications namespace', { error: e });
  }

  try {
    const locNs = io.of('/locations');
    locNs.use(authenticateSocket);
    locNs.on('connection', (socket) => {
      socket.on('join', async (roomId: string) => {
        try {
          await assertTaskParticipant(String(roomId), socketUserId(socket));
          socket.join(String(roomId));
        } catch {
          /* ignore unauthorized join */
        }
      });
    });
  } catch (e) {
    logger.warn('Failed to initialize /locations namespace', { error: e });
  }

  logger.info("Notification service initialized");
};

/** Push a saved notification document to a user's realtime channel. */
export function emitUserNotification(userId: string, payload: unknown): void {
  try {
    if (!io || !userId) return;
    io.of("/notifications").to(userId).emit("notification", payload);
  } catch (e) {
    logger.warn("emitUserNotification failed (non-fatal)", { error: e });
  }
}

/** Realtime wallet balance for web/mobile (Socket.IO `/notifications`, event `wallet_balance`). */
export function emitWalletBalanceSync(
  userId: string,
  payload: { balance: number; transaction?: unknown; updatedAt: string }
): void {
  try {
    if (!io || !userId) return;
    io.of("/notifications").to(userId).emit("wallet_balance", payload);
  } catch (e) {
    logger.warn("emitWalletBalanceSync failed (non-fatal)", { error: e });
  }
}

/** Store scan: payer should confirm in wallet (event `wallet_pending_payment`). */
export function emitWalletPendingPayment(
  userId: string,
  payload: { paymentRequestId: string; amount: number; merchantName: string }
): void {
  try {
    if (!io || !userId) return;
    io.of("/notifications").to(userId).emit("wallet_pending_payment", payload);
  } catch (e) {
    logger.warn("emitWalletPendingPayment failed (non-fatal)", { error: e });
  }
}

/** P2P: payee should confirm send (event `wallet_money_request`). */
export function emitWalletMoneyRequest(
  userId: string,
  payload: { requestId: string; amount: number; requesterName: string }
): void {
  try {
    if (!io || !userId) return;
    io.of("/notifications").to(userId).emit("wallet_money_request", payload);
  } catch (e) {
    logger.warn("emitWalletMoneyRequest failed (non-fatal)", { error: e });
  }
}

/** Store scan: merchant notified when payer confirmed (event `wallet_payment_completed`). */
export function emitWalletPaymentCompleted(
  userId: string,
  payload: { paymentRequestId: string; amount: number; status: string }
): void {
  try {
    if (!io || !userId) return;
    io.of("/notifications").to(userId).emit("wallet_payment_completed", payload);
  } catch (e) {
    logger.warn("emitWalletPaymentCompleted failed (non-fatal)", { error: e });
  }
}

interface NotificationOptions {
  userId?: string;
  type: string;
  message: string;
  channel?: "realtime" | "email" | "sms" | "whatsapp" | "push" | "broadcast";
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

    // Email notification - do not let SMTP failures break main flows
    if (channel === "email" && options.userId && options.email) {
      const user = await User.findById(options.userId);
      if (user) {
          try {
            const transporter = await getTransporter();
            const info = await transporter.sendMail({
              from: process.env.SMTP_USER || 'no-reply@morongwa.local',
              to: user.email,
              subject: options.email.subject,
              text: options.message,
              html: options.email.html || `<p>${options.message}</p>`,
            });

            // If using Ethereal, log preview URL
            if ((process.env.MAILER || '').toLowerCase() === 'ethereal' && nodemailer.getTestMessageUrl) {
              const url = nodemailer.getTestMessageUrl(info);
              logger.info('Ethereal message preview URL', { url });
            }
          } catch (smtpErr) {
            // Log and continue - caller flows shouldn't fail because of email issues
            logger.warn('SMTP send failed, continuing without blocking flow', { error: smtpErr });
          }
      }
    }

    logger.info("Notification processed (may be queued or sent)", { type: options.type, channel, userId: options.userId });
  } catch (error) {
    // Log but don't throw to avoid breaking primary operations that call notifications
    logger.error("Failed to process notification (non-fatal):", error);
  }
};

// Emit runner location updates to clients of assigned tasks
export const emitRunnerLocation = async (runnerId: string, location: { type: string; coordinates: number[]; updatedAt?: Date }): Promise<void> => {
  try {
    if (!io) return;

    // Find tasks where this runner is assigned and currently active
    const tasks = await Task.find({ runner: runnerId, status: { $in: ["accepted", "in_progress"] } }).select("_id client");

    for (const t of tasks) {
      const roomId = t._id?.toString();
      if (roomId) {
        io.of("/locations").to(roomId).emit("runner_location", {
          runnerId,
          taskId: t._id.toString(),
          lat: location.coordinates[1],
          lon: location.coordinates[0],
          timestamp: new Date(),
        });
      }
    }

    logger.info("Emitted runner location to clients", { runnerId, tasks: tasks.length });
  } catch (err) {
    logger.warn("Failed to emit runner location", { error: err });
  }
};

/** Send SMTP email with optional attachments (CSV/PDF). Best-effort; returns false on failure. */
export async function sendEmailWithAttachments(params: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: Array<{ filename: string; content: string | Buffer; contentType?: string }>;
}): Promise<boolean> {
  try {
    const transporter = await getTransporter();
    const attachments = Array.isArray(params.attachments) ? params.attachments : [];
    await transporter.sendMail({
      from: process.env.SMTP_USER || "no-reply@qwertymates.local",
      to: params.to,
      subject: params.subject,
      text: params.text,
      html: params.html,
      attachments,
    });
    return true;
  } catch (error) {
    logger.warn("sendEmailWithAttachments failed (non-fatal)", { error: String((error as any)?.message || error) });
    return false;
  }
}

/** Notify admin/superadmin users via realtime (saved + Socket.IO room per user id). */
export async function notifyPlatformAdminsRealtime(payload: { type: string; message: string }): Promise<void> {
  try {
    const admins = await User.find({
      role: { $in: ["admin", "superadmin"] },
      active: true,
      suspended: false,
    })
      .select("_id")
      .lean();
    for (const a of admins) {
      await sendNotification({
        userId: String(a._id),
        type: payload.type,
        message: payload.message,
        channel: "realtime",
      });
    }
  } catch (error) {
    logger.warn("notifyPlatformAdminsRealtime failed (non-fatal)", { error: String((error as any)?.message || error) });
  }
}

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
