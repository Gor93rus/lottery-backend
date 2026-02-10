import { Request, Response } from "express";
import {
  serviceRegistry,
  ServiceDefinition,
} from "../../services/serviceRegistry.js";

export class ApiGateway {
  /**
   * Route a request to the appropriate microservice
   */
  async routeRequest(req: Request, res: Response): Promise<void> {
    const path = req.path;

    // Find which service handles this route
    const service = serviceRegistry.findServiceForRoute(path);

    if (!service) {
      res.status(404).json({
        error: "Route not found",
        message: `No service registered for path: ${path}`,
      });
      return;
    }

    // Check if service is healthy
    const healthyService = await serviceRegistry.getHealthyService(
      service.name,
    );

    if (!healthyService) {
      res.status(503).json({
        error: "Service unavailable",
        message: `Service ${service.name} is not available`,
      });
      return;
    }

    // Proxy request to service
    await this.proxyToService(healthyService, req, res);
  }

  /**
   * Proxy request to a specific service
   */
  private async proxyToService(
    service: ServiceDefinition,
    req: Request,
    res: Response,
  ): Promise<void> {
    try {
      // Construct target URL
      const queryString = req.url.includes("?")
        ? req.url.substring(req.url.indexOf("?"))
        : "";
      const url = `${service.url}${req.path}${queryString}`;

      // Prepare request options
      const options: RequestInit = {
        method: req.method,
        headers: this.filterHeaders(req.headers),
      };

      // Add body for mutations
      if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
        options.body = JSON.stringify(req.body);
      }

      // Make request to service
      const response = await fetch(url, options);

      // Forward response status
      res.status(response.status);

      // Forward response headers (filter out problematic ones)
      response.headers.forEach((value, key) => {
        if (!this.shouldSkipHeader(key)) {
          res.setHeader(key, value);
        }
      });

      // Forward response body
      const data = await response.text();
      res.send(data);
    } catch (error) {
      console.error(`Proxy error for service ${service.name}:`, error);
      res.status(502).json({
        error: "Bad gateway",
        message: "Failed to communicate with upstream service",
      });
    }
  }

  /**
   * Filter and forward only allowed headers
   */
  private filterHeaders(
    headers: Record<string, unknown>,
  ): Record<string, string> {
    const filtered: Record<string, string> = {};
    const allowedHeaders = [
      "content-type",
      "authorization",
      "x-user-id",
      "x-request-id",
      "x-forwarded-for",
      "user-agent",
      "accept",
      "accept-encoding",
      "accept-language",
    ];

    for (const [key, value] of Object.entries(headers)) {
      const lowerKey = key.toLowerCase();
      if (allowedHeaders.includes(lowerKey)) {
        filtered[key] = String(value);
      }
    }

    return filtered;
  }

  /**
   * Check if header should be skipped when forwarding response
   */
  private shouldSkipHeader(key: string): boolean {
    const skipHeaders = [
      "content-encoding",
      "transfer-encoding",
      "connection",
      "keep-alive",
    ];
    return skipHeaders.includes(key.toLowerCase());
  }

  /**
   * Health check for API Gateway
   */
  async healthCheck(): Promise<{
    status: string;
    services: Array<{ name: string; healthy: boolean }>;
  }> {
    const serviceHealth = await serviceRegistry.checkAllServices();
    const services = Array.from(serviceHealth.entries()).map(
      ([name, healthy]) => ({
        name,
        healthy,
      }),
    );

    const allHealthy = services.every((s) => s.healthy);

    return {
      status: allHealthy ? "healthy" : "degraded",
      services,
    };
  }
}

// Export singleton instance
export const apiGateway = new ApiGateway();
