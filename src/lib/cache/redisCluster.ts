import { createCluster } from "redis";

// Redis cluster configuration
const nodeUrls = [
  process.env.REDIS_NODE_1 || process.env.REDIS_URL || "redis://localhost:6379",
  process.env.REDIS_NODE_2,
  process.env.REDIS_NODE_3,
].filter(Boolean) as string[];

// If only one node is configured, fall back to single instance mode
const useCluster = nodeUrls.length > 1;

export const redisCluster = useCluster
  ? createCluster({
      rootNodes: nodeUrls.map((url) => ({ url })),
      defaults: {
        password: process.env.REDIS_PASSWORD,
        socket: {
          connectTimeout: 60000,
        },
      },
      useReplicas: true,
    })
  : null;

// Export cluster status
export const isClusterMode = useCluster;

// Connection state management
let isConnected = false;
let isConnecting = false;

// Event handlers for cluster
if (redisCluster) {
  redisCluster.on("error", (err) => {
    console.error("❌ Redis Cluster Error:", err);
    isConnected = false;
  });

  redisCluster.on("connect", () => {
    console.log("🔄 Redis Cluster Connecting...");
    isConnecting = true;
  });

  redisCluster.on("ready", () => {
    console.log("✅ Redis Cluster Ready");
    isConnected = true;
    isConnecting = false;
  });

  redisCluster.on("end", () => {
    console.log("👋 Redis Cluster Disconnected");
    isConnected = false;
    isConnecting = false;
  });
}

// Initialize Redis cluster connection
export async function initRedisCluster(): Promise<void> {
  if (!useCluster) {
    console.log("⏸️  Redis cluster mode not configured (single instance mode)");
    return;
  }

  if (process.env.ENABLE_REDIS_CACHE !== "true") {
    console.log(
      "⏸️  Redis caching disabled (set ENABLE_REDIS_CACHE=true to enable)",
    );
    return;
  }

  if (isConnected || isConnecting) {
    return;
  }

  try {
    await redisCluster!.connect();
    console.log("✅ Redis cluster initialized successfully");
  } catch (error) {
    console.error("❌ Failed to initialize Redis cluster:", error);
    console.log("⚠️  Continuing without Redis cluster");
  }
}

// Check if cluster is available
export function isClusterAvailable(): boolean {
  return useCluster && isConnected && process.env.ENABLE_REDIS_CACHE === "true";
}

// Graceful shutdown
export async function closeRedisCluster(): Promise<void> {
  if (redisCluster && isConnected) {
    await redisCluster.quit();
  }
}
