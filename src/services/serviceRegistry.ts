export interface ServiceDefinition {
  name: string;
  url: string;
  healthCheck: string;
  routes: string[];
}

export class ServiceRegistry {
  private services: Map<string, ServiceDefinition> = new Map();

  /**
   * Register a service
   */
  register(service: ServiceDefinition): void {
    this.services.set(service.name, service);
    console.log(`📝 Registered service: ${service.name} at ${service.url}`);
  }

  /**
   * Get a service by name
   */
  getService(name: string): ServiceDefinition | undefined {
    return this.services.get(name);
  }

  /**
   * Get a healthy service instance
   * Performs health check before returning
   */
  async getHealthyService(name: string): Promise<ServiceDefinition | null> {
    const service = this.services.get(name);
    if (!service) {
      console.warn(`⚠️  Service ${name} not found in registry`);
      return null;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      const response = await fetch(`${service.url}${service.healthCheck}`, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        return service;
      } else {
        console.warn(
          `⚠️  Service ${name} health check returned status ${response.status}`,
        );
        return null;
      }
    } catch (error) {
      console.error(
        `❌ Service ${name} health check failed:`,
        error instanceof Error ? error.message : "Unknown error",
      );
      return null;
    }
  }

  /**
   * Get all registered services
   */
  getAllServices(): ServiceDefinition[] {
    return Array.from(this.services.values());
  }

  /**
   * Find which service handles a given route
   */
  findServiceForRoute(path: string): ServiceDefinition | undefined {
    for (const service of this.services.values()) {
      if (service.routes.some((route) => path.startsWith(route))) {
        return service;
      }
    }
    return undefined;
  }

  /**
   * Unregister a service
   */
  unregister(name: string): boolean {
    const deleted = this.services.delete(name);
    if (deleted) {
      console.log(`🗑️  Unregistered service: ${name}`);
    }
    return deleted;
  }

  /**
   * Check health of all services
   */
  async checkAllServices(): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();

    const checks = Array.from(this.services.keys()).map(async (name) => {
      const healthy = await this.getHealthyService(name);
      results.set(name, healthy !== null);
    });

    await Promise.all(checks);
    return results;
  }
}

// Export singleton instance
export const serviceRegistry = new ServiceRegistry();

// Register default services (can be overridden by environment variables)
if (process.env.LOTTERY_SERVICE_URL) {
  serviceRegistry.register({
    name: "lottery-service",
    url: process.env.LOTTERY_SERVICE_URL,
    healthCheck: "/health",
    routes: ["/api/lottery", "/api/draws"],
  });
}

if (process.env.USER_SERVICE_URL) {
  serviceRegistry.register({
    name: "user-service",
    url: process.env.USER_SERVICE_URL,
    healthCheck: "/health",
    routes: ["/api/user", "/api/auth"],
  });
}

if (process.env.NOTIFICATION_SERVICE_URL) {
  serviceRegistry.register({
    name: "notification-service",
    url: process.env.NOTIFICATION_SERVICE_URL,
    healthCheck: "/health",
    routes: ["/api/notifications"],
  });
}
