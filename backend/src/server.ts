// Main server entry point
import dotenv from "dotenv";
import express, { Application } from "express";
import http from "http";
import { Server as SocketServer } from "socket.io";
import cors from "cors";
import { connectDB } from "./data/db";

// Load environment variables
dotenv.config();
import { logger } from "./services/monitoring";
import { initializeNotificationService } from "./services/notification";
import { initializeChatService } from "./services/chat";
import { securityMiddleware, requestLogger, validateInput } from "./middleware/security";
import { apiLimiter } from "./middleware/rateLimit";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";

// Import routes
import authRoutes from "./routes/auth";
import userRoutes from "./routes/users";
import passwordRoutes from "./routes/password";
import taskRoutes from "./routes/tasks";
import walletRoutes from "./routes/wallet";
import paymentRoutes from "./routes/payments";
import reviewRoutes from "./routes/reviews";
import messengerRoutes from "./routes/messenger";
import filesharingRoutes from "./routes/filesharing";
import notificationRoutes from "./routes/notifications";
import adminRoutes from "./routes/admin";
import supportRoutes from "./routes/support";
import analyticsRoutes from "./routes/analytics";
import pricingRoutes from "./routes/pricing";
import policyRoutes from "./routes/policies";
import runnersRoutes from "./routes/runners";
import { ensureDefaultPolicies } from "./services/policyService";

const app: Application = express();
const server = http.createServer(app);

// Socket.IO setup with CORS
const io = new SocketServer(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(...securityMiddleware);
app.use(requestLogger);
app.use(validateInput);

// API rate limiting
app.use("/api", apiLimiter);

// Static files (uploads)
app.use("/uploads", express.static("uploads"));

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/password", passwordRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/messenger", messengerRoutes);
app.use("/api/filesharing", filesharingRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/support", supportRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/pricing", pricingRoutes);
app.use("/api/policies", policyRoutes);
app.use("/api/runners", runnersRoutes);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

// Initialize services
const initializeServices = () => {
  initializeNotificationService(io);
  initializeChatService(io);
  logger.info("Services initialized successfully");
};

// Start server
const PORT = process.env.PORT || 5001;

const startServer = async () => {
  try {
    // Connect to database
    await connectDB();

    // Seed baseline policies (idempotent)
    await ensureDefaultPolicies();

    // Initialize services
    initializeServices();

    // Start listening
    server.listen(PORT, () => {
      logger.info(`🚀 Server running on port ${PORT}`);
      logger.info(`📝 Environment: ${process.env.NODE_ENV || "development"}`);
      logger.info(`🔗 API: http://localhost:${PORT}/api`);
      logger.info(`💬 Socket.IO: http://localhost:${PORT}`);
    });
  } catch (error) {
    logger.error("Failed to start server:", error);
    process.exit(1);
  }
};

// Graceful shutdown
const gracefulShutdown = (signal: string) => {
  logger.info(`${signal} received. Starting graceful shutdown...`);
  server.close(() => {
    logger.info("Server closed");
    process.exit(0);
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    logger.error("Forced shutdown after timeout");
    process.exit(1);
  }, 10000);
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Handle unhandled rejections
process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Rejection at:", promise, "reason:", reason);
});

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception:", error);
  process.exit(1);
});

startServer();

export { app, server, io };
