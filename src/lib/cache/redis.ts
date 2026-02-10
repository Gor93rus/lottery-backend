import { createClient } from "redis";

// Create Redis client
export const redisClient = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
  socket: {
    connectTimeout: 60000,
  },
});

// Redis connection state
let isConnected = false;
let isConnecting = false;

// Handle Redis connection errors
redisClient.on("error", (err) => {
  console.error("❌ Redis Client Error:", err);
  isConnected = false;
});

redisClient.on("connect", () => {
  console.log("🔄 Redis Client Connecting...");
  isConnecting = true;
});

redisClient.on("ready", () => {
  console.log("✅ Redis Client Ready");
  isConnected = true;
  isConnecting = false;
});

redisClient.on("end", () => {
  console.log("👋 Redis Client Disconnected");
  isConnected = false;
  isConnecting = false;
});

// Initialize Redis connection
export async function initRedis(): Promise<void> {
  // Skip if caching is disabled
  if (process.env.ENABLE_REDIS_CACHE !== "true") {
    console.log(
      "⏸️  Redis caching disabled (set ENABLE_REDIS_CACHE=true to enable)",
    );
    return;
  }

  // Skip if already connected or connecting
  if (isConnected || isConnecting) {
    return;
  }

  try {
    await redisClient.connect();
    console.log("✅ Redis initialized successfully");
  } catch (error) {
    console.error("❌ Failed to initialize Redis:", error);
    console.log("⚠️  Continuing without Redis cache");
  }
}

// Check if Redis is available
export function isRedisAvailable(): boolean {
  return isConnected && process.env.ENABLE_REDIS_CACHE === "true";
}

// Cache wrapper with graceful fallback
export const cache = {
  /**
   * Get data from cache
   * Returns null if key doesn't exist or Redis is unavailable
   */
  async get<T>(key: string): Promise<T | null> {
    if (!isRedisAvailable()) {
      return null;
    }

    try {
      const data = await redisClient.get(key);
      if (!data) {
        return null;
      }
      return JSON.parse(data) as T;
    } catch (error) {
      console.error("Redis GET error:", error);
      return null;
    }
  },

  /**
   * Set data in cache with TTL
   * Fails silently if Redis is unavailable
   */
  async set<T>(key: string, data: T, ttlSeconds: number): Promise<void> {
    if (!isRedisAvailable()) {
      return;
    }

    try {
      await redisClient.setEx(key, ttlSeconds, JSON.stringify(data));
    } catch (error) {
      console.error("Redis SET error:", error);
      // Fail silently - cache is optional
    }
  },

  /**
   * Delete data from cache
   * Fails silently if Redis is unavailable
   */
  async del(key: string | string[]): Promise<void> {
    if (!isRedisAvailable()) {
      return;
    }

    try {
      if (Array.isArray(key)) {
        if (key.length > 0) {
          // Use spread operator for multiple keys
          await redisClient.del(key);
        }
      } else {
        await redisClient.del(key);
      }
    } catch (error) {
      console.error("Redis DEL error:", error);
      // Fail silently - cache is optional
    }
  },

  /**
   * Invalidate cache keys by pattern
   * Useful for invalidating all related caches
   */
  async invalidatePattern(pattern: string): Promise<void> {
    if (!isRedisAvailable()) {
      return;
    }

    try {
      const keys: string[] = [];
      // Use SCAN to find keys matching pattern
      for await (const key of redisClient.scanIterator({ MATCH: pattern })) {
        // scanIterator yields string keys
        keys.push(String(key));
      }

      if (keys.length > 0) {
        // Delete keys one by one or in batches
        for (const key of keys) {
          await redisClient.del(key);
        }
        console.log(
          `🗑️  Invalidated ${keys.length} cache keys matching: ${pattern}`,
        );
      }
    } catch (error) {
      console.error("Redis pattern invalidation error:", error);
      // Fail silently - cache is optional
    }
  },
};

// Graceful shutdown
export async function closeRedis(): Promise<void> {
  if (isConnected) {
    await redisClient.quit();
  }
}
