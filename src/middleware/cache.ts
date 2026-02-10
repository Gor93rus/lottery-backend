import { Request, Response, NextFunction } from "express";
import { cache } from "../lib/cache/redis.js";

/**
 * Cache TTL configurations (in seconds)
 */
export const CacheTTL = {
  LOTTERY_LIST: parseInt(process.env.CACHE_TTL_LOTTERIES || "300", 10), // 5 minutes
  USER_DATA: parseInt(process.env.CACHE_TTL_USER_DATA || "600", 10), // 10 minutes
  LEADERBOARD: parseInt(process.env.CACHE_TTL_LEADERBOARD || "1800", 10), // 30 minutes
  DRAW_RESULTS: 3600, // 1 hour
  STATISTICS: 1800, // 30 minutes
};

/**
 * Generate cache key for request
 */
function generateCacheKey(req: Request, prefix: string): string {
  const userId = req.user?.userId || "anonymous";
  const query = JSON.stringify(req.query);
  const params = JSON.stringify(req.params);
  return `${prefix}:${userId}:${query}:${params}`;
}

/**
 * Generic caching middleware
 * Caches GET requests based on route and user
 */
export function cacheMiddleware(prefix: string, ttl: number) {
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

    const cacheKey = generateCacheKey(req, prefix);

    try {
      // Try to get from cache
      const cachedData = await cache.get<unknown>(cacheKey);

      if (cachedData) {
        // Cache hit - return cached data
        res.setHeader("X-Cache", "HIT");
        res.json(cachedData);
        return;
      }

      // Cache miss - continue to handler
      res.setHeader("X-Cache", "MISS");

      // Capture the original res.json to cache the response
      const originalJson = res.json.bind(res);
      res.json = function (data: unknown) {
        // Cache the response asynchronously (don't wait)
        cache
          .set(cacheKey, data, ttl)
          .catch((err) => console.error("Failed to cache response:", err));
        return originalJson(data);
      };

      next();
    } catch (error) {
      console.error("Cache middleware error:", error);
      // On error, continue without caching
      next();
    }
  };
}

/**
 * Cache invalidation middleware
 * Invalidates specific cache patterns when data changes
 */
export function invalidateCache(pattern: string) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      // Store original send to invalidate after successful response
      const originalSend = res.send.bind(res);

      res.send = function (data: unknown) {
        // Only invalidate on successful responses (2xx status)
        if (res.statusCode >= 200 && res.statusCode < 300) {
          cache
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
}

/**
 * Set Cache-Control headers for static assets
 */
export function staticCacheHeaders(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Cache static assets for 1 year
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  next();
}

/**
 * Set Cache-Control headers for API responses
 */
export function apiCacheHeaders(maxAge: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    res.setHeader("Cache-Control", `public, max-age=${maxAge}`);
    next();
  };
}

/**
 * Set no-cache headers for sensitive data
 */
export function noCacheHeaders(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  res.setHeader(
    "Cache-Control",
    "private, no-cache, no-store, must-revalidate",
  );
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
}
