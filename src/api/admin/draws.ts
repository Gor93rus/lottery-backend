import { Router, Request, Response } from "express";
import { adminMiddleware } from "../../lib/auth/adminMiddleware.js";
import { prisma } from "../../lib/prisma.js";
import { sanitizeId } from "../../lib/utils/sanitize.js";
import {
  createDraw,
  lockDraw,
  executeDraw,
  cancelDraw,
} from "../../services/drawEngine.js";
import { createNextDraw } from "../../services/draw/drawLifecycle.js";
import {
  checkAndLockDraws,
  checkAndExecuteDraws,
} from "../../services/scheduler/drawScheduler.js";

const router = Router();

/**
 * GET /api/admin/draws
 * List all draws with filters
 */
router.get("/", adminMiddleware, async (req: Request, res: Response) => {
  try {
    const { lotteryId, status, page = "1", limit = "20" } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    // Build where clause
    const where: Record<string, unknown> = {};
    if (lotteryId) where.lotteryId = lotteryId;
    if (status) where.status = status;

    // Get total count
    const total = await prisma.draw.count({ where });

    // Get draws with pagination
    const draws = await prisma.draw.findMany({
      where,
      skip,
      take: limitNum,
      orderBy: { scheduledAt: "desc" },
      include: {
        lottery: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        _count: {
          select: {
            tickets: true,
          },
        },
      },
    });

    res.json({
      success: true,
      draws: draws.map((draw) => ({
        id: draw.id,
        lottery: draw.lottery,
        drawNumber: draw.drawNumber,
        scheduledAt: draw.scheduledAt.toISOString(),
        executedAt: draw.executedAt?.toISOString() || null,
        winningNumbers: draw.winningNumbers,
        seedHash: draw.seedHash,
        seed: draw.seed,
        totalTickets: draw.totalTickets,
        totalPrizePool: draw.totalPrizePool,
        totalWinners: draw.totalWinners,
        totalPaid: draw.totalPaid,
        status: draw.status,
        ticketsCount: draw._count.tickets,
        createdAt: draw.createdAt.toISOString(),
        updatedAt: draw.updatedAt.toISOString(),
      })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error("Admin draws list error:", {
      lotteryId: req.query.lotteryId
        ? sanitizeId(req.query.lotteryId)
        : undefined,
      status: req.query.status ? String(req.query.status) : undefined,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to fetch draws",
    });
  }
});

/**
 * POST /api/admin/draws
 * Create new draw
 */
router.post("/", adminMiddleware, async (req: Request, res: Response) => {
  try {
    const { lotteryId, drawTime } = req.body;

    // Validate required fields
    if (!lotteryId || !drawTime) {
      res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "lotteryId and drawTime are required",
      });
      return;
    }

    // Check if lottery exists
    const lottery = await prisma.lottery.findUnique({
      where: { id: lotteryId },
      select: {
        id: true,
        name: true,
        slug: true,
      },
    });

    if (!lottery) {
      res.status(404).json({
        success: false,
        error: "Not Found",
        message: "Lottery not found",
      });
      return;
    }

    // Create draw using draw engine
    const result = await createDraw(lotteryId, new Date(drawTime));

    // Get created draw
    const draw = await prisma.draw.findUnique({
      where: { id: result.drawId },
      include: {
        lottery: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    if (!draw) {
      throw new Error("Draw not found after creation");
    }

    res.status(201).json({
      success: true,
      draw: {
        id: draw.id,
        lottery: draw.lottery,
        drawNumber: draw.drawNumber,
        status: draw.status,
        salesOpenAt: draw.salesOpenAt.toISOString(),
        salesCloseAt: draw.salesCloseAt.toISOString(),
        drawTime: draw.drawTime.toISOString(),
        serverSeedHash: draw.serverSeedHash,
        createdAt: draw.createdAt.toISOString(),
        updatedAt: draw.updatedAt.toISOString(),
      },
      // For admin to store securely - this seed will be used during execution
      serverSeed: result.serverSeed,
    });
  } catch (error) {
    console.error("Admin create draw error", {
      lotteryId: req.body.lotteryId
        ? sanitizeId(req.body.lotteryId)
        : undefined,
      drawTime: req.body.drawTime ? String(req.body.drawTime) : undefined,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to create draw",
    });
  }
});

/**
 * POST /api/admin/draws/:id/lock
 * Lock draw sales (called 30 minutes before draw)
 */
router.post(
  "/:id/lock",
  adminMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      await lockDraw(id as string);

      // Get updated draw
      const draw = await prisma.draw.findUnique({
        where: { id: id as string },
        include: {
          lottery: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      });

      if (!draw) {
        throw new Error("Draw not found after locking");
      }

      res.json({
        success: true,
        draw: {
          id: draw.id,
          lottery: draw.lottery,
          drawNumber: draw.drawNumber,
          status: draw.status,
          lockedAt: draw.lockedAt?.toISOString() || null,
          totalTickets: draw.totalTickets,
        },
      });
    } catch (error) {
      console.error("Admin lock draw error", {
        drawId: sanitizeId(req.params.id),
        error: error instanceof Error ? error.message : "Unknown error",
      });
      res.status(500).json({
        success: false,
        error: "Internal Server Error",
        message: error instanceof Error ? error.message : "Failed to lock draw",
      });
    }
  },
);

/**
 * POST /api/admin/draws/:id/execute
 * Execute draw - pick winning numbers and calculate winners
 */
router.post(
  "/:id/execute",
  adminMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { serverSeed } = req.body;

      if (!serverSeed) {
        res.status(400).json({
          success: false,
          error: "Bad Request",
          message: "serverSeed is required",
        });
        return;
      }

      // Execute draw using draw engine
      await executeDraw(id as string, serverSeed);

      // Get final draw state
      const draw = await prisma.draw.findUnique({
        where: { id: id as string },
        include: {
          lottery: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      });

      if (!draw) {
        throw new Error("Draw not found after execution");
      }

      res.json({
        success: true,
        draw: {
          id: draw.id,
          lottery: draw.lottery,
          drawNumber: draw.drawNumber,
          status: draw.status,
          drawTime: draw.drawTime.toISOString(),
          drawnAt: draw.drawnAt?.toISOString() || null,
          completedAt: draw.completedAt?.toISOString() || null,
          winningNumbers: draw.winningNumbers,
          serverSeed: draw.serverSeed,
          serverSeedHash: draw.serverSeedHash,
          clientSeed: draw.clientSeed,
          totalTickets: draw.totalTickets,
          winners: {
            total: draw.totalWinners,
            winners5: draw.winners5,
            winners4: draw.winners4,
            winners3: draw.winners3,
            winners2: draw.winners2,
            winners1: draw.winners1,
          },
          payouts: {
            jackpotAmount: draw.jackpotAmount,
            payout4Amount: draw.payout4Amount,
            payout3Amount: draw.payout3Amount,
            payout2Amount: draw.payout2Amount,
            payout1Amount: draw.payout1Amount,
          },
          totalPaidOut: draw.totalPaidOut,
        },
      });
    } catch (error) {
      console.error("Admin execute draw error", {
        drawId: sanitizeId(req.params.id),
        error: error instanceof Error ? error.message : "Unknown error",
      });
      res.status(500).json({
        success: false,
        error: "Internal Server Error",
        message:
          error instanceof Error ? error.message : "Failed to execute draw",
      });
    }
  },
);

/**
 * POST /api/admin/draws/:id/cancel
 * Cancel a draw
 */
router.post(
  "/:id/cancel",
  adminMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      await cancelDraw(id as string);

      // Get updated draw
      const draw = await prisma.draw.findUnique({
        where: { id: id as string },
        include: {
          lottery: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      });

      if (!draw) {
        throw new Error("Draw not found after cancellation");
      }

      res.json({
        success: true,
        draw: {
          id: draw.id,
          lottery: draw.lottery,
          drawNumber: draw.drawNumber,
          status: draw.status,
          completedAt: draw.completedAt?.toISOString() || null,
        },
      });
    } catch (error) {
      console.error("Admin cancel draw error", {
        drawId: sanitizeId(req.params.id),
        error: error instanceof Error ? error.message : "Unknown error",
      });
      res.status(500).json({
        success: false,
        error: "Internal Server Error",
        message:
          error instanceof Error ? error.message : "Failed to cancel draw",
      });
    }
  },
);

// POST /api/admin/draws/check-locks - Manually check and lock draws
router.post(
  "/check-locks",
  adminMiddleware,
  async (req: Request, res: Response) => {
    try {
      await checkAndLockDraws();
      res.json({ success: true, message: "Lock check completed" });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  },
);

// POST /api/admin/draws/check-execute - Manually check and execute draws
router.post(
  "/check-execute",
  adminMiddleware,
  async (req: Request, res: Response) => {
    try {
      await checkAndExecuteDraws();
      res.json({ success: true, message: "Execute check completed" });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  },
);

// POST /api/admin/lotteries/:id/create-draw - Create next draw manually
router.post(
  "/lotteries/:id/create-draw",
  adminMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const lotteryId = id as string;

      // Get last draw number
      const lastDraw = await prisma.draw.findFirst({
        where: { lotteryId },
        orderBy: { drawNumber: "desc" },
      });

      const newDraw = await createNextDraw(
        lotteryId,
        lastDraw?.drawNumber || 0,
      );
      res.json({ success: true, draw: newDraw });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  },
);

export default router;
