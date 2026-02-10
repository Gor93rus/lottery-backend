import rateLimit from "express-rate-limit";
import { Request, Response } from "express";

// Extend Express Request type to include rateLimit info
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      rateLimit?: {
        limit: number;
        current: number;
        remaining: number;
        resetTime?: Date | number;
      };
    }
  }
}

/**
 * Custom error handler for rate limit exceeded
 */
const rateLimitHandler = (req: Request, res: Response) => {
  const resetTime = req.rateLimit?.resetTime;
  const retryAfter = resetTime
    ? Math.ceil(
        (typeof resetTime === "number" ? resetTime : resetTime.getTime()) /
          1000 -
          Date.now() / 1000,
      )
    : 900; // Default to 15 minutes if not available

  res.status(429).json({
    success: false,
    error: "Too Many Requests",
    message: "Rate limit exceeded. Please try again later.",
    retryAfter,
  });
};

/**
 * General API Rate Limiter
 * Applies to all /api/* routes
 * 100 requests per 15 minutes per IP
 */
export const generalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  handler: rateLimitHandler,
  skip: (req) => {
    // Skip rate limiting for health check
    return req.path === "/api/health";
  },
});

/**
 * Auth Rate Limiter (Strict)
 * Applies to /api/auth/* routes
 * 5 requests per 15 minutes per IP
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many authentication attempts, please try again later",
  handler: (req: Request, res: Response) => {
    const resetTime = req.rateLimit?.resetTime;
    const retryAfter = resetTime
      ? Math.ceil(
          (typeof resetTime === "number" ? resetTime : resetTime.getTime()) /
            1000 -
            Date.now() / 1000,
        )
      : 900; // Default to 15 minutes

    res.status(429).json({
      success: false,
      error: "Too Many Requests",
      message: "Too many authentication attempts, please try again later",
      retryAfter,
    });
  },
});

/**
 * Ticket Purchase Rate Limiter
 * Applies to ticket purchase endpoints
 * 10 requests per 1 minute per IP
 */
export const ticketPurchaseLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10, // 10 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many purchase attempts, please slow down",
  handler: (req: Request, res: Response) => {
    const resetTime = req.rateLimit?.resetTime;
    const retryAfter = resetTime
      ? Math.ceil(
          (typeof resetTime === "number" ? resetTime : resetTime.getTime()) /
            1000 -
            Date.now() / 1000,
        )
      : 60; // Default to 1 minute

    res.status(429).json({
      success: false,
      error: "Too Many Requests",
      message: "Too many purchase attempts, please slow down",
      retryAfter,
    });
  },
});

/**
 * Admin Rate Limiter
 * Applies to /api/admin/* routes
 * 200 requests per 15 minutes per IP
 */
export const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // 200 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});
