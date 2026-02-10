import { Router, Request, Response } from "express";
import { prisma } from "../../lib/prisma.js";
import { generateToken } from "../../lib/auth/middleware.js";
import { sendWelcomeMessage } from "../../lib/telegram/bot.js";
import {
  verifyTelegramAuth,
  isAuthDataFresh,
  verifyTelegramWebAppData,
  parseTelegramInitData,
  TelegramWebAppData,
} from "../../lib/auth/telegramAuth.js";

const router = Router();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

interface TelegramAuthData {
  id: string;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

/**
 * @swagger
 * /api/auth/telegram:
 *   post:
 *     summary: Authenticate via Telegram WebApp
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - initData
 *             properties:
 *               initData:
 *                 type: string
 *                 description: Telegram WebApp initData
 *     responses:
 *       200:
 *         description: Authentication successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 token:
 *                   type: string
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       401:
 *         description: Invalid credentials
 */

/**
 * POST /api/auth/telegram
 * Login or register user via Telegram
 */
router.post("/", async (req: Request, res: Response) => {
  try {
    const authData: TelegramAuthData = req.body;

    // Validate required fields
    if (!authData.id) {
      res.status(400).json({
        error: "Bad Request",
        message: "Missing required field: id",
      });
      return;
    }

    if (!authData.hash) {
      res.status(400).json({
        error: "Bad Request",
        message: "Missing required field: hash",
      });
      return;
    }

    if (!authData.auth_date) {
      res.status(400).json({
        error: "Bad Request",
        message: "Missing required field: auth_date",
      });
      return;
    }

    // Validate auth_date type
    if (typeof authData.auth_date !== "number") {
      res.status(400).json({
        error: "Bad Request",
        message: "Invalid auth_date format: must be a number",
      });
      return;
    }

    // Check bot token configuration
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const isProduction =
      process.env.NODE_ENV?.trim().toLowerCase() === "production";

    if (!botToken) {
      if (isProduction) {
        console.error("TELEGRAM_BOT_TOKEN not configured in production");
        res.status(500).json({
          error: "Internal Server Error",
          message: "Server configuration error",
        });
        return;
      } else {
        console.warn(
          "TELEGRAM_BOT_TOKEN not set - skipping auth verification in development",
        );
      }
    }

    // Check auth_date freshness first - fail fast before expensive hash verification
    // Default: 24 hours (86400 seconds) - see isAuthDataFresh() in telegramAuth.ts
    if (!isAuthDataFresh(authData.auth_date)) {
      console.warn(
        "Failed Telegram auth attempt - expired or future auth_date",
        {
          telegramId: authData.id,
          username: authData.username,
          timestamp: new Date().toISOString(),
        },
      );
      res.status(401).json({
        error: "Unauthorized",
        message: "Authentication data expired",
      });
      return;
    }

    // Verify hash if bot token is available
    if (botToken) {
      const isHashValid = verifyTelegramAuth(authData, botToken);
      if (!isHashValid) {
        console.warn("Failed Telegram auth attempt - invalid hash", {
          telegramId: authData.id,
          username: authData.username,
          timestamp: new Date().toISOString(),
        });
        res.status(401).json({
          error: "Unauthorized",
          message: "Invalid authentication data",
        });
        return;
      }
    }

    const telegramId = authData.id.toString();

    // Find or create user
    let user = await prisma.user.findUnique({
      where: { telegramId },
    });

    let isNewUser = false;

    if (!user) {
      // Create new user
      user = await prisma.user.create({
        data: {
          telegramId,
          username: authData.username,
          firstName: authData.first_name,
          lastName: authData.last_name,
          photoUrl: authData.photo_url,
          lastActiveAt: new Date(),
        },
      });

      isNewUser = true;

      // Send welcome message
      await sendWelcomeMessage(telegramId, authData.first_name);

      // Process gamification for new user registration
      try {
        const { processUserRegistration } =
          await import("../../services/gamificationService.js");
        await processUserRegistration(user.id);
      } catch (gamificationError) {
        console.error("Gamification registration error:", gamificationError);
        // Don't fail the registration if gamification fails
      }
    } else {
      // Update last active time and profile info
      user = await prisma.user.update({
        where: { telegramId },
        data: {
          username: authData.username,
          firstName: authData.first_name,
          lastName: authData.last_name,
          photoUrl: authData.photo_url,
          lastActiveAt: new Date(),
        },
      });
    }

    // Generate JWT token
    const token = generateToken(user.id, user.telegramId || "");

    res.json({
      success: true,
      isNewUser,
      token,
      user: {
        id: user.id,
        telegramId: user.telegramId,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        photoUrl: user.photoUrl,
        tonWallet: user.tonWallet,
        balance: user.balance,
        level: user.level,
        experience: user.experience,
        referralCode: user.referralCode,
      },
    });
  } catch (error) {
    console.error("Telegram auth error:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to authenticate with Telegram",
    });
  }
});

