import { Router, Request, Response } from "express";
import { prisma } from "../../lib/prisma.js";
import { getUserFromRequest } from "../../lib/auth/helpers.js";
import { Prisma } from "@prisma/client";

const router = Router();

// GET /api/leaderboard
router.get("/", async (req: Request, res: Response) => {
  try {
    const period = (req.query.period as string) || "all";
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const lotterySlug = req.query.lotterySlug as string;

    // Calculate date filter
    let dateFilter: Date | undefined;
    if (period === "weekly") {
      dateFilter = new Date();
      dateFilter.setDate(dateFilter.getDate() - 7);
    } else if (period === "monthly") {
      dateFilter = new Date();
      dateFilter.setMonth(dateFilter.getMonth() - 1);
    }

    // Build where clause for tickets
    const ticketWhere: Prisma.TicketWhereInput = { status: "won" };
    if (dateFilter) {
      ticketWhere.createdAt = { gte: dateFilter };
    }
    if (lotterySlug) {
      const lottery = await prisma.lottery.findUnique({
        where: { slug: lotterySlug },
      });
      if (lottery) {
        ticketWhere.draw = { lotteryId: lottery.id };
      }
    }

    // Get aggregated stats per user
    const userStats = await prisma.ticket.groupBy({
      by: ["userId"],
      where: ticketWhere,
      _sum: { prizeAmount: true },
      _count: { id: true },
      _max: { prizeAmount: true },
      orderBy: { _sum: { prizeAmount: "desc" } },
      take: limit,
    });

    // Filter out tickets without userId
    const validStats = userStats.filter((s) => s.userId !== null);

    // Get user details
    const userIds = validStats.map((s) => s.userId as string);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, username: true, tonWallet: true },
    });

    const userMap = new Map(users.map((u) => [u.id, u]));

    // Get total tickets per user for win rate
    const totalTickets = await prisma.ticket.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds } },
      _count: { id: true },
    });
    const ticketCountMap = new Map(
      totalTickets.map((t) => [t.userId as string, t._count.id]),
    );

    const leaderboard = validStats.map((stat, index) => {
      const user = userMap.get(stat.userId as string);
      const totalUserTickets = ticketCountMap.get(stat.userId as string) || 1;

      return {
        rank: index + 1,
        username: user?.username || "Anonymous",
        walletAddress: maskWallet(user?.tonWallet),
        totalWinnings: stat._sum.prizeAmount || 0,
        totalWins: stat._count.id,
        biggestWin: stat._max.prizeAmount || 0,
        winRate:
          Math.round((stat._count.id / totalUserTickets) * 100 * 100) / 100,
        currency: "TON",
      };
    });

    // Get current user rank if authenticated
    let currentUser = null;
    const user = await getUserFromRequest(req);
    if (user) {
      const userRankData = await prisma.ticket.aggregate({
        where: { ...ticketWhere, userId: user.id },
        _sum: { prizeAmount: true },
      });

      if (userRankData._sum.prizeAmount) {
        const higherRanked = await prisma.ticket.groupBy({
          by: ["userId"],
          where: ticketWhere,
          _sum: { prizeAmount: true },
          having: {
            prizeAmount: { _sum: { gt: userRankData._sum.prizeAmount } },
          },
        });

        currentUser = {
          rank: higherRanked.length + 1,
          totalWinnings: userRankData._sum.prizeAmount,
        };
      }
    }

    res.json({
      success: true,
      leaderboard,
      period,
      updatedAt: new Date().toISOString(),
      currentUser,
    });
  } catch (error) {
    console.error("Get leaderboard error:", error);
    res
      .status(500)
      .json({ success: false, error: "Failed to get leaderboard" });
  }
});

function maskWallet(wallet?: string | null): string {
  if (!wallet) return "Unknown";
  if (wallet.length <= 10) return wallet;
  return `${wallet.substring(0, 4)}...${wallet.substring(wallet.length - 4)}`;
}

export default router;
