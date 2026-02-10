import { Router, Request, Response } from "express";
import { adminMiddleware } from "../../lib/auth/adminMiddleware.js";
import { prisma } from "../../lib/prisma.js";

const router = Router();

/**
 * GET /api/admin/tickets
 * List all tickets with filters
 */
router.get("/", adminMiddleware, async (req: Request, res: Response) => {
  try {
    const {
      lotteryId,
      userId,
      status,
      drawId,
      page = "1",
      limit = "20",
    } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    // Build where clause
    const where: Record<string, unknown> = {};
    if (lotteryId) where.lotteryId = lotteryId;
    if (userId) where.userId = userId;
    if (status) where.status = status;
    if (drawId) where.drawId = drawId;

    // Get total count
    const total = await prisma.ticket.count({ where });

    // Get tickets with pagination
    const tickets = await prisma.ticket.findMany({
      where,
      skip,
      take: limitNum,
      orderBy: { createdAt: "desc" },
      include: {
        lottery: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        user: {
          select: {
            id: true,
            telegramId: true,
            username: true,
            firstName: true,
            lastName: true,
          },
        },
        draw: {
          select: {
            id: true,
            drawNumber: true,
            scheduledAt: true,
            winningNumbers: true,
            status: true,
          },
        },
      },
    });

    res.json({
      success: true,
      tickets: tickets.map((ticket) => ({
        id: ticket.id,
        lottery: ticket.lottery,
        user: ticket.user,
        draw: ticket.draw,
        numbers: ticket.numbers,
        status: ticket.status,
        matchedNumbers: ticket.matchedNumbers,
        prizeAmount: ticket.prizeAmount,
        prizeClaimed: ticket.prizeClaimed,
        createdAt: ticket.createdAt.toISOString(),
        updatedAt: ticket.updatedAt.toISOString(),
      })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error("Admin tickets list error:", error);
    res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to fetch tickets",
    });
  }
});

export default router;
