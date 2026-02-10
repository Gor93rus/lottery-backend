import { Router, Request, Response } from "express";
import { prisma } from "../../lib/prisma.js";

const router = Router();

/**
 * GET /api/draws/:id/results
 * Get draw results with winning numbers and prize breakdown
 */
router.get("/:id/results", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Get draw with lottery info
    const draw = await prisma.draw.findUnique({
      where: { id: id as string },
      include: {
        lottery: {
          select: {
            id: true,
            name: true,
            slug: true,
            currency: true,
            numbersCount: true,
            numbersMax: true,
          },
        },
        tickets: {
          where: { status: "won" },
          select: { id: true, numbers: true, prizeAmount: true },
        },
      },
    });

    if (!draw) {
      res.status(404).json({
        success: false,
        error: "Draw not found",
      });
      return;
    }

    // Check if draw is completed
    if (draw.status !== "completed" && draw.status !== "paying") {
      res.status(400).json({
        success: false,
        error: "Draw not completed yet",
        status: draw.status,
      });
      return;
    }

    // Calculate prize breakdown
    const prizes = calculatePrizeBreakdown(draw);

    res.json({
      success: true,
      draw: {
        id: draw.id,
        drawNumber: draw.drawNumber,
        lotterySlug: draw.lottery.slug,
        lotteryName: draw.lottery.name,
        status: draw.status,
        drawTime: draw.drawTime.toISOString(),
        winningNumbers: draw.winningNumbers,
        totalTickets: draw.totalTickets,
        totalPrizePool: draw.totalPrizePool,
        currency: draw.lottery.currency || draw.currency || "TON",
        prizes,
        completedAt: draw.completedAt?.toISOString() || null,
      },
    });
  } catch (error) {
    console.error("Get draw results error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get draw results",
    });
  }
});

/**
 * GET /api/draws/latest
 * Get latest completed draws across all lotteries
 */
router.get("/latest", async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
    const lotterySlug = req.query.lotterySlug as string;

    const where: Record<string, unknown> = {
      OR: [{ status: "completed" }, { status: "paying" }],
    };

    if (lotterySlug) {
      const lottery = await prisma.lottery.findUnique({
        where: { slug: lotterySlug },
      });
      if (lottery) {
        where.lotteryId = lottery.id;
      }
    }

    const draws = await prisma.draw.findMany({
      where,
      include: {
        lottery: {
          select: {
            name: true,
            slug: true,
            currency: true,
          },
        },
        _count: {
          select: {
            tickets: {
              where: { status: "won" },
            },
          },
        },
      },
      orderBy: { completedAt: "desc" },
      take: limit,
    });

    res.json({
      success: true,
      draws: draws.map((draw) => ({
        id: draw.id,
        drawNumber: draw.drawNumber,
        lotterySlug: draw.lottery.slug,
        lotteryName: draw.lottery.name,
        winningNumbers: draw.winningNumbers,
        drawTime: draw.drawTime.toISOString(),
        totalPrizePool: draw.totalPrizePool,
        jackpotWon: draw.winners5 > 0,
        totalWinners: draw._count.tickets,
      })),
      count: draws.length,
    });
  } catch (error) {
    console.error("Get latest draws error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get latest draws",
    });
  }
});

/**
 * GET /api/draws/:id/winners
 * Get winners list for a specific draw
 */
