import { TonClient, Address } from "@ton/ton";
import { getHttpEndpoint } from "@orbs-network/ton-access";

const TON_NETWORK = (process.env.TON_NETWORK || "testnet") as
  | "mainnet"
  | "testnet";
const LOTTERY_WALLET = process.env.LOTTERY_WALLET || "";

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

interface RateLimitState {
  requestCount: number;
  resetTime: number;
  backoffMultiplier: number;
  isLimited: boolean;
}

class TonClientManager {
  private tonClient: TonClient | null = null;
  private cache: Map<string, CacheEntry<any>> = new Map();
  private rateLimitState: RateLimitState = {
    requestCount: 0,
    resetTime: 0,
    backoffMultiplier: 1,
    isLimited: false,
  };

  private readonly DEFAULT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly BALANCE_CACHE_TTL = 2 * 60 * 1000; // 2 minutes for balances
  private readonly RATE_LIMIT_THRESHOLD = 100;
  private readonly TIME_WINDOW = 60 * 1000; // 1 minute
  private readonly MAX_BACKOFF = 30 * 1000; // 30 seconds

  /**
   * Initialize TON client
   */
  async initTonClient(): Promise<TonClient> {
    if (this.tonClient) {
      return this.tonClient;
    }

    try {
      const endpoint = await getHttpEndpoint({ network: TON_NETWORK });
      this.tonClient = new TonClient({ endpoint });

      console.log(`✅ TON client initialized with caching (${TON_NETWORK})`);
      return this.tonClient;
    } catch (error) {
      console.error("Failed to initialize TON client:", error);
      throw new Error("Failed to connect to TON network");
    }
  }

  /**
   * Get cached value
   */
  private getCache<T>(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) return null;

    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  /**
   * Set cache value
   */
  private setCache<T>(
    key: string,
    data: T,
    ttl: number = this.DEFAULT_CACHE_TTL,
  ): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
    });
  }

  /**
   * Invalidate cache
   */
  invalidateCache(pattern?: string): void {
    if (!pattern) {
      this.cache.clear();
      console.log("🗑️ Cache cleared");
      return;
    }

    let count = 0;
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
        count++;
      }
    }
    console.log(
      `🗑️ Cleared ${count} cache entries matching pattern: ${pattern}`,
    );
  }

  /**
   * Check and apply rate limiting
   */
  private async checkRateLimit(): Promise<void> {
    const now = Date.now();

    if (now > this.rateLimitState.resetTime) {
      this.rateLimitState.requestCount = 0;
      this.rateLimitState.resetTime = now + this.TIME_WINDOW;
      this.rateLimitState.backoffMultiplier = 1;
      this.rateLimitState.isLimited = false;
    }

    if (this.rateLimitState.requestCount >= this.RATE_LIMIT_THRESHOLD) {
      this.rateLimitState.isLimited = true;

      const backoffTime = Math.min(
        this.rateLimitState.backoffMultiplier * 1000,
        this.MAX_BACKOFF,
      );

      console.warn(
        `⚠️ TON RPC Rate Limited. Backoff: ${backoffTime}ms. Multiplier: ${this.rateLimitState.backoffMultiplier}x`,
      );

      this.rateLimitState.backoffMultiplier = Math.min(
        this.rateLimitState.backoffMultiplier * 2,
        16,
      );

      await new Promise((resolve) => setTimeout(resolve, backoffTime));
    }

    this.rateLimitState.requestCount++;
  }

  /**
   * Handle rate limit error
   */
  private handleRateLimitError(): void {
    this.rateLimitState.isLimited = true;
    this.rateLimitState.backoffMultiplier = Math.min(
      this.rateLimitState.backoffMultiplier * 2,
      16,
    );
    this.rateLimitState.resetTime = Date.now() + this.TIME_WINDOW;

    console.warn(
      `📛 429 Error! Backoff multiplier increased to ${this.rateLimitState.backoffMultiplier}x`,
    );
  }

  /**
   * Retry logic with exponential backoff
   */
  private async retryWithBackoff<T>(
    fn: () => Promise<T>,
    retries = 3,
    delay = 1000,
  ): Promise<T> {
    try {
      await this.checkRateLimit();
      return await fn();
    } catch (error: any) {
      if (
        error?.message?.includes("429") ||
        error?.message?.includes("Too Many Requests")
      ) {
        this.handleRateLimitError();
      }

      if (retries > 0) {
        console.warn(
          `⚠️ Request failed, retrying in ${delay}ms. Retries left: ${retries}`,
          error?.message,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.retryWithBackoff(fn, retries - 1, delay * 1.5);
      }

      throw error;
    }
  }

  /**
   * Get TON client with caching
   */
  async getTonClient(): Promise<TonClient> {
    if (!this.tonClient) {
      return await this.initTonClient();
    }
    return this.tonClient;
  }

  /**
   * Get balance with caching
   */
  async getBalance(address: string): Promise<number> {
    const cacheKey = `balance-${address}`;

    const cached = this.getCache<number>(cacheKey);
    if (cached !== null) {
      console.log(`📦 Using cached balance for ${address.slice(0, 6)}...`);
      return cached;
    }

    return await this.retryWithBackoff(async () => {
      const client = await this.getTonClient();
      const addr = Address.parse(address);

      const balance = await client.getBalance(addr);
      const tonBalance = Number(balance) / 1e9;

      // Cache with 2-minute TTL
      this.setCache(cacheKey, tonBalance, this.BALANCE_CACHE_TTL);

      return tonBalance;
    });
  }

  /**
   * Get lottery balance with caching
   */
  async getLotteryBalance(): Promise<number> {
    if (!LOTTERY_WALLET) {
      console.error("LOTTERY_WALLET not configured");
      return 0;
    }

    const cacheKey = "lottery-balance";

    const cached = this.getCache<number>(cacheKey);
    if (cached !== null) {
      console.log(`📦 Using cached lottery balance`);
      return cached;
    }

    try {
      return await this.retryWithBackoff(async () => {
        const lotteryAddress = Address.parse(LOTTERY_WALLET);
        const client = await this.getTonClient();

        const balance = await client.getBalance(lotteryAddress);
        const tonBalance = Number(balance) / 1e9;

        // Cache with 2-minute TTL
        this.setCache(cacheKey, tonBalance, this.BALANCE_CACHE_TTL);

        return tonBalance;
      });
    } catch (error) {
      console.error("Failed to get lottery balance:", error);
      return 0;
    }
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      cacheSize: this.cache.size,
      isRateLimited: this.rateLimitState.isLimited,
      backoffMultiplier: this.rateLimitState.backoffMultiplier,
      requestCount: this.rateLimitState.requestCount,
      resetTime: new Date(this.rateLimitState.resetTime),
    };
  }
}

