import { Router, Request, Response } from "express";
import { prisma } from "../../lib/prisma.js";
import { authMiddleware } from "../../lib/auth/middleware.js";
import { updateDailyTaskProgress } from "../../services/gamification/dailyTasks.js";

const router = Router({ mergeParams: true });

/**
 * GET /api/lottery/:slug/my-tickets
 * Get user's tickets for a specific lottery
 */
router.get("/", authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        error: "Unauthorized",
        message: "User not authenticated",
      });
      return;
    }

    const slug = Array.isArray(req.params.slug)
      ? req.params.slug[0]
      : req.params.slug;
    const { status, page = "1", limit = "20" } = req.query;

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

    // Build where clause
    const where: Record<string, unknown> = {
      lotteryId: lottery.id,
      userId: req.user.userId,
    };

    if (status) {
      where.status = status;
    }

    // Pagination
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    // Get tickets with draw info
    const [tickets, totalCount] = await Promise.all([
      prisma.ticket.findMany({
        where,
        // Optimize: select only needed fields
        select: {
          id: true,
          numbers: true,
          status: true,
          matchedNumbers: true,
          prizeAmount: true,
          prizeClaimed: true,
          createdAt: true,
          draw: {
            select: {
              id: true,
              drawNumber: true,
              scheduledAt: true,
              executedAt: true,
              winningNumbers: true,
              status: true,
            },
          },
          transaction: {
            select: {
              id: true,
              tonTxHash: true,
              tonAmount: true,
              status: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limitNum,
      }),
      prisma.ticket.count({ where }),
    ]);

    // Format response
    const formattedTickets = tickets.map((ticket) => ({
      id: ticket.id,
      numbers: ticket.numbers,
      status: ticket.status,
      matchedNumbers: ticket.matchedNumbers,
      prizeAmount: ticket.prizeAmount,
      prizeClaimed: ticket.prizeClaimed,
      createdAt: ticket.createdAt.toISOString(),
      draw: ticket.draw
        ? {
            id: ticket.draw.id,
            drawNumber: ticket.draw.drawNumber,
            scheduledAt: ticket.draw.scheduledAt.toISOString(),
            executedAt: ticket.draw.executedAt?.toISOString(),
            winningNumbers: ticket.draw.winningNumbers,
            status: ticket.draw.status,
          }
        : null,
      transaction: ticket.transaction
        ? {
            id: ticket.transaction.id,
            hash: ticket.transaction.tonTxHash,
            amount: ticket.transaction.tonAmount,
            status: ticket.transaction.status,
          }
        : null,
    }));

    // Track daily task for checking results (async, don't wait)
    updateDailyTaskProgress(req.user.userId, "CHECK_RESULTS", 1).catch((err) =>
      console.error("Failed to update CHECK_RESULTS task:", err),
    );

    res.json({
      success: true,
      tickets: formattedTickets,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limitNum),
      },
    });
  } catch (error) {
    console.error("My tickets error:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to fetch tickets",
    });
  }
});

export default router;
