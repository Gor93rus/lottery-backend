// At the very top of the file, before other imports
import { initSentry } from "./lib/sentry.js";
import * as Sentry from "@sentry/node";

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import helmet from "helmet";
import compression from "compression";
import swaggerUi from "swagger-ui-express";
import { swaggerSpec } from "./config/swagger.js";
import {
  generalApiLimiter,
  authLimiter,
  ticketPurchaseLimiter,
  adminLimiter,
} from "./lib/middleware/rateLimiter.js";

dotenv.config();

// Initialize Sentry FIRST (before Express)
initSentry();

const app = express();
app.set("trust proxy", 1);
const PORT = Number(process.env.PORT) || 10000;

console.log("🚀 Starting Lottery Backend...");
console.log("📍 PORT:", PORT);
console.log("📍 NODE_ENV:", process.env.NODE_ENV);
console.log(
  "📍 DATABASE_URL:",
  process.env.DATABASE_URL ? "SET ✅" : "NOT SET ❌",
);

// CORS Configuration - SIMPLE and WORKING
app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (mobile apps, curl, Postman, etc.)
      if (!origin) {
        return callback(null, true);
      }

      try {
        const url = new URL(origin);
        const hostname = url.hostname;

        // Allow ALL vercel.app domains (frontend)
        if (hostname.endsWith(".vercel.app") || hostname === "vercel.app") {
          return callback(null, true);
        }

        // Allow ALL onrender.com domains (backend/swagger)
        if (hostname.endsWith(".onrender.com") || hostname === "onrender.com") {
          return callback(null, true);
        }

        // Allow Telegram domains (for Mini App)
        if (
          hostname.endsWith(".telegram.org") ||
          hostname === "telegram.org" ||
          hostname.endsWith(".t.me") ||
          hostname === "t.me"
        ) {
          return callback(null, true);
        }

        // Allow localhost for development
        if (hostname === "localhost" || hostname === "127.0.0.1") {
          return callback(null, true);
        }
      } catch (err) {
        // Invalid URL, block it
        console.log("CORS blocked invalid origin:", origin);
        return callback(new Error("Not allowed by CORS"));
      }

      // Log blocked origin for debugging
      console.log("CORS blocked origin:", origin);
      callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Accept",
      "Origin",
      "X-User-Id",
      "x-user-id",
    ],
  }),
);

// Handle OPTIONS preflight for all routes
app.options("*", cors());

// Enable gzip compression for responses
if (process.env.ENABLE_COMPRESSION !== "false") {
  app.use(
    compression({
      level: 6, // Good balance between speed and compression
      threshold: 1024, // Only compress responses > 1KB
      filter: (req, res) => {
        // Don't compress if client sends 'x-no-compression' header
        if (req.headers["x-no-compression"]) {
          return false;
        }
        // Use compression's default filter
        return compression.filter(req, res);
      },
    }),
  );
  console.log("✅ Response compression enabled");
}

// Security headers with helmet
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
    crossOriginEmbedderPolicy: false, // Disable for TON Connect compatibility
    crossOriginResourcePolicy: { policy: "cross-origin" }, // Allow cross-origin for API
  }),
);

// HTTPS enforcement in production
if (process.env.NODE_ENV === "production") {
  app.use((req, res, next) => {
    if (req.header("x-forwarded-proto") !== "https") {
      return res.redirect(301, `https://${req.hostname}${req.url}`);
    }
    next();
  });
}

// Request body size limits
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));

// Request metrics middleware (Phase 4)
import { requestMetrics } from "./middleware/requestMetrics.js";
app.use(requestMetrics);

// Apply general rate limiting to all /api/* routes
app.use("/api", generalApiLimiter);

// Root route
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Lottery Backend API v1.0",
    timestamp: new Date().toISOString(),
  });
});

// Swagger UI - only in development or if explicitly enabled
if (
  process.env.NODE_ENV !== "production" ||
  process.env.ENABLE_SWAGGER === "true"
) {
  app.use(
    "/api-docs",
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      customCss: ".swagger-ui .topbar { display: none }",
      customSiteTitle: "Weekend Millions API Docs",
      swaggerOptions: {
        persistAuthorization: true,
      },
    }),
  );

  // JSON spec endpoint
  app.get("/api-docs.json", (req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.send(swaggerSpec);
  });

  console.log("📖 Swagger UI available at /api-docs");
}

// Health check routes
import healthRoute from "./api/health.js";
app.use("/health", healthRoute);
app.use("/api/health", healthRoute);
app.use("/metrics", healthRoute);

