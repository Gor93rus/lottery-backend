import { redisClient } from "../lib/cache/redis.js";
import { redisCluster, isClusterAvailable } from "../lib/cache/redisCluster.js";
import {
  CacheStrategy,
  getStrategyConfig,
  generateCacheKey,
  getInvalidationPattern,
} from "../lib/cache/cacheStrategies.js";

export interface CacheOptions {
  ttl?: number;
  strategy?: CacheStrategy;
}

export interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  memoryUsed: string;
  connectedClients: number;
}

/**
 * Centralized cache service with support for both single Redis instance and cluster
 */
export class CacheService {
  private client: typeof redisClient | typeof redisCluster;

  constructor() {
    // Use cluster if available, otherwise fall back to single instance
    this.client =
      isClusterAvailable() && redisCluster ? redisCluster : redisClient;
  }

  /**
   * Get data from cache
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      if (!this.isAvailable() || !this.client) {
        return null;
      }

      const data = await this.client.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error("Cache get error:", error);
      return null;
    }
  }

  /**
   * Set data in cache with optional strategy
   */
  async set<T>(
    key: string,
    data: T,
    options: CacheOptions = {},
  ): Promise<void> {
    const { ttl = 300, strategy = "standard" } = options;

    try {
      if (!this.isAvailable() || !this.client) {
        return;
      }

      const strategyConfig = getStrategyConfig(strategy);
      const finalTtl = ttl || strategyConfig.ttl;
      const finalKey =
        strategy === "standard" ? key : generateCacheKey(strategy, key);

      const serialized = JSON.stringify(data);
      await this.client.setEx(finalKey, finalTtl, serialized);

      // Add to strategy-specific set for batch operations
      if (strategy !== "standard") {
        await this.client.sAdd(`cache:${strategy}:keys`, finalKey);
      }
    } catch (error) {
      console.error("Cache set error:", error);
    }
  }

  /**
   * Delete data from cache
   */
  async del(key: string | string[]): Promise<void> {
    try {
      if (!this.isAvailable() || !this.client) {
        return;
      }

      if (Array.isArray(key)) {
        if (key.length > 0) {
          await this.client.del(key);
        }
      } else {
        await this.client.del(key);
      }
    } catch (error) {
      console.error("Cache del error:", error);
    }
  }

  /**
   * Invalidate cache keys by pattern
   */
  async invalidatePattern(pattern: string): Promise<void> {
    try {
      if (!this.isAvailable() || !this.client) {
        return;
      }

      const keys: string[] = [];
      // Type-safe scan iterator
      const scanner = this.client.scanIterator as (options: {
        MATCH: string;
      }) => AsyncIterableIterator<string>;
      const iterator = scanner({ MATCH: pattern });

      for await (const key of iterator) {
        keys.push(String(key));
      }

      if (keys.length > 0) {
        await this.client.del(keys);
        console.log(
          `🗑️  Invalidated ${keys.length} cache keys matching: ${pattern}`,
        );
      }
    } catch (error) {
      console.error("Cache pattern invalidation error:", error);
    }
  }

  /**
   * Invalidate cache by strategy
   */
  async invalidateStrategy(strategy: CacheStrategy): Promise<void> {
    const pattern = getInvalidationPattern(strategy);
    await this.invalidatePattern(pattern);
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats> {
    try {
      if (!this.isAvailable() || !this.client) {
        return {
          hits: 0,
          misses: 0,
          evictions: 0,
          memoryUsed: "0",
          connectedClients: 0,
        };
      }

      const info = await this.client.info("stats");
      return this.parseRedisStats(info);
    } catch (error) {
      console.error("Cache stats error:", error);
      return {
        hits: 0,
        misses: 0,
        evictions: 0,
        memoryUsed: "0",
        connectedClients: 0,
      };
    }
  }

  /**
   * Check if cache is available
   */
  private isAvailable(): boolean {
    return process.env.ENABLE_REDIS_CACHE === "true";
  }

  /**
   * Parse Redis INFO stats
   */
  private parseRedisStats(info: string): CacheStats {
    const lines = info.split("\r\n");
    const stats: Record<string, string> = {};

    for (const line of lines) {
      if (line.includes(":")) {
        const [key, value] = line.split(":");
        stats[key] = value;
      }
    }

    return {
      hits: parseInt(stats.keyspace_hits || "0", 10),
      misses: parseInt(stats.keyspace_misses || "0", 10),
      evictions: parseInt(stats.evicted_keys || "0", 10),
      memoryUsed: stats.used_memory_human || "0",
      connectedClients: parseInt(stats.connected_clients || "0", 10),
    };
  }

  /**
   * Flush all cache data (use with caution!)
   */
  async flushAll(): Promise<void> {
    try {
      if (!this.isAvailable() || !this.client) {
        return;
      }

      await this.client.flushAll();
      console.log("🗑️  Flushed all cache data");
    } catch (error) {
      console.error("Cache flush error:", error);
    }
  }

  /**
   * Get multiple keys at once (batch operation)
   */
  async mGet<T>(keys: string[]): Promise<(T | null)[]> {
    try {
      if (!this.isAvailable() || !this.client || keys.length === 0) {
        return keys.map(() => null);
      }

      const values = await this.client.mGet(keys);
      return values.map((v) => (v ? JSON.parse(v) : null));
    } catch (error) {
      console.error("Cache mGet error:", error);
      return keys.map(() => null);
    }
  }

  /**
   * Set multiple keys at once (batch operation)
   */
  async mSet(
    entries: Array<{ key: string; value: unknown; options?: CacheOptions }>,
  ): Promise<void> {
    try {
      if (!this.isAvailable() || entries.length === 0) {
        return;
      }

      // Set each entry with its own TTL
      const promises = entries.map(({ key, value, options = {} }) =>
        this.set(key, value, options),
      );

      await Promise.all(promises);
    } catch (error) {
      console.error("Cache mSet error:", error);
    }
  }
}

// Export singleton instance
export const cacheService = new CacheService();
