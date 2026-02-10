import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Enhanced Prisma client with connection pooling and monitoring
 */
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/**
 * Initialize database connection
 */
export async function initDatabase(): Promise<void> {
  try {
    await prisma.$connect();
    console.log("✅ Database connected");
  } catch (error) {
    console.error("❌ Database connection failed:", error);
    process.exit(1);
  }
}

/**
 * Close database connection
 */
export async function closeDatabase(): Promise<void> {
  await prisma.$disconnect();
  console.log("👋 Database disconnected");
}

/**
 * Get database connection status
 */
export async function getDatabaseStatus(): Promise<{
  connected: boolean;
  version?: string;
  error?: string;
}> {
  try {
    const result = await prisma.$queryRaw<
      Array<{ version: string }>
    >`SELECT version()`;
    return {
      connected: true,
      version: result[0]?.version,
    };
  } catch (error) {
    return {
      connected: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Get connection pool statistics
 */
export function getConnectionPoolStats(): {
  poolSize: number;
  activeConnections: number;
} {
  // Prisma doesn't expose pool stats directly, but we can estimate
  // based on configuration
  const poolSize = parseInt(process.env.DATABASE_POOL_SIZE || "10", 10);

  return {
    poolSize,
    activeConnections: 0, // Would need custom instrumentation
  };
}
