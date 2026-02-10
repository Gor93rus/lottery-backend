import { Router } from "express";
import { healthChecks } from "../lib/monitoring/healthChecks.js";
import { monitoringService } from "../services/monitoringService.js";
import { register } from "../lib/monitoring/metrics.js";

const router = Router();

// Liveness probe - basic health check
router.get("/", async (_req, res) => {
  try {
    const result = await healthChecks.liveness();
    res.json({
      success: true,
      message: "API is healthy",
      ...result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Health check failed",
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// Readiness probe - comprehensive health check
router.get("/ready", async (_req, res) => {
  try {
    const result = await healthChecks.readiness();

    if (result.status === "error") {
      res.status(503).json({
        success: false,
        message: "Service not ready",
        ...result,
      });
    } else {
      res.json({
        success: true,
        message: "Service is ready",
        ...result,
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Readiness check failed",
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// Metrics endpoint for Prometheus
router.get("/metrics", async (_req, res) => {
  try {
    res.set("Content-Type", register.contentType);
    const metrics = await monitoringService.getMetrics();
    res.send(metrics);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to collect metrics",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

export default router;
