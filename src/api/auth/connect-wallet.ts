import { Router, Request, Response } from "express";
import { prisma } from "../../lib/prisma.js";
import { authMiddleware } from "../../lib/auth/middleware.js";
import { isValidAddress } from "../../lib/ton/client.js";

const router = Router();

interface ConnectWalletRequest {
  walletAddress: string;
  walletVersion?: string;
}

/**
 * POST /api/auth/connect-wallet
 * Connect TON wallet to user account
 */
router.post("/", authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        error: "Unauthorized",
        message: "User not authenticated",
      });
      return;
    }

    const { walletAddress, walletVersion = "v4" }: ConnectWalletRequest =
      req.body;

    // Validate wallet address
    if (!walletAddress) {
      res.status(400).json({
        error: "Bad Request",
        message: "Wallet address is required",
      });
      return;
    }

    if (!isValidAddress(walletAddress)) {
      res.status(400).json({
        error: "Bad Request",
        message: "Invalid TON wallet address",
      });
      return;
    }

    // Check if wallet is already connected to another user
    const existingUser = await prisma.user.findFirst({
      where: {
        tonWallet: walletAddress,
        id: { not: req.user.userId },
      },
    });

    if (existingUser) {
      res.status(409).json({
        error: "Conflict",
        message: "This wallet is already connected to another account",
      });
      return;
    }

    // Update user's wallet
    const user = await prisma.user.update({
      where: { id: req.user.userId },
      data: {
        tonWallet: walletAddress,
        tonWalletVersion: walletVersion,
      },
    });

    // Process gamification for wallet connection
    try {
      const { processWalletConnection } =
        await import("../../services/gamificationService.js");
      await processWalletConnection(user.id);
    } catch (gamificationError) {
      console.error("Gamification wallet connection error:", gamificationError);
      // Don't fail the wallet connection if gamification fails
    }

    res.json({
      success: true,
      message: "Wallet connected successfully",
      user: {
        id: user.id,
        tonWallet: user.tonWallet,
        tonWalletVersion: user.tonWalletVersion,
      },
    });
  } catch (error) {
    console.error("Connect wallet error:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to connect wallet",
    });
  }
});

export default router;
