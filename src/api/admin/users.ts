import { Router, Request, Response } from "express";
import { adminMiddleware } from "../../lib/auth/adminMiddleware.js";
import { prisma } from "../../lib/prisma.js";

const router = Router();

/**
 * GET /api/admin/users
 * List all users with pagination and filters
 */
router.get("/", adminMiddleware, async (req: Request, res: Response) => {
  try {
    const { page = "1", limit = "20", search, level, hasWallet } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    // Build where clause
    const where: Record<string, unknown> = {};

    // Search by username, firstName, lastName, or telegramId
    if (search) {
      where.OR = [
        { username: { contains: search as string, mode: "insensitive" } },
        { firstName: { contains: search as string, mode: "insensitive" } },
        { lastName: { contains: search as string, mode: "insensitive" } },
        { telegramId: { contains: search as string } },
      ];
    }

    // Filter by level
    if (level) {
      where.level = parseInt(level as string, 10);
    }

    // Filter by wallet presence
    if (hasWallet === "true") {
      where.tonWallet = { not: null };
    } else if (hasWallet === "false") {
      where.tonWallet = null;
    }

    // Get total count
    const total = await prisma.user.count({ where });

    // Get users with pagination
    const users = await prisma.user.findMany({
      where,
      skip,
      take: limitNum,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        telegramId: true,
        username: true,
        firstName: true,
        lastName: true,
        tonWallet: true,
        balance: true,
        totalSpent: true,
        totalWon: true,
        level: true,
        experience: true,
        streak: true,
        lastActiveAt: true,
        createdAt: true,
        _count: {
          select: {
            tickets: true,
          },
        },
      },
    });

    res.json({
      success: true,
      users: users.map((user) => ({
        id: user.id,
        telegramId: user.telegramId,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        tonWallet: user.tonWallet,
        balance: user.balance,
        totalSpent: user.totalSpent,
        totalWon: user.totalWon,
        level: user.level,
        experience: user.experience,
        streak: user.streak,
        ticketsCount: user._count.tickets,
        lastActiveAt: user.lastActiveAt.toISOString(),
        createdAt: user.createdAt.toISOString(),
      })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error("Admin users list error:", error);
    res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to fetch users",
    });
  }
});

/**
 * GET /api/admin/users/:id
 * Get single user details with their tickets
 */
router.get("/:id", adminMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const idString = id as string;

    const user = await prisma.user.findUnique({
      where: { id: idString },
      include: {
        tickets: {
          include: {
            lottery: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
            draw: {
              select: {
                id: true,
                drawNumber: true,
                status: true,
                winningNumbers: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
          take: 50,
        },
      },
    });

    if (!user) {
      res.status(404).json({
        success: false,
        error: "Not Found",
        message: "User not found",
      });
      return;
    }

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
        tickets: user.tickets.map((ticket) => ({
          id: ticket.id,
          lottery: ticket.lottery,
          draw: ticket.draw,
          numbers: ticket.numbers,
          status: ticket.status,
          matchedNumbers: ticket.matchedNumbers,
          prizeAmount: ticket.prizeAmount,
          prizeClaimed: ticket.prizeClaimed,
          createdAt: ticket.createdAt.toISOString(),
        })),
      },
    });
  } catch (error) {
    console.error("Admin user details error:", error);
    res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to fetch user details",
    });
  }
});

/**
 * PUT /api/admin/users/:id/block
 * Block or unblock a user
 */
router.put(
  "/:id/block",
  adminMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const idString = id as string;
      const { block, reason } = req.body;

      if (block === undefined) {
        res.status(400).json({
          success: false,
          error: "Bad Request",
          message: "block parameter is required (true or false)",
        });
        return;
      }

      const user = await prisma.user.findUnique({
        where: { id: idString },
      });

      if (!user) {
        res.status(404).json({
          success: false,
          error: "Not Found",
          message: "User not found",
        });
        return;
      }

      // Update user block status
      const updatedUser = await prisma.user.update({
        where: { id: idString },
        data: {
          isBlocked: block,
          blockReason: block ? reason || "No reason provided" : null,
          blockedAt: block ? new Date() : null,
        },
      });

      res.json({
        success: true,
        message: block
          ? "User blocked successfully"
          : "User unblocked successfully",
        user: {
          id: updatedUser.id,
          telegramId: updatedUser.telegramId,
          username: updatedUser.username,
          isBlocked: updatedUser.isBlocked,
          blockReason: updatedUser.blockReason,
          blockedAt: updatedUser.blockedAt?.toISOString(),
        },
      });
    } catch (error) {
      console.error("Admin block user error:", error);
      res.status(500).json({
        success: false,
        error: "Internal Server Error",
        message: "Failed to update user block status",
      });
    }
  },
);

/**
 * GET /api/admin/users/:id/activity
 * Get user activity log (tickets, transactions, etc.)
 */
router.get(
  "/:id/activity",
  adminMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const idString = id as string;
      const { limit = "50", page = "1" } = req.query;

      const limitNum = parseInt(limit as string, 10);
      const pageNum = parseInt(page as string, 10);
      const skip = (pageNum - 1) * limitNum;

      const user = await prisma.user.findUnique({
        where: { id: idString },
      });

      if (!user) {
        res.status(404).json({
          success: false,
          error: "Not Found",
          message: "User not found",
        });
        return;
      }

      // Get recent activity
      const [tickets, transactions] = await Promise.all([
        prisma.ticket.findMany({
          where: { userId: idString },
          include: {
            lottery: {
              select: {
                name: true,
                slug: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
          skip,
          take: limitNum,
        }),
        prisma.transaction.findMany({
          where: { userId: idString },
          orderBy: { createdAt: "desc" },
          take: 20,
        }),
      ]);

      // Define activity type
      type Activity = {
        type: "ticket" | "transaction";
        action: string;
        timestamp: Date;
        details: {
          lottery?: string;
          numbers?: number[];
          status?: string;
          prizeAmount?: number;
          amount?: number;
          hash?: string | null;
        };
      };

      // Merge and sort activities
      const activities: Activity[] = [];

      tickets.forEach((ticket) => {
        activities.push({
          type: "ticket",
          action: "purchased",
          timestamp: ticket.createdAt,
          details: {
            lottery: ticket.lottery.name,
            numbers: ticket.numbers,
            status: ticket.status,
            prizeAmount: ticket.prizeAmount,
          },
        });
      });

      transactions.forEach((tx) => {
        activities.push({
          type: "transaction",
          action: tx.type,
          timestamp: tx.createdAt,
          details: {
            amount: tx.tonAmount,
            status: tx.status,
            hash: tx.tonTxHash,
          },
        });
      });

      // Sort by timestamp descending
      activities.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      // Take only the requested page
      const paginatedActivities = activities.slice(0, limitNum);

      res.json({
        success: true,
        user: {
          id: user.id,
          telegramId: user.telegramId,
          username: user.username,
        },
        activities: paginatedActivities.map((activity) => ({
          type: activity.type,
          action: activity.action,
          timestamp: activity.timestamp.toISOString(),
          details: activity.details,
        })),
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: activities.length,
        },
      });
    } catch (error) {
      console.error("Admin user activity error:", error);
      res.status(500).json({
        success: false,
        error: "Internal Server Error",
        message: "Failed to fetch user activity",
      });
    }
  },
);

export default router;
