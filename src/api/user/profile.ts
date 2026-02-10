import { Router, Request, Response } from "express";
import { prisma } from "../../lib/prisma.js";
import { unifiedAuthMiddleware } from "../../lib/auth/unifiedAuth.js";

const router = Router();

/**
 * GET /api/user/profile
 * Get current user's profile
 */
router.get("/", unifiedAuthMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        error: "Unauthorized",
        message: "User not authenticated",
      });
      return;
    }

    // Get user with statistics
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
    });

    if (!user) {
      res.status(404).json({
        error: "Not Found",
        message: "User not found",
      });
      return;
    }

    // Get total tickets
    const totalTickets = await prisma.ticket.count({
      where: { userId: user.id },
    });

    // Get winning tickets
    const winningTickets = await prisma.ticket.count({
      where: {
        userId: user.id,
        status: "won",
      },
    });

    // Get active tickets
    const activeTickets = await prisma.ticket.count({
      where: {
        userId: user.id,
        status: "active",
      },
    });

    // Get recent notifications
    const notifications = await prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    // Get unread notification count
    const unreadNotifications = await prisma.notification.count({
      where: {
        userId: user.id,
        read: false,
      },
    });

    res.json({
      success: true,
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
        referralCode: user.referralCode,
        referredBy: user.referredBy,
        totalSpent: user.totalSpent,
        totalWon: user.totalWon,
        level: user.level,
        experience: user.experience,
        streak: user.streak,
        lastActiveAt: user.lastActiveAt.toISOString(),
        createdAt: user.createdAt.toISOString(),
      },
      statistics: {
        totalTickets,
        activeTickets,
        winningTickets,
        winRate:
          totalTickets > 0
            ? ((winningTickets / totalTickets) * 100).toFixed(2)
            : "0",
        netProfit: user.totalWon - user.totalSpent,
      },
      notifications: {
        unread: unreadNotifications,
        recent: notifications.map((n: Record<string, unknown>) => ({
          id: n.id,
          type: n.type,
          title: n.title,
          message: n.message,
          link: n.link,
          actionLabel: n.actionLabel,
          read: n.read,
          createdAt: (n.createdAt as Date).toISOString(),
        })),
      },
    });
  } catch (error) {
    console.error("User profile error:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to fetch user profile",
    });
  }
});

export default router;
