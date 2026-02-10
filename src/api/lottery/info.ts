import { Router, Request, Response } from "express";
import { prisma } from "../../lib/prisma.js";
import { optionalAuth } from "../../lib/auth/middleware.js";

const router = Router({ mergeParams: true });

/**
 * GET /api/lottery/:slug/info
 * Get detailed lottery information with next draw
 */
router.get("/", optionalAuth, async (req: Request, res: Response) => {
  try {
    const slug = Array.isArray(req.params.slug)
      ? req.params.slug[0]
      : req.params.slug;

    // Get lottery
    const lottery = await prisma.lottery.findUnique({
      where: { slug },
    });

    if (!lottery) {
      res.status(404).json({
        error: "Not Found",
        message: `Lottery '${slug}' not found`,
      });
      return;
    }

    // Get next draw
    const nextDraw = await prisma.draw.findFirst({
      where: {
        lotteryId: lottery.id,
        status: "scheduled",
        scheduledAt: { gte: new Date() },
      },
      orderBy: { scheduledAt: "asc" },
    });

    // Get statistics
    const stats = await prisma.draw.aggregate({
      where: {
        lotteryId: lottery.id,
        status: "completed",
      },
      _count: { id: true },
      _sum: {
        totalTickets: true,
        totalPaid: true,
      },
    });

    // Get recent winners (last 5 draws)
    const recentDraws = await prisma.draw.findMany({
      where: {
        lotteryId: lottery.id,
        status: "completed",
      },
      orderBy: { executedAt: "desc" },
      take: 5,
      select: {
        id: true,
        drawNumber: true,
        executedAt: true,
        winningNumbers: true,
        totalWinners: true,
        totalPaid: true,
      },
    });

    res.json({
      success: true,
      lottery: {
        id: lottery.id,
        slug: lottery.slug,
        name: lottery.name,
        description: lottery.description,
        numbersCount: lottery.numbersCount,
        numbersMax: lottery.numbersMax,
        ticketPrice: lottery.ticketPrice,
        jackpot: lottery.jackpot,
        drawTime: lottery.drawTime,
        drawTimezone: lottery.drawTimezone,
        active: lottery.active,
        featured: lottery.featured,
        prizeStructure: lottery.prizeStructure,
      },
      nextDraw: nextDraw
        ? {
            id: nextDraw.id,
            drawNumber: nextDraw.drawNumber,
            scheduledAt: nextDraw.scheduledAt.toISOString(),
            totalTickets: nextDraw.totalTickets,
            totalPrizePool: nextDraw.totalPrizePool,
          }
        : null,
      statistics: {
        totalDraws: stats._count.id || 0,
        totalTicketsSold: stats._sum.totalTickets || 0,
        totalPrizesAwarded: stats._sum.totalPaid || 0,
      },
      recentDraws: recentDraws.map((draw) => ({
        id: draw.id,
        drawNumber: draw.drawNumber,
        executedAt: draw.executedAt?.toISOString(),
        winningNumbers: draw.winningNumbers,
        totalWinners: draw.totalWinners,
        totalPaid: draw.totalPaid,
      })),
    });
  } catch (error) {
    console.error("Lottery info error:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to fetch lottery information",
    });
  }
});

export default router;
