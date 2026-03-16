// Main server entry point
import dotenv from "dotenv";
import express, { Application } from "express";
import http from "http";
import path from "path";
import { Server as SocketServer } from "socket.io";
import cors from "cors";
import { connectDB, isDbConnected } from "./src/data/db";

// Load environment variables
dotenv.config();
import { logger } from "./src/services/monitoring";
import { initializeNotificationService } from "./src/services/notification";
import { initializeChatService } from "./src/services/chat";
import { initializeWebRTCSignaling } from "./src/services/webrtcSignaling";
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
import tvRoutes from "./src/routes/tv";
import productEnquiryRoutes from "./src/routes/productEnquiry";
import advertsRoutes from "./src/routes/adverts";
import landingBackgroundsRoutes from "./src/routes/landingBackgrounds";
import followsRoutes from "./src/routes/follows";
import musicRoutes from "./src/routes/music";
import translateRoutes from "./src/routes/translate";
import macgyverRoutes from "./src/routes/macgyver";
import webhookRoutes from "./src/routes/webhooks";
import { getCardPaymentConfigIssues } from "./src/services/payment";
import { ensureDefaultPolicies } from "./src/services/policyService";
import { seedPricingConfig } from "./src/services/pricingConfig";
import { ensureDefaultProducts } from "./src/services/marketplaceSeed";
import { ensureSampleAdvert } from "./src/services/advertSeed";

const app: Application = express();
const server = http.createServer(app);

// Allowed CORS origins (supports both common dev ports)
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:8081",
  process.env.FRONTEND_URL,
].filter(Boolean) as string[];

// Socket.IO setup with CORS
const io = new SocketServer(server, {
  cors: {
    origin: allowedOrigins.length ? allowedOrigins : "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Middleware
app.use(cors({
  origin: allowedOrigins.length ? allowedOrigins : "http://localhost:3000",
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

// Static files (uploads) - allow cross-origin so frontend can load when proxied or direct
const uploadsDir = path.join(__dirname, "uploads");
app.use("/uploads", (req, res, next) => {
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.setHeader("Access-Control-Allow-Origin", "*");
  next();
}, express.static(uploadsDir));

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

// API Routes - guard against undefined route modules (e.g. failed imports)
const routePairs: [string, express.RequestHandler | undefined][] = [
  ["/api/auth", authRoutes],
  ["/api/users", userRoutes],
  ["/api/password", passwordRoutes],
  ["/api/tasks", taskRoutes],
  ["/api/wallet", walletRoutes],
  ["/api/payments", paymentRoutes],
  ["/api/reviews", reviewRoutes],
  ["/api/messenger", messengerRoutes],
  ["/api/filesharing", filesharingRoutes],
  ["/api/notifications", notificationRoutes],
  ["/api/admin", adminRoutes],
  ["/api/support", supportRoutes],
  ["/api/analytics", analyticsRoutes],
  ["/api/pricing", pricingRoutes],
  ["/api/policies", policyRoutes],
  ["/api/runners", runnersRoutes],
  ["/api/products", productsRoutes],
  ["/api/suppliers", suppliersRoutes],
  ["/api/cart", cartRoutes],
  ["/api/checkout", checkoutRoutes],
  ["/api/reseller", resellerRoutes],
  ["/api/stores", storesRoutes],
  ["/api/tv", tvRoutes],
  ["/api/product-enquiry", productEnquiryRoutes],
  ["/api/adverts", advertsRoutes],
  ["/api/landing-backgrounds", landingBackgroundsRoutes],
  ["/api/follows", followsRoutes],
  ["/api/music", musicRoutes],
  ["/api/translate", translateRoutes],
  ["/api/macgyver", macgyverRoutes],
  ["/api/webhooks", webhookRoutes],
];
for (const [path, handler] of routePairs) {
  if (handler == null) {
    logger.error(`Route ${path} is undefined - check import`);
  } else {
    app.use(path, handler);
  }
}

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
const PORT = process.env.PORT || 4000;

const startServer = async () => {
  try {
    await connectDB();
    await ensureDefaultPolicies();
    await seedPricingConfig();
    await ensureDefaultProducts();
    await ensureSampleAdvert();
  } catch (error) {
    logger.error("Database not available (server will start; API will return 503 until DB is up):", error);
  }

  initializeServices();
  server.listen(PORT, () => {
    logger.info(`🚀 Server running on port ${PORT}`);
    logger.info(`📝 Environment: ${process.env.NODE_ENV || "development"}`);
    logger.info(`🔗 API: http://localhost:${PORT}/api`);
    logger.info(`💬 Socket.IO: http://localhost:${PORT}`);
    const paymentConfigIssues = getCardPaymentConfigIssues();
    if (paymentConfigIssues.length > 0) {
      logger.warn(
        `⚠️ Card payments are blocked in current config: ${paymentConfigIssues.join(
          ", "
        )}. Configure public FRONTEND_URL/BACKEND_URL for PayGate.`
      );
    }
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