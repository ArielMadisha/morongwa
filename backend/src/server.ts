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
import { initializeWebRTCSignaling } from "./services/webrtcSignaling";
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
import productsRoutes from "./routes/products";
import suppliersRoutes from "./routes/suppliers";
import cartRoutes from "./routes/cart";
import checkoutRoutes from "./routes/checkout";
import resellerRoutes from "./routes/reseller";
import storesRoutes from "./routes/stores";
import waFlowRoutes from "./routes/waFlow";
import waRedirectRoutes from "./routes/waRedirect";
import webrtcRoutes from "./routes/webrtc";
import landingBackgroundRoutes from "./routes/landingBackgrounds";
import { ensureDefaultPolicies } from "./services/policyService";
import { ensureDefaultProducts } from "./services/marketplaceSeed";
import { ensureDefaultLandingBackgrounds } from "./services/landingBackgroundSeed";

const app: Application = express();
/** Behind nginx/Cloudflare, restores real client IP for rate limits and logs. */
app.set("trust proxy", process.env.TRUST_PROXY === "0" ? false : 1);
const server = http.createServer(app);

/** CORS: browsers send Origin for api.qwertymates.com calls from the web app. Include apex + www + FRONTEND_URL. */
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "https://qwertymates.com",
  "https://www.qwertymates.com",
  process.env.FRONTEND_URL,
  ...(process.env.CORS_EXTRA_ORIGINS || process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
].filter(Boolean) as string[];
const uniqueAllowedOrigins = [...new Set(allowedOrigins)];

const corsOriginOption =
  uniqueAllowedOrigins.length > 0 ? uniqueAllowedOrigins : "http://localhost:3000";

// Socket.IO setup with CORS
const io = new SocketServer(server, {
  cors: {
    origin: corsOriginOption,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Middleware
app.use(
  cors({
    origin: corsOriginOption,
    credentials: true,
  })
);
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
app.use("/api/products", productsRoutes);
app.use("/api/suppliers", suppliersRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/checkout", checkoutRoutes);
app.use("/api/reseller", resellerRoutes);
app.use("/api/stores", storesRoutes);
app.use("/api/wa", waRedirectRoutes);
app.use("/api/wa/flow", waFlowRoutes);
app.use("/api/webrtc", webrtcRoutes);
app.use("/api/landing-backgrounds", landingBackgroundRoutes);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

// Initialize services
const initializeServices = () => {
  initializeNotificationService(io);
  initializeChatService(io);
  initializeWebRTCSignaling(io);
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
    // Seed marketplace products if none exist (idempotent)
    await ensureDefaultProducts();
    // Seed login/register background rows if none exist (idempotent)
    await ensureDefaultLandingBackgrounds();

    // Initialize services
    initializeServices();

    // Start listening
    server.listen(PORT, () => {
      logger.info(`🚀 Server running on port ${PORT}`);
      logger.info(`📝 Environment: ${process.env.NODE_ENV || "development"}`);
      logger.info(`🌐 CORS origins: ${uniqueAllowedOrigins.join(", ")}`);
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
