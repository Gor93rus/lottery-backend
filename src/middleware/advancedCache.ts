import { Request, Response, NextFunction } from "express";
import { cacheService, CacheOptions } from "../services/cacheService.js";

/**
 * Advanced caching middleware with strategy support
 */
export const advancedCache = (
  options: CacheOptions & {
    keyGenerator?: (req: Request) => string;
  } = {},
) => {
  const { ttl = 300, keyGenerator, strategy = "standard" } = options;

  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    // Only cache GET requests
    if (req.method !== "GET") {
      next();
      return;
    }

    // Generate cache key
    const key = keyGenerator
      ? keyGenerator(req)
      : `${req.method}:${req.originalUrl || req.path}`;

    try {
      // Try cache first
      const cached = await cacheService.get(key);
      if (cached) {
        res.setHeader("X-Cache", "HIT");
        res.json(cached);
        return;
      }

      // Cache miss
      res.setHeader("X-Cache", "MISS");

      // Store original send method
      const originalJson = res.json.bind(res);

      // Override to cache response
      res.json = function (data: unknown) {
        // Only cache successful responses
        if (res.statusCode >= 200 && res.statusCode < 300) {
          cacheService
            .set(key, data, { ttl, strategy })
            .catch((err) => console.error("Failed to cache response:", err));
        }
        return originalJson(data);
      };

      next();
    } catch (error) {
      console.error("Advanced cache middleware error:", error);
      next();
    }
  };
};

/**
 * Cache invalidation middleware for mutations
 */
export const invalidateCacheOnMutation = (pattern: string) => {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const originalSend = res.send.bind(res);

      res.send = function (data: unknown) {
        // Only invalidate on successful responses (2xx status)
        if (res.statusCode >= 200 && res.statusCode < 300) {
          cacheService
            .invalidatePattern(pattern)
            .catch((err) => console.error("Failed to invalidate cache:", err));
        }
        return originalSend(data);
      };

      next();
    } catch (error) {
      console.error("Cache invalidation middleware error:", error);
      next();
    }
  };
};
