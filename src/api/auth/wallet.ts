import { Router, Request, Response } from "express";
import { prisma } from "../../lib/prisma.js";
import { generateToken } from "../../lib/auth/middleware.js";
import { isValidAddress } from "../../lib/ton/client.js";
import crypto from "crypto";

const router = Router();

interface WalletAuthRequest {
  walletAddress: string;
  walletVersion?: string;
  // Optional Telegram data if available
  telegramData?: {
    username?: string;
    first_name?: string;
    last_name?: string;
    photo_url?: string;
  };
}

/**
 * @swagger
 * /api/auth/wallet:
 *   post:
 *     summary: Authenticate via TON Wallet
 *     description: Login or register user using TON wallet address. No prior authentication required.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - walletAddress
 *             properties:
 *               walletAddress:
 *                 type: string
 *                 description: TON wallet address
 *                 example: "UQDAy6...0NwS"
 *               walletVersion:
 *                 type: string
 *                 description: Wallet version
 *                 default: "v4"
 *               telegramData:
 *                 type: object
 *                 description: Optional Telegram profile data
 *                 properties:
 *                   username:
 *                     type: string
 *                   first_name:
 *                     type: string
 *                   last_name:
 *                     type: string
 *                   photo_url:
 *                     type: string
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
 *                 isNewUser:
 *                   type: boolean
 *                 token:
 *                   type: string
 *                 user:
 *                   type: object
 *       400:
 *         description: Invalid wallet address
 *       500:
 *         description: Server error
 */
router.post("/", async (req: Request, res: Response) => {
  try {
    const {
      walletAddress,
      walletVersion = "v4",
      telegramData,
    }: WalletAuthRequest = req.body;

    // Validate wallet address
    if (!walletAddress) {
      res.status(400).json({
        error: "Bad Request",
        message: "Wallet address is required",
      });
      return;
    }

    // Validate address format
    if (!isValidAddress(walletAddress)) {
      res.status(400).json({
        error: "Bad Request",
        message: "Invalid TON wallet address format",
      });
      return;
    }

    let user;
    let isNewUser = false;

    // Find existing user by wallet address
    user = await prisma.user.findFirst({
      where: { tonWallet: walletAddress },
    });

    if (!user) {
      // Create new user with wallet
      isNewUser = true;

      // Generate a unique referral code with retry logic
      let referralCode = "";
      let isUnique = false;
      let attempts = 0;
      const maxAttempts = 5;

      while (!isUnique && attempts < maxAttempts) {
        referralCode = crypto.randomBytes(6).toString("hex");
        const existing = await prisma.user.findUnique({
          where: { referralCode },
        });
        if (!existing) {
          isUnique = true;
        }
        attempts++;
      }

      if (!isUnique) {
        // Fallback to timestamp-based code if collision persists
        referralCode = `${Date.now().toString(36)}${crypto.randomBytes(3).toString("hex")}`;
      }

      user = await prisma.user.create({
        data: {
          tonWallet: walletAddress,
          tonWalletVersion: walletVersion,
          username: telegramData?.username,
          firstName: telegramData?.first_name,
          lastName: telegramData?.last_name,
          photoUrl: telegramData?.photo_url,
          referralCode,
          level: 1,
          experience: 0,
          balance: 0,
        },
      });

      console.log("New user created via wallet:", {
        userId: user.id,
        wallet: walletAddress.slice(0, 8) + "...",
        timestamp: new Date().toISOString(),
      });
    } else {
      // Update existing user's profile if Telegram data provided
      if (telegramData && (telegramData.username || telegramData.first_name)) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            username: telegramData.username || user.username,
            firstName: telegramData.first_name || user.firstName,
            lastName: telegramData.last_name || user.lastName,
            photoUrl: telegramData.photo_url || user.photoUrl,
            lastActiveAt: new Date(),
          },
        });
      } else {
        // Just update last active time
        user = await prisma.user.update({
          where: { id: user.id },
          data: { lastActiveAt: new Date() },
        });
      }

      console.log("User logged in via wallet:", {
        userId: user.id,
        wallet: walletAddress.slice(0, 8) + "...",
        timestamp: new Date().toISOString(),
      });
    }

    // Generate JWT token
    const token = generateToken(user.id, user.telegramId || "");

    // Process gamification for new users
    if (isNewUser) {
      try {
        const { processUserRegistration, processWalletConnection } =
          await import("../../services/gamificationService.js");
        // Create gamification records (UserStreak, etc.)
        await processUserRegistration(user.id);
        // Complete wallet connection quest
        await processWalletConnection(user.id);
      } catch (gamificationError) {
        console.error("Gamification initialization error:", gamificationError);
        // Don't fail auth if gamification fails
      }
    }

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
        tonWalletVersion: user.tonWalletVersion,
        balance: user.balance,
        level: user.level,
        experience: user.experience,
        referralCode: user.referralCode,
      },
    });
  } catch (error) {
    console.error("Wallet auth error:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to authenticate with wallet",
    });
  }
});

export default router;