// Import routes
import lotteryListRoute from "./api/lottery/list.js";
import lotteryInfoRoute from "./api/lottery/info.js";
import myTicketsRoute from "./api/lottery/my-tickets.js";
import buyTicketRoute from "./api/lottery/buy-ticket.js";
import buyTicketsRoute from "./api/lottery/buy-tickets.js";
import currentDrawsRoute from "./api/draws/current.js";
import drawResultsRoute from "./api/draws/results.js";
import drawVerifyRoute from "./api/draws/verify.js";
import telegramAuthRoute from "./api/auth/telegram.js";
import connectWalletRoute from "./api/auth/connect-wallet.js";
import walletAuthRoute from "./api/auth/wallet.js";
import profileRoute from "./api/user/profile.js";
import statsRoute from "./api/user/stats.js";

// Import ticket purchase routes
import ticketsPurchaseRoute from "./api/tickets/purchase.js";
import ticketsPurchaseBulkRoute from "./api/tickets/purchase-bulk.js";
import ticketsUserRoute from "./api/tickets/user.js";

// Import admin routes
import adminCheckRoute from "./api/admin/check.js";
import adminStatsRoute from "./api/admin/stats.js";
import adminUsersRoute from "./api/admin/users.js";
import adminLotteriesRoute from "./api/admin/lotteries.js";
import adminDrawsRoute from "./api/admin/draws.js";
import adminTicketsRoute from "./api/admin/tickets.js";
import adminNotificationsRoute from "./api/admin/notifications.js";
import adminPayoutsRoute from "./api/admin/payouts.js";
import adminDashboardRoute from "./api/admin/dashboard.js";
import adminFundsRoute from "./api/admin/funds.js";
import adminReportsRoute from "./api/admin/reports.js";
import adminAuthRoute from "./api/admin/auth.js";
import adminGamificationRoute from "./api/admin/gamification.js";
import adminFinanceRoute from "./api/admin/finance.js";

// Import gamification routes
import gamificationRoutes from "./api/gamification/index.js";
import gamificationLeaderboardRoute from "./api/gamification/leaderboard.js";
import gamificationRewardsRoute from "./api/gamification/rewards.js";
import gamificationReferralRoute from "./api/gamification/referral.js";

// Import user payout routes
import userPayoutsRoute from "./api/user/payouts.js";

// Import user stats and notifications routes
import userStatsRoute from "./api/user/stats.js";
import userNotificationsRoute from "./api/user/notifications.js";
import notificationSettingsRoute from "./api/user/notificationSettings.js";

// Import wallet routes (Phase 4)
import walletRouter from "./api/wallet/index.js";

// Register routes
app.use("/api/lottery/list", lotteryListRoute);
app.use("/api/lottery/:slug/info", lotteryInfoRoute);
app.use("/lottery/:slug/info", lotteryInfoRoute); // Frontend uses this (without /api prefix)
app.use("/api/lottery/my-tickets", myTicketsRoute);
app.use("/api/lottery/buy-ticket", ticketPurchaseLimiter, buyTicketRoute);
app.use("/api/lottery/buy-tickets", ticketPurchaseLimiter, buyTicketsRoute);
app.use("/api/draws/current", currentDrawsRoute);
app.use("/api/draws", drawResultsRoute);
app.use("/api/draws", drawVerifyRoute);
app.use("/api/auth/telegram", authLimiter, telegramAuthRoute);
app.use("/api/auth/connect-wallet", authLimiter, connectWalletRoute);
app.use("/api/auth/wallet", authLimiter, walletAuthRoute);
app.use("/api/user/profile", profileRoute);
app.use("/api/user", statsRoute);

// Register ticket purchase routes
app.use("/api/tickets/purchase", ticketPurchaseLimiter, ticketsPurchaseRoute);
app.use(
  "/api/tickets/purchase-bulk",
  ticketPurchaseLimiter,
  ticketsPurchaseBulkRoute,
);
app.use("/api/tickets/user", ticketsUserRoute);

// Register admin routes
app.use("/api/admin/auth", adminAuthRoute);
app.use("/api/admin/check", adminLimiter, adminCheckRoute);
app.use("/api/admin/stats", adminLimiter, adminStatsRoute);
app.use("/api/admin/dashboard", adminLimiter, adminDashboardRoute);
app.use("/api/admin/funds", adminLimiter, adminFundsRoute);
app.use("/api/admin/reports", adminLimiter, adminReportsRoute);
app.use("/api/admin/users", adminLimiter, adminUsersRoute);
app.use("/api/admin/lotteries", adminLimiter, adminLotteriesRoute);
app.use("/api/admin/draws", adminLimiter, adminDrawsRoute);
app.use("/api/admin/tickets", adminLimiter, adminTicketsRoute);
app.use("/api/admin/notifications", adminLimiter, adminNotificationsRoute);
app.use("/api/admin/payouts", adminLimiter, adminPayoutsRoute);
app.use("/api/admin/gamification", adminLimiter, adminGamificationRoute);
app.use("/api/admin/finance", adminLimiter, adminFinanceRoute);

