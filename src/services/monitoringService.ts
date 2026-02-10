import { cacheService } from "./cacheService.js";
import {
  metrics,
  register,
  updateCacheMetrics,
} from "../lib/monitoring/metrics.js";

export class MonitoringService {
  /**
   * Get Prometheus metrics in text format
   */
  async getMetrics(): Promise<string> {
    // Update cache metrics before returning
    const cacheStats = await cacheService.getStats();
    await updateCacheMetrics({
      hits: cacheStats.hits,
      misses: cacheStats.misses,
    });

    // Return metrics in Prometheus format
    return register.metrics();
  }

  /**
   * Get metrics as JSON for custom dashboards
   */
  async getMetricsJson(): Promise<unknown> {
    const metricsArray = await register.getMetricsAsJSON();
    return {
      timestamp: new Date().toISOString(),
      metrics: metricsArray,
    };
  }

  /**
   * Get application statistics
   */
  async getApplicationStats(): Promise<{
    cache: unknown;
    uptime: number;
    memory: NodeJS.MemoryUsage;
    timestamp: string;
  }> {
    const cacheStats = await cacheService.getStats();

    return {
      cache: cacheStats,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Record a business event
   */
  recordTicketPurchase(
    lotteryId: string,
    currency: string,
    amount: number,
  ): void {
    metrics.ticketsPurchased.labels(lotteryId, currency).inc();
    metrics.ticketPurchaseAmount.labels(currency).inc(amount);
  }

  /**
   * Record a draw execution
   */
  recordDrawExecution(
    lotteryId: string,
    status: string,
    durationSeconds: number,
  ): void {
    metrics.drawsExecuted.labels(lotteryId, status).inc();
    metrics.drawDuration.labels(lotteryId).observe(durationSeconds);
  }

  /**
   * Record a payout
   */
  recordPayout(
    currency: string,
    status: string,
    amount: number,
    durationSeconds: number,
  ): void {
    metrics.payoutsProcessed.labels(currency, status).inc();
    metrics.payoutAmount.labels(currency).inc(amount);
    metrics.payoutDuration.labels(currency).observe(durationSeconds);
  }

  /**
   * Update active users count
   */
  updateActiveUsers(count: number): void {
    metrics.activeUsers.set(count);
  }

  /**
   * Record user registration
   */
  recordUserRegistration(authMethod: string): void {
    metrics.userRegistrations.labels(authMethod).inc();
  }

  /**
   * Record cache operation
   */
  recordCacheOperation(operation: string, status: string): void {
    metrics.cacheOperations.labels(operation, status).inc();
  }

  /**
   * Record database error
   */
  recordDatabaseError(operation: string, errorType: string): void {
    metrics.dbErrors.labels(operation, errorType).inc();
  }

  /**
   * Record TON API call
   */
  recordTonApiCall(
    endpoint: string,
    status: string,
    durationSeconds: number,
  ): void {
    metrics.tonApiCalls.labels(endpoint, status).inc();
    metrics.tonApiDuration.labels(endpoint).observe(durationSeconds);
  }

  /**
   * Record gamification event
   */
  recordQuestCompleted(questType: string): void {
    metrics.questsCompleted.labels(questType).inc();
  }

  recordAchievementUnlocked(achievementId: string): void {
    metrics.achievementsUnlocked.labels(achievementId).inc();
  }

  recordRewardDistributed(rewardType: string): void {
    metrics.rewardsDistributed.labels(rewardType).inc();
  }
}

// Export singleton instance
export const monitoringService = new MonitoringService();
