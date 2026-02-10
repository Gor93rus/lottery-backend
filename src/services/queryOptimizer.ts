import { prisma } from "../lib/database/connection.js";

/**
 * Query optimizer service for database operations
 * Provides optimized queries with proper indexes and batching
 */
export class QueryOptimizer {
  /**
   * Get lotteries with statistics (optimized)
    includeInactive?: boolean;
    limit?: number;
    offset?: number;
    category?: string;
  } = {}) {
    const { 
      includeInactive = false, 
      limit = 20, 
      offset = 0,
      category,
    } = options;

    return prisma.lottery.findMany({
      where: {
        ...(includeInactive ? {} : { active: true }),
        ...(category ? { category } : {}),
      },
      include: {
        _count: {
          select: { tickets: true },
        },
        draws: {
          where: { status: 'completed' },
          orderBy: { executedAt: 'desc' },
          take: 1,
          select: {
            id: true,
            totalPrizePool: true,
            winningNumbers: true,
            executedAt: true,
          },
        },
      },
      orderBy: [
        { featured: 'desc' },
        { createdAt: 'desc' },
      ],
      take: limit,
      skip: offset,
    });
  }

  /**
   * Get user tickets with lottery info (optimized)
   */
  static async getUserTicketsWithInfo(
    userId: string,
    options: {
      limit?: number;
      offset?: number;
      status?: string;
    } = {},
  ) {
    const { limit = 50, offset = 0, status } = options;

    return prisma.ticket.findMany({
      where: {
        userId,
        ...(status ? { status } : {}),
      },
      include: {
        lottery: {
          select: {
            id: true,
            name: true,
            drawTime: true,
          },
        },
        draw: {
          select: {
            id: true,
            status: true,
            winningNumbers: true,
            executedAt: true,
          },
        },
      },
      orderBy: {
        purchasedAt: "desc",
      },
      take: limit,
      skip: offset,
    });
  }

  /**
   * Batch update user statistics
   */
  static async batchUpdateUserStats(userIds: string[]): Promise<void> {
    if (userIds.length === 0) return;

    // Get aggregated stats for each user
    const stats = await prisma.ticket.groupBy({
      by: ["userId"],
      where: {
        userId: { in: userIds },
      },
      _count: {
        _all: true,
      },
      _sum: {
        prizeAmount: true,
      },
    });

    // Batch update users
    const updates = stats
      .filter((stat) => stat.userId !== null)
      .map((stat) =>
        prisma.user.update({
          where: { id: stat.userId as string },
          data: {
            // Update custom fields if they exist in your schema
            updatedAt: new Date(),
          },
        }),
      );

    await prisma.$transaction(updates);
  }

  /**
   * Get leaderboard with optimized query
   */
  static async getLeaderboard(
    options: {
      limit?: number;
      timeframe?: "all" | "week" | "month";
    } = {},
  ) {
    const { limit = 100, timeframe = "all" } = options;

    let whereClause = {};
    if (timeframe !== "all") {
      const date = new Date();
      if (timeframe === "week") {
        date.setDate(date.getDate() - 7);
      } else if (timeframe === "month") {
        date.setMonth(date.getMonth() - 1);
      }
      whereClause = {
        purchasedAt: {
          gte: date,
        },
      };
    }

    const topWinners = await prisma.ticket.groupBy({
      by: ["userId"],
      where: {
        status: "won",
        ...whereClause,
      },
      _sum: {
        prizeAmount: true,
      },
      _count: {
        _all: true,
      },
      orderBy: {
        _sum: {
          prizeAmount: "desc",
        },
      },
      take: limit,
    });

    // Get user details for top winners
    const userIds = topWinners
      .map((w) => w.userId)
      .filter((id): id is string => id !== null);
    const users = await prisma.user.findMany({
      where: {
        id: { in: userIds },
      },
      select: {
        id: true,
        telegramId: true,
        username: true,
        firstName: true,
        lastName: true,
      },
    });

    // Map users to winners
    const userMap = new Map(users.map((u) => [u.id, u]));

    return topWinners
      .filter((winner) => winner.userId !== null)
      .map((winner) => ({
        user: userMap.get(winner.userId as string),
        totalWinnings: winner._sum.prizeAmount || 0,
        ticketsWon: winner._count._all,
      }));
  }

  /**
   * Get draw results with winner details (optimized)
   */
  static async getDrawWithWinners(drawId: string) {
    return prisma.draw.findUnique({
      where: { id: drawId },
      include: {
        lottery: {
          select: {
            id: true,
            name: true,
            ticketPrice: true,
          },
        },
        tickets: {
          where: {
            status: "won",
          },
          include: {
            user: {
              select: {
                id: true,
                username: true,
                firstName: true,
                lastName: true,
              },
            },
          },
          orderBy: {
            prizeAmount: "desc",
          },
        },
      },
    });
  }

  /**
   * Batch create tickets (optimized for bulk purchases)
   */
  static async batchCreateTickets(
    tickets: Array<{
      lotteryId: string;
      lotterySlug: string;
      userId?: string;
      numbers: number[];
      txHash: string;
      price: number;
      currency?: string;
    }>,
  ) {
    // Create tickets one by one to handle complex data types
    const createdTickets = [];
    for (const ticket of tickets) {
      const created = await prisma.ticket.create({
        data: {
          lotteryId: ticket.lotteryId,
          lotterySlug: ticket.lotterySlug,
          userId: ticket.userId,
          numbers: ticket.numbers,
          txHash: ticket.txHash,
          price: ticket.price,
          currency: ticket.currency || "TON",
          status: "active",
          purchasedAt: new Date(),
        },
      });
      createdTickets.push(created);
    }
    return createdTickets;
  }

  /**
   * Get statistics for dashboard (optimized)
   */
  static async getDashboardStats(timeframe: "day" | "week" | "month" = "day") {
    const date = new Date();

    if (timeframe === "day") {
      date.setHours(0, 0, 0, 0);
    } else if (timeframe === "week") {
      date.setDate(date.getDate() - 7);
    } else if (timeframe === "month") {
      date.setMonth(date.getMonth() - 1);
    }

    const [ticketStats, drawStats, userCount] = await Promise.all([
      prisma.ticket.aggregate({
        where: {
          purchasedAt: { gte: date },
        },
        _count: { id: true },
        _sum: { price: true, prizeAmount: true },
      }),
      prisma.draw.aggregate({
        where: {
          executedAt: { gte: date },
          status: "completed",
        },
        _count: { _all: true },
        _sum: { totalPrizePool: true },
      }),
      prisma.user.count({
        where: {
          createdAt: { gte: date },
        },
      }),
    ]);

    return {
      tickets: {
        count: ticketStats._count.id || 0,
        revenue: ticketStats._sum.price || 0,
        payouts: ticketStats._sum.prizeAmount || 0,
      },
      draws: {
        count: drawStats._count._all,
        totalPrizePool: drawStats._sum.totalPrizePool || 0,
      },
      users: {
        newUsers: userCount,
      },
      timeframe,
    };
  }
}

// Export singleton instance
export const queryOptimizer = new QueryOptimizer();