// Export singleton instance
const tonClientManager = new TonClientManager();

/**
 * Initialize TON client
 */
export async function initTonClient(): Promise<TonClient> {
  return tonClientManager.initTonClient();
}

/**
 * Get TON client instance
 */
export async function getTonClient(): Promise<TonClient> {
  return tonClientManager.getTonClient();
}

/**
 * Get lottery wallet address
 */
export function getLotteryWallet(): Address {
  if (!LOTTERY_WALLET) {
    throw new Error("LOTTERY_WALLET not configured");
  }
  return Address.parse(LOTTERY_WALLET);
}

/**
 * Verify transaction on TON blockchain
 * @param txHash Transaction hash to verify
 * @param expectedAmount Expected amount in TON
 * @param expectedSender Expected sender address
 */
export async function verifyTransaction(
  txHash: string,
  expectedAmount: number,
  expectedSender?: string,
): Promise<boolean> {
  try {
    // TODO: Implement actual blockchain verification
    console.log("Verifying transaction:", {
      txHash,
      expectedAmount,
      expectedSender,
    });

    return true; // Placeholder
  } catch (error) {
    console.error("Transaction verification failed:", error);
    return false;
  }
}

/**
 * Get account balance with caching
 * @param address TON wallet address
 */
export async function getBalance(address: string): Promise<number> {
  return tonClientManager.getBalance(address);
}

/**
 * Verify wallet address is valid
 */
export function isValidAddress(address: string): boolean {
  try {
    Address.parse(address);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get lottery wallet balance with caching
 */
export async function getLotteryBalance(): Promise<number> {
  return tonClientManager.getLotteryBalance();
}

/**
 * Format TON amount for display
 */
export function formatTON(amount: number): string {
  return `${amount.toFixed(2)} TON`;
}

/**
 * Invalidate cache entries
 */
export function invalidateTonCache(pattern?: string): void {
  tonClientManager.invalidateCache(pattern);
}

/**
 * Get cache statistics
 */
export function getTonStats() {
  return tonClientManager.getStats();
}

export default {
  initTonClient,
  getTonClient,
  getLotteryWallet,
  verifyTransaction,
  getBalance,
  isValidAddress,
  getLotteryBalance,
  formatTON,
  invalidateTonCache,
  getTonStats,
};
