// Cache strategies for different data types

export type CacheStrategy =
  | "standard"
  | "lottery"
  | "user"
  | "leaderboard"
  | "draw"
  | "statistics";

export interface CacheStrategyConfig {
  ttl: number; // Time to live in seconds
  keyPrefix: string;
  invalidationPattern?: string;
  refreshOnExpiry?: boolean;
}

// Define cache strategies with their configurations
export const cacheStrategies: Record<CacheStrategy, CacheStrategyConfig> = {
  standard: {
    ttl: 300, // 5 minutes
    keyPrefix: "cache:std",
  },
  lottery: {
    ttl: 300, // 5 minutes
    keyPrefix: "cache:lottery",
    invalidationPattern: "cache:lottery:*",
  },
  user: {
    ttl: 600, // 10 minutes
    keyPrefix: "cache:user",
    invalidationPattern: "cache:user:*",
  },
  leaderboard: {
    ttl: 1800, // 30 minutes
    keyPrefix: "cache:leaderboard",
    invalidationPattern: "cache:leaderboard:*",
  },
  draw: {
    ttl: 3600, // 1 hour
    keyPrefix: "cache:draw",
    invalidationPattern: "cache:draw:*",
  },
  statistics: {
    ttl: 1800, // 30 minutes
    keyPrefix: "cache:stats",
    invalidationPattern: "cache:stats:*",
  },
};

// Get strategy configuration
export function getStrategyConfig(
  strategy: CacheStrategy,
): CacheStrategyConfig {
  return cacheStrategies[strategy];
}

// Generate cache key with strategy prefix
export function generateCacheKey(strategy: CacheStrategy, key: string): string {
  const config = getStrategyConfig(strategy);
  return `${config.keyPrefix}:${key}`;
}

// Get invalidation pattern for strategy
export function getInvalidationPattern(strategy: CacheStrategy): string {
  const config = getStrategyConfig(strategy);
  return config.invalidationPattern || `${config.keyPrefix}:*`;
}
