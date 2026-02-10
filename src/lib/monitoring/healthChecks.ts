import { cacheService } from "../../services/cacheService.js";
import { prisma } from "../prisma.js";

export interface HealthCheckResult {
  status: "ok" | "error";
  timestamp: string;
  checks?: Array<{
    name: string;
    status: "ok" | "error";
    error?: string;
    duration?: number;
  }>;
}

export const healthChecks = {
  /**
   * Liveness check - basic health check
   * Returns ok if service is running
   */
  async liveness(): Promise<HealthCheckResult> {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
    };
  },

  /**
   * Readiness check - comprehensive health check
   * Checks all critical dependencies
   */
  async readiness(): Promise<HealthCheckResult> {
    const checkPromises = [this.checkDatabase(), this.checkRedis()];

    const checkNames = ["database", "redis"];
    const results = await Promise.allSettled(checkPromises);

    const checks = results.map((result, i) => {
      if (result.status === "rejected") {
        return {
          name: checkNames[i],
          status: "error" as const,
          error: result.reason?.message || "Unknown error",
        };
      }
      return {
        name: checkNames[i],
        status: "ok" as const,
        duration: result.value?.duration,
      };
    });

    const hasErrors = checks.some((c) => c.status === "error");

    return {
      status: hasErrors ? "error" : "ok",
      timestamp: new Date().toISOString(),
      checks,
    };
  },

  /**
   * Check database connectivity
   */
  async checkDatabase(): Promise<{ duration: number }> {
    const start = Date.now();
    try {
      await prisma.$queryRaw`SELECT 1`;
      const duration = Date.now() - start;
      return { duration };
    } catch (error) {
      throw new Error(
        `Database check failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  },

  /**
   * Check Redis connectivity
   */
  async checkRedis(): Promise<{ duration: number }> {
    const start = Date.now();
    try {
      // Try to get a health check key (will return null if doesn't exist)
      await cacheService.get("health:check");
      const duration = Date.now() - start;
      return { duration };
    } catch (error) {
      throw new Error(
        `Redis check failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  },

  /**
   * Startup check - run during application startup
   * Ensures all critical services are available
   */
  async startup(): Promise<HealthCheckResult> {
    return this.readiness();
  },
};
