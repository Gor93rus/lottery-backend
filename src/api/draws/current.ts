import { Router, Request, Response } from "express";
import { prisma } from "../../lib/prisma.js";
import { optionalAuth } from "../../lib/auth/middleware.js";

const router = Router();

/**
 * GET /api/draws/current
 * Get current/upcoming draws for all active lotteries
 */
router.get("/", optionalAuth, async (req: Request, res: Response) => {
  try {
    const { lotterySlug } = req.query;

    // Build where clause
    const lotteryWhere: Record<string, unknown> = { active: true };
    if (lotterySlug) {
      lotteryWhere.slug = lotterySlug;
    }

    // Get active lotteries
    const lotteries = await prisma.lottery.findMany({
      where: lotteryWhere,
    });

    // Get current draw for each lottery
    const draws = await Promise.all(
      lotteries.map(async (lottery) => {
        // Find next draw that is open or upcoming
        const nextDraw = await prisma.draw.findFirst({
          where: {
            lotteryId: lottery.id,
            status: { in: ["scheduled", "open", "locked"] },
            drawTime: { gte: new Date() },
          },
          orderBy: { drawTime: "asc" },
        });

        if (!nextDraw) {
          return null;
        }

        // Calculate time until draw
        const now = new Date();
        const timeUntilDraw = nextDraw.drawTime.getTime() - now.getTime();
        const hoursUntilDraw = Math.floor(timeUntilDraw / (1000 * 60 * 60));
        const minutesUntilDraw = Math.floor(
          (timeUntilDraw % (1000 * 60 * 60)) / (1000 * 60),
        );

        // Calculate time until sales close
        const timeUntilClose = nextDraw.salesCloseAt.getTime() - now.getTime();
        const isLocked =
          nextDraw.status === "locked" || now >= nextDraw.salesCloseAt;

        return {
          lottery: {
            id: lottery.id,
            slug: lottery.slug,
            name: lottery.name,
            ticketPrice: lottery.ticketPrice,
            jackpot: lottery.jackpot,
            numbersCount: lottery.numbersCount,
            numbersMax: lottery.numbersMax,
          },
          draw: {
            id: nextDraw.id,
            drawNumber: nextDraw.drawNumber,
            status: nextDraw.status,
            isLocked,
            salesCloseAt: nextDraw.salesCloseAt.toISOString(),
            drawTime: nextDraw.drawTime.toISOString(),
            scheduledAt: nextDraw.drawTime.toISOString(), // Legacy
            totalTickets: nextDraw.totalTickets,
            totalPrizePool: nextDraw.totalPrizePool,
            serverSeedHash: nextDraw.serverSeedHash,
            timeRemaining: {
              hours: hoursUntilDraw,
              minutes: minutesUntilDraw,
              milliseconds: timeUntilDraw,
            },
            timeUntilClose:
              timeUntilClose > 0
                ? {
                    hours: Math.floor(timeUntilClose / (1000 * 60 * 60)),
                    minutes: Math.floor(
                      (timeUntilClose % (1000 * 60 * 60)) / (1000 * 60),
                    ),
                    milliseconds: timeUntilClose,
                  }
                : null,
          },
        };
      }),
    );

    // Filter out null draws
    const validDraws = draws.filter((d) => d !== null);

    res.json({
      success: true,
      draws: validDraws,
      count: validDraws.length,
    });
  } catch (error) {
    console.error("Current draws error:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to fetch current draws",
    });
  }
});

export default router;
