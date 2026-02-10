import {
  collectDefaultMetrics,
  register,
  Gauge,
  Counter,
  Histogram,
} from "prom-client";

// Enable default metrics (CPU, memory, event loop, etc.)
collectDefaultMetrics({ prefix: "lottery_" });

// Custom application metrics
export const metrics = {
  // HTTP Request metrics
  httpRequestsTotal: new Counter({
    name: "lottery_http_requests_total",
    help: "Total number of HTTP requests",
    labelNames: ["method", "route", "status_code"],
  }),

  httpRequestDuration: new Histogram({
    name: "lottery_http_request_duration_seconds",
    help: "Duration of HTTP requests in seconds",
    labelNames: ["method", "route"],
    buckets: [0.1, 0.5, 1, 2.5, 5, 10],
  }),

  // Business metrics - Ticket operations
  ticketsPurchased: new Counter({
    name: "lottery_tickets_purchased_total",
    help: "Total number of lottery tickets purchased",
    labelNames: ["lottery_id", "currency"],
  }),

  ticketPurchaseAmount: new Counter({
    name: "lottery_ticket_purchase_amount_total",
    help: "Total amount spent on lottery tickets",
    labelNames: ["currency"],
  }),

  // Business metrics - Draw operations
  drawsExecuted: new Counter({
    name: "lottery_draws_executed_total",
    help: "Total number of lottery draws executed",
    labelNames: ["lottery_id", "status"],
  }),

  drawDuration: new Histogram({
    name: "lottery_draw_duration_seconds",
    help: "Duration of lottery draw execution in seconds",
    labelNames: ["lottery_id"],
    buckets: [1, 5, 10, 30, 60, 120],
  }),

  // User metrics
  activeUsers: new Gauge({
    name: "lottery_active_users",
    help: "Number of currently active users (connected in last 5 minutes)",
  }),

  userRegistrations: new Counter({
    name: "lottery_user_registrations_total",
    help: "Total number of user registrations",
    labelNames: ["auth_method"],
  }),

  // System metrics - Cache
  cacheHitRatio: new Gauge({
    name: "lottery_cache_hit_ratio",
    help: "Cache hit ratio (0-1)",
  }),

  cacheOperations: new Counter({
    name: "lottery_cache_operations_total",
    help: "Total number of cache operations",
    labelNames: ["operation", "status"],
  }),

  // System metrics - Database
  dbConnectionPoolSize: new Gauge({
    name: "lottery_db_connection_pool_size",
    help: "Current database connection pool size",
  }),

  dbQueryDuration: new Histogram({
    name: "lottery_db_query_duration_seconds",
    help: "Duration of database queries in seconds",
    labelNames: ["operation", "table"],
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
  }),

  dbErrors: new Counter({
    name: "lottery_db_errors_total",
    help: "Total number of database errors",
    labelNames: ["operation", "error_type"],
  }),

  // System metrics - External services
  tonApiCalls: new Counter({
    name: "lottery_ton_api_calls_total",
    help: "Total number of TON API calls",
    labelNames: ["endpoint", "status"],
  }),

  tonApiDuration: new Histogram({
    name: "lottery_ton_api_duration_seconds",
    help: "Duration of TON API calls in seconds",
    labelNames: ["endpoint"],
    buckets: [0.1, 0.5, 1, 2, 5, 10],
  }),

  // Payout metrics
  payoutsProcessed: new Counter({
    name: "lottery_payouts_processed_total",
    help: "Total number of payouts processed",
    labelNames: ["currency", "status"],
  }),

  payoutAmount: new Counter({
    name: "lottery_payout_amount_total",
    help: "Total amount paid out",
    labelNames: ["currency"],
  }),

  payoutDuration: new Histogram({
    name: "lottery_payout_duration_seconds",
    help: "Duration of payout processing in seconds",
    labelNames: ["currency"],
    buckets: [1, 5, 10, 30, 60, 300],
  }),

  // Gamification metrics
  questsCompleted: new Counter({
    name: "lottery_quests_completed_total",
    help: "Total number of quests completed",
    labelNames: ["quest_type"],
  }),

  achievementsUnlocked: new Counter({
    name: "lottery_achievements_unlocked_total",
    help: "Total number of achievements unlocked",
    labelNames: ["achievement_id"],
  }),

  rewardsDistributed: new Counter({
    name: "lottery_rewards_distributed_total",
    help: "Total number of rewards distributed",
    labelNames: ["reward_type"],
  }),
};

// Export the Prometheus registry
export { register };

// Helper function to update cache metrics
export async function updateCacheMetrics(stats: {
  hits: number;
  misses: number;
}): Promise<void> {
  const total = stats.hits + stats.misses;
  if (total > 0) {
    metrics.cacheHitRatio.set(stats.hits / total);
  }
}

// Helper function to track request duration
export function trackRequestDuration(
  method: string,
  route: string,
  durationMs: number,
): void {
  metrics.httpRequestDuration.labels(method, route).observe(durationMs / 1000);
}

// Helper function to track request count
export function trackRequestCount(
  method: string,
  route: string,
  statusCode: number,
): void {
  metrics.httpRequestsTotal.labels(method, route, statusCode.toString()).inc();
}
