import * as Sentry from "@sentry/node";

/**
 * Initialize Sentry error tracking
 * Should be called before any other code runs
 */
export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;

  if (!dsn) {
    console.warn("⚠️ SENTRY_DSN not set - error tracking disabled");
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || "development",
    release: "1.0.0", // Match package.json version

    // Performance monitoring - sample 10% in production, 100% in dev
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

    // Filter sensitive data before sending
    beforeSend(event) {
      // Remove sensitive headers
      if (event.request?.headers) {
        delete event.request.headers["authorization"];
        delete event.request.headers["cookie"];
        delete event.request.headers["x-api-key"];
      }

      // Remove sensitive body data
      if (event.request?.data) {
        try {
          const data =
            typeof event.request.data === "string"
              ? JSON.parse(event.request.data)
              : event.request.data;

          // Redact sensitive fields
          if (data.hash) data.hash = "[REDACTED]";
          if (data.token) data.token = "[REDACTED]";
          if (data.password) data.password = "[REDACTED]";

          event.request.data = JSON.stringify(data);
        } catch (e) {
          // If parsing fails, leave data as is
        }
      }

      return event;
    },

    // Ignore known non-critical errors
    ignoreErrors: [
      "Rate limit exceeded",
      "Invalid authentication data",
      "Authentication data expired",
      "Route not found",
    ],
  });

  console.log("✅ Sentry error tracking initialized");
}

/**
 * Capture an exception with additional context
 */
export function captureError(
  error: Error,
  context?: {
    tags?: Record<string, string>;
    extra?: Record<string, unknown>;
    user?: { id: string; telegramId?: string };
  },
): void {
  if (context?.user) {
    Sentry.setUser({
      id: context.user.id,
    });

    // Add telegramId as extra context if provided
    if (context.user.telegramId) {
      if (!context.extra) {
        context.extra = {};
      }
      context.extra.telegramId = context.user.telegramId;
    }
  }

  Sentry.captureException(error, {
    tags: context?.tags,
    extra: context?.extra,
  });
}

/**
 * Capture a message (for warnings, info)
 */
export function captureMessage(
  message: string,
  level: "info" | "warning" | "error" = "info",
  extra?: Record<string, unknown>,
): void {
  Sentry.captureMessage(message, {
    level,
    extra,
  });
}

// Re-export Sentry for advanced usage
export { Sentry };
