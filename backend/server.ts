// Main server entry point
import dotenv from "dotenv";
import express, { Application } from "express";
import http from "http";
import { Server as SocketServer } from "socket.io";
import cors from "cors";
import { connectDB, isDbConnected } from "./src/data/db";

// Load environment variables
dotenv.config();
import { logger } from "./src/services/monitoring";
import { initializeNotificationService } from "./src/services/notification";
import { initializeChatService } from "./src/services/chat";
import { securityMiddleware, requestLogger, validateInput } from "./src/middleware/security";
import { apiLimiter } from "./src/middleware/rateLimit";
import { errorHandler, notFoundHandler } from "./src/middleware/errorHandler";

// Import routes
import authRoutes from "./src/routes/auth";
import userRoutes from "./src/routes/users";
import passwordRoutes from "./src/routes/password";
import taskRoutes from "./src/routes/tasks";
import walletRoutes from "./src/routes/wallet";
import paymentRoutes from "./src/routes/payments";
import reviewRoutes from "./src/routes/reviews";
import messengerRoutes from "./src/routes/messenger";
import filesharingRoutes from "./src/routes/filesharing";
import notificationRoutes from "./src/routes/notifications";
import adminRoutes from "./src/routes/admin";
import supportRoutes from "./src/routes/support";
import analyticsRoutes from "./src/routes/analytics";
import pricingRoutes from "./src/routes/pricing";
import policyRoutes from "./src/routes/policies";
import runnersRoutes from "./src/routes/runners";
import productsRoutes from "./src/routes/products";
import suppliersRoutes from "./src/routes/suppliers";
import cartRoutes from "./src/routes/cart";
import checkoutRoutes from "./src/routes/checkout";
import resellerRoutes from "./src/routes/reseller";
import storesRoutes from "./src/routes/stores";
import { ensureDefaultPolicies } from "./src/services/policyService";
import { seedPricingConfig } from "./src/services/pricingConfig";

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

// Return 503 when DB is down so frontend gets a response instead of connection refused
app.use("/api", (req, res, next) => {
  if (!isDbConnected()) {
    return res.status(503).json({
      error: true,
      message: "Database unavailable. Check MongoDB and try again.",
    });
  }
  next();
});

// Static files (uploads)
app.use("/uploads", express.static("uploads"));

// Health check (always responds so load balancers see the server is up)
app.get("/health", (req, res) => {
  const dbOk = isDbConnected();
  res.status(dbOk ? 200 : 503).json({
    status: dbOk ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: dbOk ? "connected" : "disconnected",
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
app.use("/api/products", productsRoutes);
app.use("/api/suppliers", suppliersRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/checkout", checkoutRoutes);
app.use("/api/reseller", resellerRoutes);
app.use("/api/stores", storesRoutes);

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
const PORT = process.env.PORT || 4000;

const startServer = async () => {
  try {
    await connectDB();
    await ensureDefaultPolicies();
    await seedPricingConfig();
  } catch (error) {
    logger.error("Database not available (server will start; API will return 503 until DB is up):", error);
  }

  initializeServices();
  server.listen(PORT, () => {
    logger.info(`🚀 Server running on port ${PORT}`);
    logger.info(`📝 Environment: ${process.env.NODE_ENV || "development"}`);
    logger.info(`🔗 API: http://localhost:${PORT}/api`);
    logger.info(`💬 Socket.IO: http://localhost:${PORT}`);
    if (!isDbConnected()) {
      logger.warn("⚠️ MongoDB not connected. API will return 503 until DB is available.");
    }
  });
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