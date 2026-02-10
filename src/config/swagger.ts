import swaggerJsdoc from "swagger-jsdoc";

// Default production URL - used as fallback when RENDER_EXTERNAL_URL and PRODUCTION_URL are not set
// Update this if the primary deployment URL changes
const DEFAULT_PRODUCTION_URL = "https://lottery-backend-gm4j.onrender.com";

// Determine API paths based on environment
const apiPaths =
  process.env.NODE_ENV === "production"
    ? ["./dist/api/*.js", "./dist/api/**/*.js"]
    : ["./src/api/*.ts", "./src/api/**/*.ts"];

// Get dynamic server URL based on environment
const getServerUrl = () => {
  // Production on Render (Render sets this automatically)
  if (process.env.RENDER_EXTERNAL_URL) {
    const url = process.env.RENDER_EXTERNAL_URL;
    // Validate HTTPS in production
    if (process.env.NODE_ENV === "production" && !url.startsWith("https://")) {
      console.warn(
        "⚠️ RENDER_EXTERNAL_URL should use HTTPS in production:",
        url,
      );
    }
    return url;
  }
  // Custom production URL from environment variable
  if (process.env.PRODUCTION_URL) {
    const url = process.env.PRODUCTION_URL;
    // Validate HTTPS in production
    if (process.env.NODE_ENV === "production" && !url.startsWith("https://")) {
      console.warn("⚠️ PRODUCTION_URL should use HTTPS in production:", url);
    }
    return url;
  }
  // Production URL hardcoded as fallback
  if (process.env.NODE_ENV === "production") {
    return DEFAULT_PRODUCTION_URL;
  }
  // Development
  return `http://localhost:${process.env.PORT || 3001}`;
};

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Weekend Millions API",
      version: "1.0.0",
      description: "API documentation for Weekend Millions lottery platform",
      contact: {
        name: "Support",
        url: "https://t.me/weekend_millions_support",
      },
    },
    servers: [
      {
        url: getServerUrl(),
        description:
          process.env.NODE_ENV === "production"
            ? "Production Server"
            : "Development Server",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "JWT Authorization header",
        },
      },
      schemas: {
        Error: {
          type: "object",
          properties: {
            success: { type: "boolean", example: false },
            error: { type: "string" },
          },
        },
        Lottery: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            slug: { type: "string" },
            description: { type: "string" },
            price: { type: "number" },
            prizePool: { type: "number" },
            maxNumber: { type: "integer" },
            pickCount: { type: "integer" },
            drawTime: { type: "string", format: "date-time" },
            status: { type: "string", enum: ["active", "closed", "completed"] },
          },
        },
        Ticket: {
          type: "object",
          properties: {
            id: { type: "string" },
            numbers: { type: "array", items: { type: "integer" } },
            lotteryId: { type: "string" },
            userId: { type: "string" },
            txHash: { type: "string" },
            status: {
              type: "string",
              enum: ["pending", "confirmed", "won", "lost"],
            },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        User: {
          type: "object",
          properties: {
            id: { type: "string" },
            telegramId: { type: "string" },
            username: { type: "string" },
            walletAddress: { type: "string" },
            level: { type: "integer" },
            xp: { type: "integer" },
            createdAt: { type: "string", format: "date-time" },
          },
        },
      },
    },
    tags: [
      { name: "Auth", description: "Authentication endpoints" },
      { name: "Lotteries", description: "Lottery management" },
      { name: "Tickets", description: "Ticket operations" },
      { name: "Users", description: "User management" },
      { name: "Draws", description: "Draw results and verification" },
      { name: "Gamification", description: "Levels, achievements, rewards" },
      {
        name: "Admin - Finance",
        description: "Financial management for administrators",
      },
    ],
  },
  apis: apiPaths,
};

export const swaggerSpec = swaggerJsdoc(options);