/**
 * POST /api/auth/telegram
 * Authenticate user via Telegram WebApp (Mini App) using initData
 * This implements secure validation of Telegram WebApp authentication data
 */
router.post("/telegram", async (req: Request, res: Response) => {
  try {
    // Strict input validation - must be non-empty string
    const initData =
      typeof req.body?.initData === "string" &&
      req.body.initData.trim().length > 0
        ? req.body.initData.trim()
        : null;

    if (!initData) {
      return res.status(400).json({
        success: false,
        error: "initData is required and must be a non-empty string",
      });
    }

    // Security: ALWAYS require BOT_TOKEN in production
    // This is a server configuration requirement, not user-controlled
    if (!BOT_TOKEN) {
      if (process.env.NODE_ENV === "production") {
        console.error(
          "CRITICAL: TELEGRAM_BOT_TOKEN not set in production environment!",
        );
        return res.status(500).json({
          success: false,
          error: "Server configuration error",
        });
      }
      // Development only - log warning
      console.warn(
        "⚠️ DEVELOPMENT MODE: TELEGRAM_BOT_TOKEN not set - skipping signature verification",
      );
    }

    // HMAC signature verification - this is the actual security check
    // verifyTelegramWebAppData validates the cryptographic signature from Telegram
    let telegramData: TelegramWebAppData | null;
    if (BOT_TOKEN) {
      telegramData = verifyTelegramWebAppData(initData, BOT_TOKEN);
      if (!telegramData) {
        // Invalid signature - reject request
        return res.status(401).json({
          success: false,
          error: "Invalid Telegram signature - authentication failed",
        });
      }
    } else {
      // Development only - parse without verification
      telegramData = parseTelegramInitData(initData);
    }

    // Validate parsed data contains required user information
    if (!telegramData?.user?.id) {
      return res.status(400).json({
        success: false,
        error: "Invalid initData: missing user information",
      });
    }

    // Extract user data
    const telegramUser = telegramData.user;
    const telegramId = telegramUser.id.toString();

    // Find or create user
    let user = await prisma.user.findUnique({
      where: { telegramId },
    });

    let isNewUser = false;

    if (!user) {
      // Create new user
      user = await prisma.user.create({
        data: {
          telegramId,
          username: telegramUser.username,
          firstName: telegramUser.first_name,
          lastName: telegramUser.last_name,
          photoUrl: telegramUser.photo_url,
          lastActiveAt: new Date(),
        },
      });

      isNewUser = true;

      // Send welcome message
      await sendWelcomeMessage(telegramId, telegramUser.first_name);

      // Process gamification for new user registration
      try {
        const { processUserRegistration } =
          await import("../../services/gamificationService.js");
        await processUserRegistration(user.id);
      } catch (gamificationError) {
        console.error("Gamification registration error:", gamificationError);
        // Don't fail the registration if gamification fails
      }
    } else {
      // Update last active time and profile info
      user = await prisma.user.update({
        where: { telegramId },
        data: {
          username: telegramUser.username,
          firstName: telegramUser.first_name,
          lastName: telegramUser.last_name,
          photoUrl: telegramUser.photo_url,
          lastActiveAt: new Date(),
        },
      });
    }

    // Generate JWT token
    const token = generateToken(user.id, user.telegramId || "");

    res.json({
      success: true,
      isNewUser,
      token,
      user: {
        id: user.id,
        telegramId: user.telegramId,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        photoUrl: user.photoUrl,
        tonWallet: user.tonWallet,
        balance: user.balance,
        level: user.level,
        experience: user.experience,
        referralCode: user.referralCode,
      },
    });
  } catch (error) {
    console.error("Telegram WebApp auth error:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to authenticate with Telegram",
    });
  }
});

export default router;
