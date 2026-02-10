import { Request, Response, NextFunction } from "express";
import {
  trackRequestDuration,
  trackRequestCount,
} from "../lib/monitoring/metrics.js";

/**
 * Middleware to track HTTP request metrics
 */
export const requestMetrics = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const start = Date.now();

  // Capture when response finishes
  res.on("finish", () => {
    const duration = Date.now() - start;
    const route = req.route?.path || req.path;

    // Track request count
    trackRequestCount(req.method, route, res.statusCode);

    // Track request duration
    trackRequestDuration(req.method, route, duration);
  });

  next();
};