router.get("/:id/winners", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const page = Math.max(parseInt(req.query.page as string) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const tier = req.query.tier as string;

    const draw = await prisma.draw.findUnique({
      where: { id: id as string },
      include: {
        lottery: {
          select: {
            currency: true,
          },
        },
      },
    });

    if (!draw) {
      res.status(404).json({
        success: false,
        error: "Draw not found",
      });
      return;
    }

    if (draw.status !== "completed" && draw.status !== "paying") {
      res.status(400).json({
        success: false,
        error: "Draw not completed yet",
      });
      return;
    }

    // Build where clause
    const ticketWhere: Record<string, unknown> = {
      drawId: id as string,
      status: "won",
    };

    // Filter by tier if specified
    if (tier) {
      const matchCount = tierToMatchCount(tier);
      if (matchCount) {
        ticketWhere.matchedNumbers = matchCount;
      }
    }

    const [tickets, total] = await Promise.all([
      prisma.ticket.findMany({
        where: ticketWhere,
        include: {
          user: {
            select: {
              tonWallet: true,
            },
          },
        },
        orderBy: [{ prizeAmount: "desc" }, { createdAt: "asc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.ticket.count({ where: ticketWhere }),
    ]);

    const winningNumbers = draw.winningNumbers as number[];

    res.json({
      success: true,
      winners: tickets.map((ticket, index) => {
        const ticketNumbers = ticket.numbers as number[];
        const matchedNumbers = ticketNumbers.filter((n) =>
          winningNumbers.includes(n),
        );

        return {
          rank: (page - 1) * limit + index + 1,
          tier: matchCountToTier(matchedNumbers.length),
          matches: matchedNumbers.length,
          walletAddress: maskWallet(
            ticket.user?.tonWallet || ticket.walletAddress,
          ),
          ticketNumbers,
          winningNumbers,
          matchedNumbers,
          prize: ticket.prizeAmount,
          currency: draw.lottery.currency || draw.currency || "TON",
          claimed: ticket.prizeClaimed,
        };
      }),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get winners error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get winners",
    });
  }
});

/**
 * GET /api/draws/:id/check/:ticketId
 * Check if a specific ticket won
 */
router.get("/:id/check/:ticketId", async (req: Request, res: Response) => {
  try {
    const { id, ticketId } = req.params;

    const ticket = await prisma.ticket.findFirst({
      where: {
        id: ticketId as string,
        drawId: id as string,
      },
      include: {
        draw: {
          include: {
            lottery: {
              select: {
                currency: true,
              },
            },
          },
        },
      },
    });

    if (!ticket || !ticket.draw) {
      res.status(404).json({
        success: false,
        error: "Ticket not found",
      });
      return;
    }

    if (ticket.draw.status !== "completed" && ticket.draw.status !== "paying") {
      res.json({
        success: true,
        ticket: {
          id: ticket.id,
          numbers: ticket.numbers,
          drawId: ticket.drawId,
          status: "PENDING",
        },
        result: {
          won: false,
          pending: true,
          message: "Draw not completed yet",
        },
      });
      return;
    }

    const ticketNumbers = ticket.numbers as number[];
    const winningNumbers = ticket.draw.winningNumbers as number[];
    const matchedNumbers = ticketNumbers.filter((n) =>
      winningNumbers.includes(n),
    );
    const won = matchedNumbers.length >= 2;

    res.json({
      success: true,
      ticket: {
        id: ticket.id,
        numbers: ticketNumbers,
        drawId: ticket.drawId,
        status: ticket.status.toUpperCase(),
      },
      result: {
        won,
        matches: matchedNumbers.length,
        matchedNumbers,
        tier: won ? matchCountToTier(matchedNumbers.length) : null,
        prize: ticket.prizeAmount,
        currency: ticket.draw.lottery.currency || ticket.draw.currency || "TON",
        claimed: ticket.prizeClaimed,
      },
    });
  } catch (error) {
    console.error("Check ticket error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to check ticket",
    });
  }
});

// Helper functions
function calculatePrizeBreakdown(draw: Record<string, unknown>) {
  const prizes = {
    jackpot: {
      matches: 5,
      winners: draw.winners5 as number,
      prizePerWinner:
        (draw.winners5 as number) > 0
          ? ((draw.jackpotAmount as number) || 0) / (draw.winners5 as number)
          : 0,
      totalPrize: draw.jackpotAmount || 0,
    },
    second: {
      matches: 4,
      winners: draw.winners4 as number,
      prizePerWinner:
        (draw.winners4 as number) > 0
          ? ((draw.payout4Amount as number) || 0) / (draw.winners4 as number)
          : 0,
      totalPrize: (draw.payout4Amount as number) || 0,
    },
    third: {
      matches: 3,
      winners: draw.winners3 as number,
      prizePerWinner:
        (draw.winners3 as number) > 0
          ? ((draw.payout3Amount as number) || 0) / (draw.winners3 as number)
          : 0,
      totalPrize: (draw.payout3Amount as number) || 0,
    },
    fourth: {
      matches: 2,
      winners: draw.winners2 as number,
      prizePerWinner:
        (draw.winners2 as number) > 0
          ? ((draw.payout2Amount as number) || 0) / (draw.winners2 as number)
          : 0,
      totalPrize: (draw.payout2Amount as number) || 0,
    },
  };

  return prizes;
}

function maskWallet(wallet?: string | null): string {
  if (!wallet) return "Unknown";
  if (wallet.length <= 10) return wallet;
  return `${wallet.substring(0, 6)}...${wallet.substring(wallet.length - 4)}`;
}

function tierToMatchCount(tier: string): number | null {
  const map: Record<string, number> = {
    jackpot: 5,
    second: 4,
    third: 3,
    fourth: 2,
  };
  return map[tier] || null;
}

function matchCountToTier(matches: number): string {
  const map: Record<number, string> = {
    5: "jackpot",
    4: "second",
    3: "third",
    2: "fourth",
  };
  return map[matches] || "none";
}

export default router;