// Register gamification routes (specific routes first, then consolidated router)
app.use("/api/gamification/leaderboard", gamificationLeaderboardRoute);
app.use("/api/gamification/rewards", gamificationRewardsRoute);
app.use("/api/gamification/referral", gamificationReferralRoute);
app.use("/api/gamification", gamificationRoutes);
app.use("/gamification", gamificationRoutes); // Frontend compatibility

// Register user payout routes
app.use("/api/user/payouts", userPayoutsRoute);

// Register user stats and notifications routes
app.use("/api/user", userStatsRoute);
app.use("/api/user/notifications", userNotificationsRoute);
app.use("/api/user/notification-settings", notificationSettingsRoute);

// Register wallet routes (Phase 4)
app.use("/api/wallet", walletRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Route not found",
    path: req.path,
  });
});

// Sentry error handler - must be before custom error handler
if (process.env.SENTRY_DSN) {
  Sentry.setupExpressErrorHandler(app);
}

// Custom error handler (existing)
app.use(
  (
    err: unknown,
    req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error("❌ Error:", err);
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Internal server error",
    });
  },
);

// Start server
const server = app.listen(PORT, "0.0.0.0", async () => {
  console.log(`✅ Server running on http://0.0.0.0:${PORT}`);
  console.log(`📍 Health: http://0.0.0.0:${PORT}/api/health`);

  // Initialize Redis cache
  const { initRedis } = await import("./lib/cache/redis.js");
  await initRedis();

  // Initialize TON wallet
  const { tonWalletService } = await import("./services/tonWalletService.js");
  await tonWalletService.init();

  // Initialize Phase 4 TON wallet
  const { initWallet } = await import("./services/ton/wallet.js");
  initWallet()
    .then(() => {
      console.log("✅ Phase 4 TON wallet ready");
    })
    .catch((err) => {
      console.error("❌ Phase 4 TON wallet initialization failed:", err);
    });

  // Check deposits every minute (Phase 4)
  if (process.env.ENABLE_DEPOSIT_MONITOR === "true") {
    const { checkDeposits } = await import("./services/ton/deposit.js");
    cron.schedule("* * * * *", async () => {
      await checkDeposits();
    });
    console.log("✅ Deposit monitor enabled");
  }

  // Initialize schedulers after server is fully started
  console.log("🚀 Initializing schedulers...");
  initDrawScheduler();
  initPayoutProcessor();

  // Start Phase 3 draw scheduler if enabled
  if (process.env.ENABLE_DRAW_SCHEDULER === "true") {
    const { startDrawScheduler } =
      await import("./services/scheduler/drawScheduler.js");
    startDrawScheduler();
    console.log("✅ Draw scheduler enabled");
  } else {
    console.log(
      "⏸️  Draw scheduler disabled (set ENABLE_DRAW_SCHEDULER=true to enable)",
    );
  }

  // Start draw reminder scheduler if notifications enabled
  if (process.env.ENABLE_NOTIFICATIONS === "true") {
    const { startDrawReminderScheduler } =
      await import("./services/scheduler/drawReminderScheduler.js");
    startDrawReminderScheduler();
    console.log("✅ Draw reminder scheduler enabled");
  } else {
    console.log(
      "⏸️  Draw reminder scheduler disabled (set ENABLE_NOTIFICATIONS=true to enable)",
    );
  }
});

// Initialize schedulers after server starts
import { initDrawScheduler } from "./lib/scheduler/drawScheduler.js";
import { initPayoutProcessor } from "./lib/payout/payoutProcessor.js";
import cron from "node-cron";

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("👋 SIGTERM received");

  // Close Redis connection
  const { closeRedis } = await import("./lib/cache/redis.js");
  await closeRedis();

  server.close(() => {
    console.log("💤 Server closed");
    process.exit(0);
  });
});

process.on("SIGINT", async () => {
  console.log("👋 SIGINT received");

  // Close Redis connection
  const { closeRedis } = await import("./lib/cache/redis.js");
  await closeRedis();

  server.close(() => {
    console.log("💤 Server closed");
    process.exit(0);
  });
});

// Error handling
process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught Exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});

export default app;
